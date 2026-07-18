import type { SessionPhase } from '@hftr/contracts';

/**
 * Fifteen-second equity fallback refresh planning (company-equity plan Task 6).
 * Pure helpers only — handlers enqueue using these keys; calendar decides deferral.
 */

export const EQUITY_REFRESH_INTERVAL_MS = 15_000;

/** UTC window bucket for idempotent enqueue (one job per company per 15s window). */
export function equityRefreshWindowKey(
  nowMs: number,
  intervalMs = EQUITY_REFRESH_INTERVAL_MS,
): string {
  return String(Math.floor(nowMs / intervalMs));
}

export function equityRefreshIdempotencyKey(
  companyId: string,
  nowMs: number,
  intervalMs = EQUITY_REFRESH_INTERVAL_MS,
): string {
  return `equity-refresh-${companyId}-${equityRefreshWindowKey(nowMs, intervalMs)}`;
}

/**
 * Live quote marks are only meaningful during open market phases.
 * Closed / overnight / pre_market companies defer until the next open window.
 */
export function shouldScheduleEquityRefresh(phase: SessionPhase): boolean {
  switch (phase) {
    case 'open':
    case 'midday':
    case 'power_hour':
      return true;
    case 'pre_market':
    case 'overnight':
    case 'closed':
      return false;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export type EquityRefreshPlanItem = {
  companyId: string;
  idempotencyKey: string;
};

/**
 * Plan idempotent refresh jobs for active companies when the venue session is open.
 * Duplicate company ids collapse; order is stable by first appearance.
 */
export function planEquityRefreshJobs(
  companyIds: readonly string[],
  phase: SessionPhase,
  nowMs: number,
  intervalMs = EQUITY_REFRESH_INTERVAL_MS,
): EquityRefreshPlanItem[] {
  if (!shouldScheduleEquityRefresh(phase)) return [];
  const seen = new Set<string>();
  const out: EquityRefreshPlanItem[] = [];
  for (const companyId of companyIds) {
    if (!companyId || seen.has(companyId)) continue;
    seen.add(companyId);
    out.push({
      companyId,
      idempotencyKey: equityRefreshIdempotencyKey(companyId, nowMs, intervalMs),
    });
  }
  return out;
}
