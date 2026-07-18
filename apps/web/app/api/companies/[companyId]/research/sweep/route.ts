import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { createSystemClock, drainQueues, enqueue } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Fan out company-mode research.curate jobs across active research modules. */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'LIBRARY_RESEARCH',
      kind: 'research.company_sweep',
      payload: { companyId },
      idempotencyKey: `research-sweep-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
    });
    const drained = await drainQueues(db, clock, {
      workerId: `inline:${clerkUserId.slice(0, 12)}`,
      budgetMs: 15_000,
      batchSize: 3,
    });
    return { queued: true, drained };
  });
}
