import type {
  AdapterCapabilities,
  BalanceSnapshot,
  BrokerAdapter,
  BrokerOrderSnapshot,
  ConnectionStatus,
  DeterministicActionTask,
  FillRecord,
  OrderStatus,
  PositionSnapshot,
  QuoteSnapshot,
  SubmitResult,
} from '@hftr/contracts';
import { createAlpacaClient, type AlpacaClient } from './client';
import { mapTaskToAlpacaOrder } from './map-order';

interface AlpacaAccount {
  account_number: string;
  cash: string;
  buying_power: string;
  trading_blocked: boolean;
  status: string;
}

interface AlpacaOrder {
  id: string;
  client_order_id: string;
  status: string;
  filled_qty: string;
  filled_avg_price: string | null;
  symbol: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  market_value: string;
}

interface AlpacaQuoteResponse {
  quote: {
    ap: number;
    bp: number;
    t: string;
  };
}

interface AlpacaActivity {
  id: string;
  activity_type: string;
  order_id: string;
  price: string;
  qty: string;
  transaction_time: string;
}

export interface AlpacaAdapterOptions {
  keyId: string;
  secret: string;
  mode: 'paper' | 'live';
  nowMs: () => number;
  client?: AlpacaClient;
}

function parseDecimalQty(qty: string): { qtyInt: string; qtyScale: number } {
  if (!qty.includes('.')) return { qtyInt: qty, qtyScale: 0 };
  const [whole = '0', frac = ''] = qty.split('.');
  return { qtyInt: `${whole}${frac}`, qtyScale: frac.length };
}

