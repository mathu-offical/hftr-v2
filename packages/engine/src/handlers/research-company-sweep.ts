import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { modules } from '@hftr/db/schema';
import { venueDate } from '../calendar/calendar';
import { enqueue } from '../queue/queue';
import { registerHandler } from './registry';

const CompanySweepPayload = z.object({
  companyId: z.string().uuid(),
});

registerHandler('research.company_sweep', async ({ db, clock, job }) => {
  const payload = CompanySweepPayload.parse(job.payload);
  const day = venueDate(clock.nowMs(), 'America/New_York');

  const researchModules = await db
    .select({
      id: modules.id,
      config: modules.config,
    })
    .from(modules)
    .where(and(eq(modules.companyId, payload.companyId), eq(modules.type, 'research'), eq(modules.status, 'active')));

  for (const mod of researchModules) {
    const topicScope =
      typeof mod.config === 'object' &&
      mod.config !== null &&
      'topicScope' in mod.config &&
      typeof (mod.config as { topicScope?: unknown }).topicScope === 'string'
        ? (mod.config as { topicScope: string }).topicScope
        : '';

    await enqueue(db, clock, {
      queueClass: 'RESEARCH',
      kind: 'research.curate',
      payload: {
        companyId: payload.companyId,
        moduleId: mod.id,
        topicScope,
        mode: 'company',
      },
      idempotencyKey: `research-company-sweep-${mod.id}-${day}`,
      companyId: payload.companyId,
      moduleId: mod.id,
    });
  }
});
