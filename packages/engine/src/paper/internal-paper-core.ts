/**
 * InternalPaperCore — unified fill API for funds_only / both_verify internal books
 * and the paper-sim adapter (D-122 Phase 5).
 */

import {
  computeInternalPaperFill,
  DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS,
  type DeterministicActionTask,
  type QuoteSnapshot,
} from '@hftr/contracts';

export {
  computeInternalPaperFill,
  DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS,
} from '@hftr/contracts';

/**
 * Dispatch-facing fill: InternalPaperCore price + deterministic paper venueOrderId.
 */
export function computeInternalPaperCoreFill(
  task: DeterministicActionTask,
  quote: QuoteSnapshot,
  opts?: { slippageBps?: number },
): { ok: true; priceCents: number; venueOrderId: string } | { ok: false; reason: string } {
  const result = computeInternalPaperFill({
    actionVerb: task.actionVerb === 'sell' ? 'sell' : 'buy',
    orderType: task.orderType === 'limit' ? 'limit' : 'market',
    limitPriceCents: task.limitPriceCents,
    quote,
    ...(opts?.slippageBps !== undefined ? { slippageBps: opts.slippageBps } : {}),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    priceCents: result.priceCents,
    venueOrderId: `psim_${task.idempotencyKey.slice(7, 19)}`,
  };
}
