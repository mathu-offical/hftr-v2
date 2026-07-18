import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { createSystemClock, drainQueues, enqueue } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

const TradeInput = z.object({
  symbol: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z.]+$/, 'letters only'),
  actionVerb: z.enum(['buy', 'sell']),
  orderType: z.enum(['market', 'limit']).default('market'),
  quantity: z.number().int().min(1).max(100_000),
  limitPriceCents: z.number().int().positive().nullable().default(null),
});

/**
 * Operator-initiated paper trade (M2 spine). The route only validates and
 * enqueues — execution happens in the DISPATCH queue handler — then drains
 * once so the UI gets an immediate result. OPERATOR_INPUT authority; the LLM
 * pipeline will later produce instructions through the same queue path.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (module_.type !== 'trading') {
      throw new ApiError(422, 'not_a_trading_module');
    }
    if (module_.status !== 'active') {
      throw new ApiError(422, 'module_not_active');
    }
    const input = await parseBody(req, TradeInput);
    if (input.orderType === 'limit' && input.limitPriceCents === null) {
      throw new ApiError(422, 'limit_price_required');
    }

    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'DISPATCH',
      kind: 'dispatch.paper_trade',
      payload: { ...input, companyId, moduleId },
      idempotencyKey: `trade-${randomUUID()}`,
      priority: 'HIGH',
      companyId,
      moduleId,
    });
    const drained = await drainQueues(db, clock, {
      workerId: `inline:${clerkUserId.slice(0, 12)}`,
      budgetMs: 15_000,
      batchSize: 3,
      queueClasses: ['DISPATCH'],
      kickMaintenanceSweep: false,
    });
    return { queued: true, drained };
  });
}
