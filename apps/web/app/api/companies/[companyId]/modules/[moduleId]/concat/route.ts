import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AnalyzerModuleConfig } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { createSystemClock, drainQueues, enqueue } from '@hftr/engine';
import { ApiError, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

/**
 * D-091: enqueue model-free analyzer.concat for a research/execution analyzer module.
 * Updates engine data_out stub / library per emitMode.
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (module_.type !== 'analyzer') throw new ApiError(422, 'not_an_analyzer_module');
    if (module_.status !== 'active' && module_.status !== 'draft') {
      throw new ApiError(422, 'module_not_runnable');
    }

    const config = AnalyzerModuleConfig.parse(module_.config ?? {});
    if (config.emitMode === 'verify_loopback') {
      throw new ApiError(422, 'analyzer_emit_mode_not_concat');
    }

    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'VERIFY',
      kind: 'analyzer.concat',
      payload: {
        companyId,
        moduleId,
        ...(module_.engineInstanceId ? { engineId: module_.engineInstanceId } : {}),
      },
      idempotencyKey: `analyzer-concat-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
      moduleId,
    });
    const drained = await drainQueues(db, clock, {
      workerId: `inline:${clerkUserId.slice(0, 12)}`,
      budgetMs: 10_000,
      batchSize: 3,
    });
    return { queued: true, drained, emitMode: config.emitMode };
  });
}
