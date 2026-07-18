import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { createSystemClock, drainQueues, enqueue } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

const ScanInput = z.object({
  /** Optional — when empty, trend.scan fills from live_api→trend links + module config. */
  symbols: z
    .array(
      z
        .string()
        .min(1)
        .max(12)
        .regex(/^[A-Za-z.]+$/),
    )
    .max(24)
    .default([]),
  lookbackMinutes: z.number().int().min(5).max(390).default(60),
});

/** Trigger a deterministic trend scan for a trend module (RESEARCH queue). */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (module_.type !== 'trend') throw new ApiError(422, 'not_a_trend_module');
    if (module_.status !== 'active') throw new ApiError(422, 'module_not_active');

    const input = await parseBody(req, ScanInput);
    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'RESEARCH',
      kind: 'trend.scan',
      payload: {
        companyId,
        moduleId,
        symbols: input.symbols.map((s) => s.toUpperCase()),
        lookbackMinutes: input.lookbackMinutes,
      },
      idempotencyKey: `scan-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
      moduleId,
    });
    const drained = await drainQueues(db, clock, {
      workerId: `inline:${clerkUserId.slice(0, 12)}`,
      budgetMs: 20_000,
      batchSize: 4,
      queueClasses: ['RESEARCH'],
      kickMaintenanceSweep: false,
    });
    return { queued: true, drained };
  });
}
