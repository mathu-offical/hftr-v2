import { z } from 'zod';
import { executePaperTrade } from '../dispatch/paper-trade';
import { registerHandler } from './registry';

const PaperTradePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  symbol: z.string().min(1).max(12),
  actionVerb: z.enum(['buy', 'sell']),
  orderType: z.enum(['market', 'limit']),
  quantity: z.number().int().positive(),
  limitPriceCents: z.number().int().positive().nullable(),
});

/**
 * DISPATCH queue handler. Idempotent: the enqueue idempotency key dedupes the
 * job; the trade itself creates fresh instruction/task rows per execution, so
 * retried jobs after a mid-flight crash may re-trade — acceptable in paper,
 * revisited with venue-side idempotency before any live gate.
 */
registerHandler('dispatch.paper_trade', async ({ db, clock, job }) => {
  const payload = PaperTradePayload.parse(job.payload);
  const result = await executePaperTrade(db, clock, { ...payload, jobId: job.id });
  if (result.outcome === 'blocked' && result.failureCode === 'numeric_sanity_block') {
    // Permanent input problem — failing the job would retry uselessly.
    return;
  }
});
