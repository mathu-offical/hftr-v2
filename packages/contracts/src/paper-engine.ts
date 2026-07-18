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

/** Whether dispatch should submit orders to the bound provider venue. */
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
