import { z } from 'zod';
import { scoping } from '@hftr/db';
import { createSystemClock, drainQueues, enqueue } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Operator-triggered model-free position exit scan for one company.
 * Enqueues `maintenance.position_exits` then drains MAINTENANCE + DISPATCH
 * so lifecycle sells can fill in the same request (paper desk).
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const clock = createSystemClock();
    const bucket = new Date(clock.nowMs()).toISOString().slice(0, 16);
    await enqueue(db, clock, {
      queueClass: 'MAINTENANCE',
      kind: 'maintenance.position_exits',
      payload: { companyId },
      idempotencyKey: `position-exits-manual-${companyId}-${bucket}-${clock.nowMs()}`,
      priority: 'HIGH',
      companyId,
    });

    const drained = await drainQueues(db, clock, {
      workerId: `positions-exits:${companyId}`,
      budgetMs: 45_000,
      queueClasses: ['MAINTENANCE', 'DISPATCH'],
    });

    return { queued: true, drained };
  });
}
