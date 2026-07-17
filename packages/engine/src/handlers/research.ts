import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ConceptBatch } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, conceptLinks, concepts, modules } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { venueDate } from '../calendar/calendar';
import { enqueue } from '../queue/queue';
import type { ClaimedJob } from '../queue/queue';
import { curateDeterministic, loadCatalogHints } from './research-deterministic';
import type { ModelGateway } from './model-gateway';
import { registerHandler } from './registry';

const CuratePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  topicScope: z.string().max(200).default(''),
});

const StrategicPayload = CuratePayload;

async function runResearchSynthesis(ctx: {
  db: Db;
  clock: Clock;
  job: ClaimedJob;
  modelGateway: ModelGateway;
  payload: z.infer<typeof CuratePayload>;
}): Promise<ConceptBatch | null> {
  const [company] = await ctx.db
    .select({
      philosophyPrompt: companies.philosophyPrompt,
      philosophyProfile: companies.philosophyProfile,
    })
    .from(companies)
    .where(eq(companies.id, ctx.payload.companyId))
    .limit(1);
  const [mod] = await ctx.db
    .select({ topicSectors: modules.topicSectors })
    .from(modules)
    .where(and(eq(modules.id, ctx.payload.moduleId), eq(modules.companyId, ctx.payload.companyId)))
    .limit(1);

  const existing = await ctx.db
    .select({ title: concepts.title })
    .from(concepts)
    .where(and(eq(concepts.moduleId, ctx.payload.moduleId), eq(concepts.status, 'active')))
    .limit(40);

  const catalogHints = await loadCatalogHints({ db: ctx.db, topicScope: ctx.payload.topicScope });
  const philosophyAxes =
    company?.philosophyProfile && typeof company.philosophyProfile === 'object'
      ? Object.keys(company.philosophyProfile as Record<string, unknown>).slice(0, 16)
      : [];

  const result = await ctx.modelGateway.synthesizeResearch({
    companyId: ctx.payload.companyId,
    moduleId: ctx.payload.moduleId,
    jobId: ctx.job.id,
    topicScope: ctx.payload.topicScope,
    topicSectors: mod?.topicSectors ?? [],
    philosophyAxes,
    catalogHints,
    existingConceptTitles: existing.map((r) => r.title),
  });

  if (!result.ok) return null;
  return result.batch;
}

/**
 * RESEARCH queue: prefers injected ModelGateway strategic synthesis when
 * available; otherwise (or on any failure) falls back to deterministic catalog
 * curation with honest sourceClass labels.
 */
registerHandler('research.curate', async ({ db, clock, job, modelGateway }) => {
  const payload = CuratePayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  if (modelGateway && process.env.HFTR_LLM_MODE !== 'deterministic') {
    const batch = await runResearchSynthesis({ db, clock, job, modelGateway, payload });
    if (batch) {
      await persistConceptBatch({
        db,
        companyId: payload.companyId,
        moduleId: payload.moduleId,
        batch,
        now,
      });

      if (batch.escalateToStrategic) {
        const day = venueDate(clock.nowMs(), 'America/New_York');
        await enqueue(db, clock, {
          queueClass: 'STRATEGIC',
          kind: 'research.strategic',
          payload: {
            companyId: payload.companyId,
            moduleId: payload.moduleId,
            topicScope: payload.topicScope,
          },
          idempotencyKey: `strategic-research-${payload.moduleId}-${payload.topicScope}-${day}`,
          priority: 'NORMAL',
          companyId: payload.companyId,
          moduleId: payload.moduleId,
        });
      }
      return;
    }
  }

  await curateDeterministic({
    db,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    topicScope: payload.topicScope,
    now,
  });
});

/**
 * STRATEGIC queue: re-run strategic synthesis (gateway tier is already strategic).
 * Idempotent per module/topic/day via enqueue key from research.curate or tactical.
 */
registerHandler('research.strategic', async ({ db, clock, job, modelGateway }) => {
  const payload = StrategicPayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  if (!modelGateway || process.env.HFTR_LLM_MODE === 'deterministic') {
    await curateDeterministic({
      db,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      topicScope: payload.topicScope,
      now,
    });
    return;
  }

  const batch = await runResearchSynthesis({ db, clock, job, modelGateway, payload });
  if (batch) {
    await persistConceptBatch({
      db,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      batch,
      now,
    });
    return;
  }

  await curateDeterministic({
    db,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    topicScope: payload.topicScope,
    now,
  });
});

async function persistConceptBatch(opts: {
  db: Db;
  companyId: string;
  moduleId: string;
  batch: ConceptBatch;
  now: Date;
}): Promise<void> {
  const titleToId = new Map<string, string>();

  for (const draft of opts.batch.concepts) {
    const rows = await opts.db
      .insert(concepts)
      .values({
        companyId: opts.companyId,
        moduleId: opts.moduleId,
        title: draft.title,
        body: draft.body,
        tags: draft.tags,
        sourceClass: 'model_generated',
        sourceRef: draft.sourceRef,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body: draft.body,
          tags: draft.tags,
          sourceClass: 'model_generated',
          sourceRef: draft.sourceRef,
          status: 'active',
          updatedAt: opts.now,
        },
      })
      .returning({ id: concepts.id, title: concepts.title });
    const row = rows[0];
    if (row) titleToId.set(row.title, row.id);
  }

  if (opts.batch.links.length > 0) {
    const all = await opts.db
      .select({ id: concepts.id, title: concepts.title })
      .from(concepts)
      .where(eq(concepts.moduleId, opts.moduleId));
    for (const c of all) titleToId.set(c.title, c.id);
  }

  for (const link of opts.batch.links) {
    const fromId = titleToId.get(link.fromTitle);
    const toId = titleToId.get(link.toTitle);
    if (!fromId || !toId || fromId === toId) continue;
    await opts.db
      .insert(conceptLinks)
      .values({
        companyId: opts.companyId,
        fromConceptId: fromId,
        toConceptId: toId,
        relation: link.relation,
        weightBand: link.weightBand,
        sourceClass: 'model_generated',
      })
      .onConflictDoUpdate({
        target: [conceptLinks.fromConceptId, conceptLinks.toConceptId, conceptLinks.relation],
        set: {
          weightBand: link.weightBand,
          sourceClass: 'model_generated',
          updatedAt: opts.now,
        },
      });
  }
}
