import { and, eq } from 'drizzle-orm';
import { ConceptBatch, type EvidencePackage } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, concepts, modules } from '@hftr/db/schema';
import type { Clock } from '../clock';
import type { ClaimedJob } from '../queue/queue';
import { loadCatalogHints } from '../handlers/research-deterministic';
import type { ModelGateway } from '../handlers/model-gateway';

export function buildDeterministicBatchFromEvidence(opts: {
  evidencePackages: EvidencePackage[];
  topicScope: string;
}): ConceptBatch {
  const scopeTags = opts.topicScope
    .split(/[^A-Za-z0-9_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  const concepts = opts.evidencePackages.slice(0, 12).map((pkg) => ({
    title: pkg.title.slice(0, 200),
    body:
      `Evidence-backed qualitative note from ${pkg.sourceKind} (${pkg.feedClass}). ` +
      `${pkg.summary}`,
    tags: [...new Set([pkg.sourceKind, ...scopeTags])].slice(0, 16),
    sourceRef: pkg.externalRef ?? `evidence:${pkg.digest}`,
  }));

  return ConceptBatch.parse({
    concepts,
    links: [],
    escalateToStrategic: false,
    escalateReason: 'none',
  });
}

export async function runResearchSynthesis(ctx: {
  db: Db;
  clock: Clock;
  job: ClaimedJob;
  modelGateway: ModelGateway;
  companyId: string;
  moduleId: string;
  topicScope: string;
}): Promise<ConceptBatch | null> {
  const [company] = await ctx.db
    .select({
      philosophyPrompt: companies.philosophyPrompt,
      philosophyProfile: companies.philosophyProfile,
    })
    .from(companies)
    .where(eq(companies.id, ctx.companyId))
    .limit(1);
  const [mod] = await ctx.db
    .select({ topicSectors: modules.topicSectors })
    .from(modules)
    .where(and(eq(modules.id, ctx.moduleId), eq(modules.companyId, ctx.companyId)))
    .limit(1);

  const existing = await ctx.db
    .select({ title: concepts.title })
    .from(concepts)
    .where(and(eq(concepts.moduleId, ctx.moduleId), eq(concepts.status, 'active')))
    .limit(40);

  const catalogHints = await loadCatalogHints({ db: ctx.db, topicScope: ctx.topicScope });
  const philosophyAxes =
    company?.philosophyProfile && typeof company.philosophyProfile === 'object'
      ? Object.keys(company.philosophyProfile as Record<string, unknown>).slice(0, 16)
      : [];

  const result = await ctx.modelGateway.synthesizeResearch({
    companyId: ctx.companyId,
    moduleId: ctx.moduleId,
    jobId: ctx.job.id,
    topicScope: ctx.topicScope,
    topicSectors: mod?.topicSectors ?? [],
    philosophyAxes,
    catalogHints,
    existingConceptTitles: existing.map((r) => r.title),
  });

  if (!result.ok) return null;
  return result.batch;
}
