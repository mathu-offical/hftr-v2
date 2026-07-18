/**
 * Internal paper trade engine contracts (D-122).
 * Design: docs/superpowers/specs/2026-07-18-internal-paper-trade-engine-design.md
 */

import { z } from 'zod';

/** Per-engine order routing when a real service may be bound. */
export const PaperRoutingMode = z.enum([
  'funds_only',
  'execute_on_service',
  'both_verify',
]);
export type PaperRoutingMode = z.infer<typeof PaperRoutingMode>;

/**
 * Operator binding for an execution engine (trading module).
 * Default routing is funds_only — safest: no provider order traffic until elevated.
 */
export const EngineExecutionBinding = z.object({
  routingMode: PaperRoutingMode.default('funds_only'),
  /**
   * Optional dedicated broker connection. When null/omitted, inherit
   * `companies.broker_connection_id` for funds/quotes only.
   */
  brokerConnectionId: z.string().uuid().nullable().optional(),
  /** When a provider is available, treat its ledger as an added funds source. */
  useProviderLedgerAsFundsSource: z.boolean().default(true),
});
export type EngineExecutionBinding = z.infer<typeof EngineExecutionBinding>;

export const BookDeltaDimensionKind = z.enum([
  'fill_price_bps',
  'latency_ms',
  'partial_fill_qty',
  'mark_bps',
  'reject_code',
  'cash_cents',
  'position_qty',
]);
export type BookDeltaDimensionKind = z.infer<typeof BookDeltaDimensionKind>;

export const BookDeltaDimension = z.object({
  kind: BookDeltaDimensionKind,
  /** Internal paper-engine observation (numeric as string for bigints where needed). */
  internalValue: z.union([z.number(), z.string()]),
  /** Reference observation (live market or provider book). */
  referenceValue: z.union([z.number(), z.string()]).nullable(),
  unit: z.string().min(1).max(32),
});
export type BookDeltaDimension = z.infer<typeof BookDeltaDimension>;

/** Linked dual-book delta for training / weighting (both_verify and sim-vs-live). */
export const BookDelta = z.object({
  companyId: z.string().uuid(),
  engineModuleId: z.string().uuid(),
  instructionId: z.string().uuid().nullable().optional(),
  traceId: z.string().uuid().nullable().optional(),
  routingMode: PaperRoutingMode,
  dimensions: z.array(BookDeltaDimension).min(1),
  feedClassInternal: z.string().min(1).max(64).optional(),
  feedClassReference: z.string().min(1).max(64).nullable().optional(),
  recordedAtIso: z.string().datetime().optional(),
});
export type BookDelta = z.infer<typeof BookDelta>;

/** Resolve binding from trading module config; missing → funds_only defaults. */
export function resolveTradingExecutionBinding(
  config: { executionBinding?: EngineExecutionBinding | null } | null | undefined,
): EngineExecutionBinding {
  return EngineExecutionBinding.parse(config?.executionBinding ?? {});
}

/**
 * Whether dispatch should submit orders to the bound provider venue
 * (primary book or shadow verify).
 */
export function shouldSubmitToProvider(routingMode: PaperRoutingMode): boolean {
  switch (routingMode) {
    case 'funds_only':
      return false;
    case 'execute_on_service':
    case 'both_verify':
      return true;
    default: {
      const _exhaustive: never = routingMode;
      return _exhaustive;
    }
  }
}

/**
 * Provider venue is the HFTR book of record (apply provider fills to ledger).
 * `both_verify` is false — internal fill is authoritative; provider is shadow.
 */
export function usesProviderAsPrimaryBook(routingMode: PaperRoutingMode): boolean {
  switch (routingMode) {
    case 'execute_on_service':
      return true;
    case 'funds_only':
    case 'both_verify':
      return false;
    default: {
      const _exhaustive: never = routingMode;
      return _exhaustive;
    }
  }
}

/** Internal fill + provider submit for linked BookDelta (does not replace HFTR book). */
export function shouldShadowVerifyOnProvider(routingMode: PaperRoutingMode): boolean {
  switch (routingMode) {
    case 'both_verify':
      return true;
    case 'funds_only':
    case 'execute_on_service':
      return false;
    default: {
      const _exhaustive: never = routingMode;
      return _exhaustive;
    }
  }
}

/**
 * Fill-price divergence in bps of internal vs reference (provider) price.
 * Positive when reference is worse for a buy (higher) / better for a sell (higher).
 */
export function fillPriceDeltaBps(args: {
  internalPriceCents: number;
  referencePriceCents: number;
}): number {
  const base = Math.max(1, args.internalPriceCents);
  return Math.round(((args.referencePriceCents - args.internalPriceCents) * 10_000) / base);
}