function dollarsToCents(dollars: string | number): number {
  const n = typeof dollars === 'string' ? Number.parseFloat(dollars) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function mapOrderStatus(raw: string): OrderStatus {
  switch (raw) {
    case 'accepted':
    case 'accepted_for_bidding':
      return 'accepted';
    case 'pending_new':
      return 'pending_new';
    case 'new':
      return 'new';
    case 'partially_filled':
      return 'partially_filled';
    case 'filled':
      return 'filled';
    case 'canceled':
    case 'pending_cancel':
      return 'canceled';
    case 'expired':
    case 'done_for_day':
      return 'expired';
    case 'rejected':
    case 'stopped':
      return 'rejected';
    default:
      return 'unknown';
  }
}

function mapOrderSnapshot(order: AlpacaOrder, atMs: number): BrokerOrderSnapshot {
  const filledQty =
    order.filled_qty && Number.parseFloat(order.filled_qty) > 0 ? order.filled_qty : null;
  return {
    venueOrderId: order.id,
    clientOrderId: order.client_order_id ?? null,
    status: mapOrderStatus(order.status),
    filledQtyInt: filledQty,
    filledQtyScale: filledQty?.includes('.') ? (filledQty.split('.')[1]?.length ?? 0) : 0,
    avgFillPriceCents:
      order.filled_avg_price !== null ? dollarsToCents(order.filled_avg_price) : null,
    rawStatus: order.status,
    asOfIso: new Date(atMs).toISOString(),
  };
}

export function createAlpacaAdapter(opts: AlpacaAdapterOptions): BrokerAdapter {
  if (opts.mode === 'live') {
    throw new Error('live_gate_blocked');
  }

  const client = opts.client ?? createAlpacaClient({ keyId: opts.keyId, secret: opts.secret });
  const mode = opts.mode;

  return {
    venue: 'alpaca',
    mode,

    capabilities(): AdapterCapabilities {
      return {
        venue: 'alpaca',
        assets: ['us_equity', 'crypto'],
        orderTypes: ['market', 'limit', 'stop', 'stop_limit'],
        sessions: 'extended',
        supportsPaper: true,
        supportsFractional: true,
        fundingUx: 'deep_link',
      };
    },

    async verifyConnection(): Promise<ConnectionStatus> {
      const res = await client.getTrading<AlpacaAccount>('/v2/account');
      if (!res.ok || !res.data) return 'error';
      if (res.data.trading_blocked) return 'error';
      if (res.data.status !== 'ACTIVE') return 'error';
      return 'connected';
    },

    async getBalances(): Promise<BalanceSnapshot> {
      const res = await client.getTrading<AlpacaAccount>('/v2/account');
      if (!res.ok || !res.data) {
        throw new Error('alpaca_balances_unavailable');
      }
      return {
        cashCents: dollarsToCents(res.data.cash),
        buyingPowerCents: dollarsToCents(res.data.buying_power),
        asOfIso: new Date(opts.nowMs()).toISOString(),
      };
    },

    async getQuote(symbol: string): Promise<QuoteSnapshot> {
      const upper = symbol.toUpperCase();
      const res = await client.getData<AlpacaQuoteResponse>(
        `/v2/stocks/${encodeURIComponent(upper)}/quotes/latest?feed=iex`,
      );
      if (!res.ok || !res.data?.quote) {
        throw new Error(`alpaca_quote_unavailable:${upper}`);
      }
      const q = res.data.quote;
      const last = q.ap && q.bp ? Math.round(((q.ap + q.bp) / 2) * 100) : null;
      return {
        symbol: upper,
        bidCents: q.bp != null ? dollarsToCents(q.bp) : null,
        askCents: q.ap != null ? dollarsToCents(q.ap) : null,
        lastCents: last,
        asOfIso: q.t ?? new Date(opts.nowMs()).toISOString(),
        feedClass: 'alpaca_iex_paper',
      };
    },

    async submitOrder(task: DeterministicActionTask): Promise<SubmitResult> {
      const body = mapTaskToAlpacaOrder(task);
      const res = await client.postTrading<AlpacaOrder>('/v2/orders', body);
      if (!res.ok || !res.data) {
        const reason = res.errorBody?.includes('insufficient')
          ? 'insufficient_funds'
          : 'venue_rejected';
        return {
          accepted: false,
          venueOrderId: null,
          rejectReason: reason,
          clientOrderId: body.client_order_id,
          requestId: res.requestId,
        };
      }
      const terminalReject = res.data.status === 'rejected';
      return {
        accepted: !terminalReject,
        venueOrderId: res.data.id,
        rejectReason: terminalReject ? 'venue_rejected' : null,
        clientOrderId: res.data.client_order_id ?? body.client_order_id,
        requestId: res.requestId,
      };
    },

    async cancelOrder(venueOrderId: string): Promise<SubmitResult> {
      const res = await client.deleteTrading<AlpacaOrder>(`/v2/orders/${venueOrderId}`);
      if (!res.ok) {
        return {
          accepted: false,
          venueOrderId,
          rejectReason: 'cancel_failed',
          requestId: res.requestId,
        };
      }
      return {
        accepted: true,
        venueOrderId,
        rejectReason: null,
        requestId: res.requestId,
      };
    },

    async getFills(sinceIso: string): Promise<FillRecord[]> {
      const res = await client.getTrading<AlpacaActivity[]>(
        `/v2/account/activities/FILL?after=${encodeURIComponent(sinceIso)}`,
      );
      if (!res.ok || !res.data) return [];
      return res.data
        .filter((a) => a.activity_type === 'FILL')
        .map((a) => {
          const parsed = parseDecimalQty(a.qty);
          return {
            venueOrderId: a.order_id,
            qtyInt: parsed.qtyInt,
            qtyScale: parsed.qtyScale,
            priceCents: dollarsToCents(a.price),
            atIso: a.transaction_time,
          };
        });
    },

    async getOrderByClientId(clientOrderId: string): Promise<BrokerOrderSnapshot | null> {
      const res = await client.getTrading<AlpacaOrder>(
        `/v2/orders:client_order_id/${encodeURIComponent(clientOrderId)}`,
      );
      if (res.status === 404) return null;
      if (!res.ok || !res.data) return null;
      return mapOrderSnapshot(res.data, opts.nowMs());
    },

    async getPositions(): Promise<PositionSnapshot[]> {
      const res = await client.getTrading<AlpacaPosition[]>('/v2/positions');
      if (!res.ok || !res.data) return [];
      return res.data.map((p) => {
        const parsed = parseDecimalQty(p.qty);
        return {
          symbol: p.symbol,
          qtyInt: parsed.qtyInt,
          qtyScale: parsed.qtyScale,
          avgEntryCents: dollarsToCents(p.avg_entry_price),
          marketValueCents: dollarsToCents(p.market_value),
        };
      });
    },
  };
}

/** Paper-only factory — live mode is rejected until the live gate ships. */
export function createAlpacaPaperAdapter(opts: Omit<AlpacaAdapterOptions, 'mode'>): BrokerAdapter {
  return createAlpacaAdapter({ ...opts, mode: 'paper' });
}

/** Read Alpaca account number after a successful verify (for exclusivity binding). */
export async function fetchAlpacaAccountId(client: AlpacaClient): Promise<string | null> {
  const res = await client.getTrading<AlpacaAccount>('/v2/account');
  if (!res.ok || !res.data) return null;
  return res.data.account_number;
}
