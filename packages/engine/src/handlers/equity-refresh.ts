import { recomputeCompanyEquity } from '../equity/recompute';
import { registerHandler } from './registry';

/**
 * Fifteen-second equity fallback (company-equity plan Task 6 / D-084).
 * Recomputes one company's equity projection from cash + open positions.
 * Marks are omitted here — quote-driven refresh supplies marks when available;
 * without marks, recompute preserves last good cents as stale when needed.
 */
registerHandler('equity.refresh', async ({ db, clock, job }) => {
  const companyId = (job.payload as { companyId?: string } | null)?.companyId;
  if (!companyId || typeof companyId !== 'string') {
    throw new Error('equity.refresh: companyId required');
  }
  await recomputeCompanyEquity(db, clock, companyId, 'schedule');
});
