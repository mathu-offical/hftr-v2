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
import { computeInternalPaperFill } from '@hftr/contracts';

/**
 * Deterministic paper simulator adapter. Fills orders against an injected
 * quote source with a seeded slippage model, so simulation runs replay
 * identically. Used by the M1-M3 paper loop and by engine tests.
 * Fill price math is InternalPaperCore (`computeInternalPaperFill`, D-122 Phase 5).
 */

export interface PaperSimOptions {
  /** Deterministic clock injection — epoch ms provider. */
  nowMs: () => number;
  /** Quote source; tests inject fixtures, runtime injects live_api snapshots. */
  getQuote: (symbol: string) => QuoteSnapshot | null;
  startingCashCents: number;
  /** Slippage in basis points applied against the taker (default 2 bps). */
  slippageBps?: number;
}

export function createPaperSimAdapter(opts: PaperSimOptions): BrokerAdapter {
  let cashCents = opts.startingCashCents;
  const fills: FillRecord[] = [];
  const slippageBps = opts.slippageBps;
  let orderSeq = 0;

  return {
    venue: 'paper_sim',
    mode: 'paper',

    capabilities(): AdapterCapabilities {
      return {
        venue: 'paper_sim',
        assets: ['us_equity', 'crypto'],
        orderTypes: ['market', 'limit'],
        sessions: 'around_the_clock',
        supportsPaper: true,
        supportsFractional: true,
        fundingUx: 'none',
      };
    },

    async verifyConnection(): Promise<ConnectionStatus> {
      return 'connected';
    },

    async getBalances(): Promise<BalanceSnapshot> {
      return {
        cashCents,
        buyingPowerCents: cashCents,
        asOfIso: new Date(opts.nowMs()).toISOString(),
      };
    },

    async getQuote(symbol: string): Promise<QuoteSnapshot> {
      const quote = opts.getQuote(symbol);
      if (!quote) throw new Error(`paper-sim: no quote for ${symbol}`);
      return quote;
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

      const quote = opts.getQuote(task.symbol);
      if (!quote) {
        return { accepted: false, venueOrderId: null, rejectReason: 'no_quote' };
      }
      const fill = computeInternalPaperFill({
        actionVerb: task.actionVerb,
        orderType: task.orderType === 'limit' ? 'limit' : 'market',
        limitPriceCents: task.limitPriceCents,
        quote,
        ...(slippageBps !== undefined ? { slippageBps } : {}),
      });
      if (!fill.ok) {
        return { accepted: false, venueOrderId: null, rejectReason: fill.reason };
      }
      const priceCents = fill.priceCents;

      const qty = BigInt(task.quantityInt);
      const scaleFactor = 10n ** BigInt(task.quantityScale);
      const notionalCents = Number((qty * BigInt(priceCents)) / scaleFactor);
      if (task.actionVerb === 'buy' && notionalCents > cashCents) {
        return { accepted: false, venueOrderId: null, rejectReason: 'insufficient_funds' };
      }

      orderSeq += 1;
      const venueOrderId = `psim_${orderSeq}_${task.idempotencyKey.slice(0, 8)}`;
      cashCents += task.actionVerb === 'buy' ? -notionalCents : notionalCents;
      fills.push({
        venueOrderId,
        qtyInt: task.quantityInt,
        qtyScale: task.quantityScale,
        priceCents,
        atIso: new Date(opts.nowMs()).toISOString(),
      });
      return { accepted: true, venueOrderId, rejectReason: null };
    },

    async cancelOrder(venueOrderId: string): Promise<SubmitResult> {
      // Fills are immediate in the sim, so cancel always misses.
      return { accepted: false, venueOrderId, rejectReason: 'already_filled' };
    },

    async getFills(sinceIso: string): Promise<FillRecord[]> {
      return fills.filter((f) => f.atIso >= sinceIso);
    },
  };
}
