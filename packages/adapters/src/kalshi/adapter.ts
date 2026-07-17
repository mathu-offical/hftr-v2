import type {
  AdapterCapabilities,
  BalanceSnapshot,
  BrokerAdapter,
  ConnectionStatus,
  DeterministicActionTask,
  FillRecord,
  QuoteSnapshot,
  SubmitResult,
} from '@hftr/contracts';
import { createKalshiClient, dollarsToCents, type KalshiClient } from './client';
import { mapTaskToKalshiOrder } from './map-order';

/** Demo simulation starting balance — not a real Kalshi account. */
export const KALSHI_DEMO_STARTING_CASH_CENTS = 1_000_000;

/** Synthetic mid for event-contract quotes in demo mode (50¢). */
export const KALSHI_DEMO_SYNTHETIC_MID_CENTS = 50;

export interface KalshiDemoAdapterOptions {
  nowMs: () => number;
  /** When true, allows paper/demo paths; live mode always fails closed. */
  demoMode: boolean;
  /** Force in-memory simulation even when credentials are present. */
  simulationOnly?: boolean;
  /** Demo API key id — when set with privateKeyPem, uses real Kalshi demo HTTP. */
  apiKeyId?: string;
  privateKeyPem?: string;
  client?: KalshiClient;
  /** In-memory demo cash; defaults to $10,000. */
  startingCashCents?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Kalshi demo adapter — prefers the real Kalshi demo API when credentials are
 * present; falls back to in-memory simulation otherwise. Live is always blocked.
 */
export function createKalshiDemoAdapter(opts: KalshiDemoAdapterOptions): BrokerAdapter {
  if (!opts.demoMode) {
    throw new Error('kalshi_live_not_supported');
  }

  const useHttp = !opts.simulationOnly && Boolean(opts.apiKeyId && opts.privateKeyPem);

  const client = useHttp
    ? (opts.client ??
      createKalshiClient({
        apiKeyId: opts.apiKeyId!,
        privateKeyPem: opts.privateKeyPem!,
        demoMode: true,
        nowMs: opts.nowMs,
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      }))
    : null;

  let cashCents = opts.startingCashCents ?? KALSHI_DEMO_STARTING_CASH_CENTS;
  const fills: FillRecord[] = [];
  let orderSeq = 0;

  function syntheticQuote(symbol: string): QuoteSnapshot {
    const mid = KALSHI_DEMO_SYNTHETIC_MID_CENTS;
    return {
      symbol,
      bidCents: mid - 1,
      askCents: mid + 1,
      lastCents: mid,
      asOfIso: new Date(opts.nowMs()).toISOString(),
      feedClass: client ? 'kalshi_demo' : 'kalshi_demo_simulation',
    };
  }

  function fillPriceCents(task: DeterministicActionTask, quote: QuoteSnapshot): number | null {
    const isBuy = task.actionVerb === 'buy';
    const side = isBuy ? quote.askCents : quote.bidCents;
    const reference = side ?? quote.lastCents;
    if (reference === null) return null;
    if (task.orderType === 'limit' && task.limitPriceCents !== null) {
      if (isBuy && reference > task.limitPriceCents) return null;
      if (!isBuy && reference < task.limitPriceCents) return null;
    }
    return reference;
  }

  return {
    venue: 'kalshi',
    mode: 'paper',

    capabilities(): AdapterCapabilities {
      return {
        venue: 'kalshi',
        assets: ['event_contract'],
        orderTypes: ['limit'],
        sessions: 'around_the_clock',
        supportsPaper: true,
        supportsFractional: false,
        fundingUx: 'deep_link',
      };
    },

    async verifyConnection(): Promise<ConnectionStatus> {
      if (!client) return 'connected';
      try {
        const ok = await client.verifyConnection();
        return ok ? 'connected' : 'error';
      } catch {
        return 'error';
      }
    },

    async getBalances(): Promise<BalanceSnapshot> {
      if (!client) {
        return {
          cashCents,
          buyingPowerCents: cashCents,
          asOfIso: new Date(opts.nowMs()).toISOString(),
        };
      }
      const bal = await client.getBalance();
      const asOfMs = bal.updated_ts > 1e12 ? bal.updated_ts : bal.updated_ts * 1000;
      return {
        cashCents: bal.balance,
        buyingPowerCents: bal.balance,
        asOfIso: new Date(asOfMs).toISOString(),
      };
    },

    async getQuote(symbol: string): Promise<QuoteSnapshot> {
      if (!client) return syntheticQuote(symbol);
      try {
        const { market } = await client.getMarket(symbol);
        return {
          symbol,
          bidCents: dollarsToCents(market.yes_bid_dollars),
          askCents: dollarsToCents(market.yes_ask_dollars),
          lastCents: dollarsToCents(market.last_price_dollars),
          asOfIso: new Date(opts.nowMs()).toISOString(),
          feedClass: 'kalshi_demo',
        };
      } catch {
        return syntheticQuote(symbol);
      }
    },

    async submitOrder(task: DeterministicActionTask): Promise<SubmitResult> {
      switch (task.actionVerb) {
        case 'buy':
        case 'sell':
          break;
        case 'cancel':
        case 'replace':
        case 'close_position':
          return {
            accepted: false,
            venueOrderId: null,
            rejectReason: 'unsupported_action_verb',
          };
        default: {
          const _exhaustive: never = task.actionVerb;
          return {
            accepted: false,
            venueOrderId: null,
            rejectReason: `unsupported_action_verb:${String(_exhaustive)}`,
          };
        }
      }

      if (client) {
        const body = mapTaskToKalshiOrder(task, task.clientOrderId ?? task.idempotencyKey);
        if (!body) {
          return { accepted: false, venueOrderId: null, rejectReason: 'unsupported_order_type' };
        }
        try {
          const order = await client.placeOrder(body);
          return {
            accepted: true,
            venueOrderId: order.order_id,
            rejectReason: null,
            clientOrderId: order.client_order_id ?? task.clientOrderId ?? task.idempotencyKey,
          };
        } catch {
          return { accepted: false, venueOrderId: null, rejectReason: 'kalshi_order_rejected' };
        }
      }

      if (task.orderType !== 'limit') {
        return {
          accepted: false,
          venueOrderId: null,
          rejectReason: 'unsupported_order_type',
        };
      }

      const quote = syntheticQuote(task.symbol);
      const priceCents = fillPriceCents(task, quote);
      if (priceCents === null) {
        return { accepted: false, venueOrderId: null, rejectReason: 'unmarketable' };
      }

      const qty = BigInt(task.quantityInt);
      const scaleFactor = 10n ** BigInt(task.quantityScale);
      const notionalCents = Number((qty * BigInt(priceCents)) / scaleFactor);
      if (task.actionVerb === 'buy' && notionalCents > cashCents) {
        return { accepted: false, venueOrderId: null, rejectReason: 'insufficient_funds' };
      }

      orderSeq += 1;
      const venueOrderId = `kdemo_${orderSeq}_${task.idempotencyKey.slice(0, 8)}`;
      cashCents += task.actionVerb === 'buy' ? -notionalCents : notionalCents;
      fills.push({
        venueOrderId,
        qtyInt: task.quantityInt,
        qtyScale: task.quantityScale,
        priceCents,
        atIso: new Date(opts.nowMs()).toISOString(),
      });
      return {
        accepted: true,
        venueOrderId,
        rejectReason: null,
        clientOrderId: task.clientOrderId ?? task.idempotencyKey,
      };
    },

    async cancelOrder(venueOrderId: string): Promise<SubmitResult> {
      if (client) {
        return { accepted: false, venueOrderId, rejectReason: 'cancel_not_implemented' };
      }
      return { accepted: false, venueOrderId, rejectReason: 'already_filled' };
    },

    async getFills(sinceIso: string): Promise<FillRecord[]> {
      if (client) return [];
      return fills.filter((f) => f.atIso >= sinceIso);
    },
  };
}

/** Fail-closed guard for live Kalshi connections — not enabled in M5 slice. */
export function assertKalshiDemoOnly(mode: 'paper' | 'live', demoMode: boolean): void {
  if (mode === 'live' || !demoMode) {
    throw new Error('live_gate_blocked');
  }
}
