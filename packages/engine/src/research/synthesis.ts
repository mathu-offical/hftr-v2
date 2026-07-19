import { and, eq } from 'drizzle-orm';
import {
  ConceptBatch,
  type EvidencePackage,
  galaxyDisplayTagsFromList,
  normalizeGalaxyDisplayTag,
  similarityBandBetweenTexts,
  withResearchArticleTag,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, concepts, modules } from '@hftr/db/schema';
import type { Clock } from '../clock';
import type { ClaimedJob } from '../queue/queue';
import { loadCatalogHints } from '../handlers/research-deterministic';
import type { ModelGateway } from '../handlers/model-gateway';
import { allowedRefsFromEvidence, assertBatchEvidenceGrounded } from './evidence-grounding';
import { loadOperatorDirectiveHints } from './operator-directives';

function qualitativeScopeTags(topicScope: string): string[] {
  return topicScope
    .split(/[^A-Za-z0-9_]+/)
    .map((t) => normalizeGalaxyDisplayTag(t) ?? '')
    .filter((t) => t.length >= 3)
    .slice(0, 6);
}

/** Within-batch correlates from shared display tags / medium+ title-body overlap (D-151). */
function buildDeterministicBatchLinks(
  drafts: Array<{ title: string; body: string; tags: string[] }>,
): Array<{
  fromTitle: string;
  toTitle: string;
  relation: 'correlates';
  weightBand: 'weak' | 'typical' | 'strong';
}> {
  const links: Array<{
    fromTitle: string;
    toTitle: string;
    relation: 'correlates';
    weightBand: 'weak' | 'typical' | 'strong';
  }> = [];
  const seen = new Set<string>();

  const push = (fromTitle: string, toTitle: string, weightBand: 'weak' | 'typical' | 'strong') => {
    if (fromTitle === toTitle) return;
    const key = fromTitle < toTitle ? `${fromTitle}::${toTitle}` : `${toTitle}::${fromTitle}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ fromTitle, toTitle, relation: 'correlates', weightBand });
  };

  const byTag = new Map<string, string[]>();
  for (const draft of drafts) {
    for (const tag of galaxyDisplayTagsFromList(draft.tags)) {
      const key = tag.toLowerCase();
      const list = byTag.get(key) ?? [];
      list.push(draft.title);
      byTag.set(key, list);
    }
  }
  for (const titles of byTag.values()) {
    const cap = Math.min(titles.length, 6);
    for (let i = 0; i < cap; i++) {
      for (let j = i + 1; j < cap; j++) {
        push(titles[i]!, titles[j]!, 'typical');
      }
    }
  }

  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      const left = drafts[i]!;
      const right = drafts[j]!;
      const band = similarityBandBetweenTexts(
        `${left.title} ${left.tags.join(' ')} ${left.body.slice(0, 400)}`,
        `${right.title} ${right.tags.join(' ')} ${right.body.slice(0, 400)}`,
      );
      if (band === 'low') continue;
      push(left.title, right.title, band === 'high' ? 'strong' : 'typical');
    }
  }

  return links.slice(0, 24);
}

export function buildDeterministicBatchFromEvidence(opts: {
  evidencePackages: EvidencePackage[];
  topicScope: string;
}): ConceptBatch {
  const scopeTags = qualitativeScopeTags(opts.topicScope);

  const concepts = opts.evidencePackages.slice(0, 12).map((pkg) => {
    const sourceTag = normalizeGalaxyDisplayTag(pkg.sourceKind) ?? pkg.sourceKind;
    const feedTag = normalizeGalaxyDisplayTag(pkg.feedClass);
    const mixed = [sourceTag, ...(feedTag ? [feedTag] : []), ...scopeTags];
    return {
      title: pkg.title.slice(0, 200),
      body:
        `Evidence-backed qualitative note from ${pkg.sourceKind} (${pkg.feedClass}). ` +
        `${pkg.summary}`,
      tags: withResearchArticleTag(mixed).slice(0, 16),
      sourceRef: `evidence:${pkg.digest}`,
    };
  });

  return ConceptBatch.parse({
    concepts,
    links: buildDeterministicBatchLinks(concepts),
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
  evidencePackages: EvidencePackage[];
  sealSummaries?: Array<{ sealId: string; kind: string; title: string }>;
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
  const operatorDirectives = await loadOperatorDirectiveHints(ctx.db, {
    companyId: ctx.companyId,
    moduleId: ctx.moduleId,
  });

  const evidenceSummaries = ctx.evidencePackages.slice(0, 24).map((pkg) => ({
    digest: pkg.digest,
    title: pkg.title.slice(0, 300),
    summary: pkg.summary.slice(0, 500),
  }));

  const sealSummaries = (ctx.sealSummaries ?? []).slice(0, 8);

  const result = await ctx.modelGateway.synthesizeResearch({
    companyId: ctx.companyId,
    moduleId: ctx.moduleId,
    jobId: ctx.job.id,
    topicScope: ctx.topicScope,
    topicSectors: mod?.topicSectors ?? [],
    philosophyAxes,
    operatorDirectives,
    catalogHints,
    existingConceptTitles: existing.map((r) => r.title),
    evidenceSummaries,
    sealSummaries,
  });

  if (!result.ok) return null;

  const allowed = allowedRefsFromEvidence(
    ctx.evidencePackages,
    sealSummaries.map((s) => s.sealId),
  );
  const grounded = assertBatchEvidenceGrounded(result.batch, allowed);
  return grounded;
}
