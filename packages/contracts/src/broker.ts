import { z } from 'zod';
import { DeterministicActionTask } from './pipeline';

/**
 * Broker adapter contracts (agent-docs/architecture/broker-integration.md).
 * Adapters differ by policy/behavior only; engine semantics are identical.
 */

export const Venue = z.enum(['paper_sim', 'alpaca', 'kalshi', 'polymarket', 'coinbase']);
export type Venue = z.infer<typeof Venue>;

export const ConnectionStatus = z.enum(['connected', 'error', 'revoked', 'unverified']);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

export const AdapterCapabilities = z.object({
  venue: Venue,
  assets: z.array(z.enum(['us_equity', 'crypto', 'event_contract'])),
  orderTypes: z.array(z.enum(['market', 'limit', 'stop', 'stop_limit'])),
  sessions: z.enum(['rth_only', 'extended', 'around_the_clock']),
  supportsPaper: z.boolean(),
  supportsFractional: z.boolean(),
  fundingUx: z.enum(['deep_link', 'in_app', 'none']),
});
export type AdapterCapabilities = z.infer<typeof AdapterCapabilities>;

export const BalanceSnapshot = z.object({
  cashCents: z.number().int(),
  buyingPowerCents: z.number().int(),
  asOfIso: z.string().datetime(),
});
export type BalanceSnapshot = z.infer<typeof BalanceSnapshot>;

export const QuoteSnapshot = z.object({
  symbol: z.string(),
  bidCents: z.number().int().nullable(),
  askCents: z.number().int().nullable(),
  lastCents: z.number().int().nullable(),
  asOfIso: z.string().datetime(),
  feedClass: z.string(), // entitlement truthfulness: always labeled
});
export type QuoteSnapshot = z.infer<typeof QuoteSnapshot>;

export const SubmitResult = z.object({
  accepted: z.boolean(),
  venueOrderId: z.string().nullable(),
  rejectReason: z.string().nullable(),
  clientOrderId: z.string().nullable().optional(),
  requestId: z.string().nullable().optional(),
});
export type SubmitResult = z.infer<typeof SubmitResult>;

export const FillRecord = z.object({
  venueOrderId: z.string(),
  qtyInt: z.string(),
  qtyScale: z.number().int(),
  priceCents: z.number().int(),
  atIso: z.string().datetime(),
});
export type FillRecord = z.infer<typeof FillRecord>;

export const PositionSnapshot = z.object({
  symbol: z.string(),
  qtyInt: z.string(),
  qtyScale: z.number().int(),
  avgEntryCents: z.number().int().nullable(),
  marketValueCents: z.number().int().nullable(),
});
export type PositionSnapshot = z.infer<typeof PositionSnapshot>;

export const OrderStatus = z.enum([
  'accepted',
  'pending_new',
  'new',
  'partially_filled',
  'filled',
  'canceled',
  'expired',
  'rejected',
  'unknown',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const BrokerOrderSnapshot = z.object({
  venueOrderId: z.string(),
  clientOrderId: z.string().nullable(),
  status: OrderStatus,
  filledQtyInt: z.string().nullable(),
  filledQtyScale: z.number().int().nonnegative().nullable(),
  avgFillPriceCents: z.number().int().nullable(),
  rawStatus: z.string().nullable(),
  asOfIso: z.string().datetime(),
});
export type BrokerOrderSnapshot = z.infer<typeof BrokerOrderSnapshot>;

/**
 * The adapter interface. `submitOrder` may ONLY be called by the deterministic
 * dispatch layer (packages/engine/dispatch) — enforced by review + tests, and
 * by the fact that only dispatch imports adapter instances.
 */
export interface BrokerAdapter {
  readonly venue: Venue;
  readonly mode: 'paper' | 'live';
  capabilities(): AdapterCapabilities;
  verifyConnection(): Promise<ConnectionStatus>;
  getBalances(): Promise<BalanceSnapshot>;
  getQuote(symbol: string): Promise<QuoteSnapshot>;
  /**
   * Optional historical quote near `atIso` (ISO-8601). Used by trend lookback
   * when live_api is bound to a venue that supports bars (Alpaca paper).
   */
  getQuoteAt?(symbol: string, atIso: string): Promise<QuoteSnapshot>;
  submitOrder(task: DeterministicActionTask): Promise<SubmitResult>;
  cancelOrder(venueOrderId: string): Promise<SubmitResult>;
  getFills(sinceIso: string): Promise<FillRecord[]>;
  getOrderByClientId?(clientOrderId: string): Promise<BrokerOrderSnapshot | null>;
  getPositions?(): Promise<PositionSnapshot[]>;
}