/** Build a fill_price_bps BookDeltaDimension from internal vs provider fills. */
export function buildFillPriceBookDeltaDimension(args: {
  internalPriceCents: number;
  referencePriceCents: number;
}): BookDeltaDimension {
  return {
    kind: 'fill_price_bps',
    internalValue: args.internalPriceCents,
    referenceValue: args.referencePriceCents,
    unit: 'cents',
  };
}

/** Default taker slippage for InternalPaperCore / paper-sim (2 bps). */
export const DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS = 2;

export type InternalPaperFillQuote = {
  bidCents: number | null;
  askCents: number | null;
  lastCents: number | null;
};

/**
 * Pure InternalPaperCore fill price (D-122 Phase 5).
 * Shared by dispatch inline fills and the paper-sim adapter — identical slippage/limit rules.
 */
export function computeInternalPaperFill(args: {
  actionVerb: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  limitPriceCents: number | null;
  quote: InternalPaperFillQuote;
  /** Slippage in basis points against the taker side (default 2). */
  slippageBps?: number;
}): { ok: true; priceCents: number } | { ok: false; reason: 'no_quote' | 'unmarketable' } {
  const isBuy = args.actionVerb === 'buy';
  const side = isBuy ? args.quote.askCents : args.quote.bidCents;
  const reference = side ?? args.quote.lastCents;
  if (reference === null) return { ok: false, reason: 'no_quote' };
  const slippageBps = args.slippageBps ?? DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS;
  const slip = Math.max(0, Math.round((reference * slippageBps) / 10_000));
  const priceCents = isBuy ? reference + slip : Math.max(1, reference - slip);
  if (args.orderType === 'limit' && args.limitPriceCents !== null) {
    if (isBuy && priceCents > args.limitPriceCents) return { ok: false, reason: 'unmarketable' };
    if (!isBuy && priceCents < args.limitPriceCents) return { ok: false, reason: 'unmarketable' };
  }
  return { ok: true, priceCents };
}

export const EngineSpendSource = z.enum([
  'company_pool',
  'engine_allocation',
  'engine_ledger',
  'module_unscoped',
]);
export type EngineSpendSource = z.infer<typeof EngineSpendSource>;

/**
 * Dispatch spend authority (D-122 Phase 3).
 * Engine-scoped modules cannot spend beyond their envelope / book while company
 * pool may still have cash allocated to other engines.
 */
export const EngineSpendAuthority = z.object({
  spendCapCents: z.string(), // bigint as decimal string for JSON
  companyPoolCents: z.string(),
  engineLedgerCents: z.string(),
  allocationCapCents: z.string().nullable(),
  engineInstanceId: z.string().uuid().nullable(),
  source: EngineSpendSource,
  isolationActive: z.boolean(),
});
export type EngineSpendAuthority = z.infer<typeof EngineSpendAuthority>;

/**
 * Pure spend-cap math for engine capital isolation (unit-testable).
 *
 * - Unscoped (no engine): company pool (legacy).
 * - Engine-scoped with ledger credits (>0): min(pool, ledger, envelope?).
 * - Engine-scoped with allocation envelope: min(pool, envelope).
 * - Engine-scoped with neither: company pool legacy fallback (migration-safe).
 */
export function computeEngineSpendCapCents(args: {
  companyPoolCents: bigint;
  engineLedgerCents: bigint;
  allocationCapCents: bigint | null;
  engineScoped: boolean;
}): {
  spendCapCents: bigint;
  source: EngineSpendSource;
  isolationActive: boolean;
} {
  const { companyPoolCents, engineLedgerCents, allocationCapCents, engineScoped } = args;
  const pool = companyPoolCents < 0n ? 0n : companyPoolCents;

  if (!engineScoped) {
    return {
      spendCapCents: pool,
      source: 'company_pool',
      isolationActive: false,
    };
  }

  const ledger = engineLedgerCents;
  const envelope = allocationCapCents;

  if (ledger > 0n) {
    const capped = envelope != null ? (ledger < envelope ? ledger : envelope) : ledger;
    const spend = capped < pool ? capped : pool;
    return {
      spendCapCents: spend < 0n ? 0n : spend,
      source: 'engine_ledger',
      isolationActive: envelope != null || spend < pool,
    };
  }

  if (envelope != null) {
    const spend = envelope < pool ? envelope : pool;
    return {
      spendCapCents: spend < 0n ? 0n : spend,
      source: 'engine_allocation',
      isolationActive: spend < pool,
    };
  }

  return {
    spendCapCents: pool,
    source: 'company_pool',
    isolationActive: false,
  };
}
