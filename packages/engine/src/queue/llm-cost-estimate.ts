import { TIER_PROVIDER } from '@hftr/contracts';
import type { JobCostEstimate } from './budget-admission';

/** Rough per-job LLM cost envelope for budget admission (not billing truth). */
export function estimateLlmJobCost(kind: string): JobCostEstimate {
  switch (kind) {
    case 'research.curate':
    case 'research.strategic':
      return {
        provider: TIER_PROVIDER.strategic,
        estimatedCalls: 1,
        estimatedCostCents: 5,
      };
    case 'tactical.expand':
      return {
        provider: TIER_PROVIDER.tactical,
        estimatedCalls: 1,
        estimatedCostCents: 2,
      };
    case 'compile.select':
      return {
        provider: TIER_PROVIDER.execution,
        estimatedCalls: 1,
        estimatedCostCents: 1,
      };
    case 'trend.promote':
      // Deterministic admission gate — no model call on this kind.
      return {};
    default:
      return {};
  }
}
