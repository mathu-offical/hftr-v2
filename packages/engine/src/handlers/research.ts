import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ConceptBatch } from '@hftr/contracts';
import { companies, conceptLinks, concepts, modules } from '@hftr/db/schema';
import { curateDeterministic, loadCatalogHints } from './research-deterministic';
import { registerHandler } from './registry';

const CuratePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  topicScope: z.string().max(200).default(''),
});

/**
 * RESEARCH queue: prefers injected ModelGateway strategic synthesis when
 * available; otherwise (or on any failure) falls back to deterministic catalog
 * curation with honest sourceClass labels.
 */
registerHandler('research.curate', async ({ db, clock, job, modelGateway }) => {
  const payload = CuratePayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  if (modelGateway && process.env.HFTR_LLM_MODE !== 'deterministic') {
    const [company] = await db
      .select({
        philosophyPrompt: companies.philosophyPrompt,
        philosophyProfile: companies.philosophyProfile,
      })
      .from(companies)
      .where(eq(companies.id, payload.companyId))
      .limit(1);
    const [mod] = await db
      .select({ topicSectors: modules.topicSectors })
      .from(modules)
      .where(and(eq(modules.id, payload.moduleId), eq(modules.companyId, payload.companyId)))
      .limit(1);

    const existing = await db
      .select({ title: concepts.title })
      .from(concepts)
      .where(and(eq(concepts.moduleId, payload.moduleId), eq(concepts.status, 'active')))
      .limit(40);

    const catalogHints = await loadCatalogHints({ db, topicScope: payload.topicScope });
    const philosophyAxes =
      company?.philosophyProfile && typeof company.philosophyProfile === 'object'
        ? Object.keys(company.philosophyProfile as Record<string, unknown>).slice(0, 16)
        : [];

    const result = await modelGateway.synthesizeResearch({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      jobId: job.id,
      topicScope: payload.topicScope,
      topicSectors: mod?.topicSectors ?? [],
      philosophyAxes,
      catalogHints,
      existingConceptTitles: existing.map((r) => r.title),
    });

    if (result.ok) {
      await persistConceptBatch({
        db,
        companyId: payload.companyId,
        moduleId: payload.moduleId,
        batch: result.batch,
        now,
      });
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

async function persistConceptBatch(opts: {
  db: import('@hftr/db').Db;
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

  // Reload titles that may already exist from prior runs for link resolution.
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
