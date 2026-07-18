import { z } from 'zod';

/**
 * Company auto-fund policy (D-093). Fail-closed default: off.
 * When `propose_on_equity_refresh`, equity.refresh walks fund_route topology and
 * inserts `requested` fund_transfers for operator approval — never auto-settles.
 */
export const AutoFundPolicy = z.object({
  mode: z.enum(['off', 'propose_on_equity_refresh']).default('off'),
  /** Share of fresh equity cents to propose along each path (1–10_000). */
  amountBps: z.number().int().min(1).max(10_000).default(100),
});

export type AutoFundPolicy = z.infer<typeof AutoFundPolicy>;

export function parseAutoFundPolicy(raw: unknown): AutoFundPolicy {
  const parsed = AutoFundPolicy.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { mode: 'off', amountBps: 100 };
}
