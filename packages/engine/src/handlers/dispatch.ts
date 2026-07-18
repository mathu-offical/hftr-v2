import { z } from 'zod';
import { executePaperTrade, executePaperTradeFromInstruction } from '../dispatch/paper-trade';
import { registerHandler } from './registry';

const OperatorPaperTradePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  symbol: z.string().min(1).max(12),
  actionVerb: z.enum(['buy', 'sell']),
  orderType: z.enum(['market', 'limit']),
  quantity: z.number().int().positive(),
  limitPriceCents: z.number().int().positive().nullable().optional(),
});

const CompiledPaperTradePayload = z.object({
  instructionId: z.string().uuid(),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
});

/**
 * DISPATCH queue handler. Idempotent: the enqueue idempotency key dedupes the
 * job. Compile path passes `instructionId` and resolves ValueRefs via the
 * instruction finalizer (no raw quantity on the job). Operator UI path still
 * passes form fields and records operator_input refs inside executePaperTrade.
 */
registerHandler('dispatch.paper_trade', async ({ db, clock, job }) => {
  const raw = job.payload;
  if (
    raw &&
    typeof raw === 'object' &&
    'instructionId' in raw &&
    typeof (raw as { instructionId?: unknown }).instructionId === 'string'
  ) {
    const payload = CompiledPaperTradePayload.parse(raw);
    const result = await executePaperTradeFromInstruction(db, clock, {
      instructionId: payload.instructionId,
      jobId: job.id,
    });
    if (result.outcome === 'blocked' && result.failureCode === 'numeric_sanity_block') {
      return;
    }
    return;
  }

  const payload = OperatorPaperTradePayload.parse(raw);
  const result = await executePaperTrade(db, clock, {
    ...payload,
    limitPriceCents: payload.limitPriceCents ?? null,
    jobId: job.id,
  });
  if (result.outcome === 'blocked' && result.failureCode === 'numeric_sanity_block') {
    // Permanent input problem — failing the job would retry uselessly.
    return;
  }
});
