import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  gatherEvidencePackages,
  normalizeToEvidencePackage,
  type LibraryConceptEvidenceInput,
} from '@hftr/adapters';
import {
  EvidencePackage,
  ResearchModuleConfig,
  ResearchSourceKind,
  RESEARCH_SOURCE_FEED_CLASS,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  concepts,
  libraries,
  libraryConcepts,
  modules,
  researchEvidence,
  researchRequests,
} from '@hftr/db/schema';
import {
  loadCompanyLinkGraph,
  resolveLinkedModules,
  resolveOutboundLibraryModules,
} from '../graph/module-links';
import { curiosityFromConfig, resolveCuriosityMaxEvidence } from '../research/curiosity';
import { loadResearchRequest, upsertResearchResult, upsertResearchRun } from '../research/run-state';
import { enqueue } from '../queue/queue';
import { registerHandler } from './registry';
import { loadCatalogHints } from './research-deterministic';

const GatherPayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  requestId: z.string().uuid(),
  queryText: z.string().max(500).optional(),
  topicScope: z.string().max(200).optional(),
  sourceKinds: z.array(ResearchSourceKind).max(8).optional(),
  maxEvidence: z.number().int().min(1).max(48).optional(),
  causationRefs: z.array(z.string()).max(24).optional(),
  braveApiKey: z.string().optional(),
  marketNewsApiKey: z.string().optional(),
});

registerHandler('research.gather', async ({ db, clock, job }) => {
  const payload = GatherPayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  const request = await loadResearchRequest(db, payload.requestId);
  if (!request || request.companyId !== payload.companyId) {
    throw new Error('research_request_not_found');
  }

  await db
    .update(researchRequests)
    .set({ status: 'gathering', updatedAt: now })
    .where(eq(researchRequests.id, payload.requestId));

  const [mod] = await db
    .select({ config: modules.config })
    .from(modules)
    .where(and(eq(modules.id, payload.moduleId), eq(modules.companyId, payload.companyId)))
    .limit(1);
  if (!mod) throw new Error('module_not_found');

  const config = ResearchModuleConfig.parse(mod.config);
  const curiosity = curiosityFromConfig(config);
  const maxEvidence = resolveCuriosityMaxEvidence(
    curiosity,
    payload.maxEvidence ?? request.maxEvidence,
  );

  const queryText = payload.queryText ?? request.queryText;
  const topicScope = payload.topicScope ?? request.topicScope ?? config.topicScope;
  const rawSourceKinds = Array.isArray(request.sourceKinds)
    ? (request.sourceKinds as string[])
    : [];
  const requestedKinds = payload.sourceKinds ?? ResearchSourceKind.array().parse(rawSourceKinds);
  const externalKinds = requestedKinds.filter((k) => k !== 'catalog');
  const wantsCatalog = requestedKinds.includes('catalog') || requestedKinds.length === 0;
  const wantsLibrary = requestedKinds.includes('library') || requestedKinds.length === 0;

  const libraryConceptsForGather = wantsLibrary
    ? await loadLinkedLibraryConceptEvidence(db, payload.companyId, payload.moduleId)
    : [];

  const defaultExternalKinds: ResearchSourceKind[] = [
    'brave_search',
    'sec_edgar',
    'market_news',
  ];
  const sourceKinds: ResearchSourceKind[] =
    externalKinds.length > 0 ? [...externalKinds] : [...defaultExternalKinds];
  if (libraryConceptsForGather.length > 0 && !sourceKinds.includes('library')) {
    sourceKinds.push('library');
  }

  const { packages: gathered, errors: gatherErrors } = await gatherEvidencePackages({
    query: queryText || topicScope,
    sourceKinds,
    allowlist: config.sourceAllowlist,
    blocklist: config.sourceBlocklist,
    maxEvidence,
    braveApiKey: payload.braveApiKey ?? null,
    marketNewsApiKey: payload.marketNewsApiKey ?? null,
    secAllowEmptyOnError: true,
    marketNewsAllowDeterministicFallback: true,
    libraryConcepts: libraryConceptsForGather,
  });

  const packages: EvidencePackage[] = [...gathered];

  if (wantsCatalog) {
    const hints = await loadCatalogHints({ db, topicScope });
    for (const hint of hints) {
      packages.push(
        normalizeToEvidencePackage({
          sourceKind: 'catalog',
          feedClass: RESEARCH_SOURCE_FEED_CLASS.catalog,
          title: hint.title,
          summary:
            `Catalog reference from ${hint.catalog} entry ${hint.entryKey}` +
            `${hint.tier ? ` tier ${hint.tier}` : ''}.`,
          externalRef: `${hint.catalog}/${hint.entryKey}`,
          legalUseClass: 'ALLOWED',
          authorityClass: 'DETERMINISTIC',
        }),
      );
    }
  }

  const capped = packages.slice(0, maxEvidence);
  const evidenceIds: string[] = [];

  for (const pkg of capped) {
    const parsed = EvidencePackage.parse(pkg);
    const inserted = await db
      .insert(researchEvidence)
      .values({
        companyId: payload.companyId,
        moduleId: payload.moduleId,
        requestId: payload.requestId,
        sourceKind: parsed.sourceKind,
        feedClass: parsed.feedClass,
        title: parsed.title,
        summary: parsed.summary,
        digest: parsed.digest,
        legalUseClass: parsed.legalUseClass,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        artifactRefs: parsed.artifactRefs,
        externalRef: parsed.externalRef,
        authorityClass: parsed.authorityClass,
        package: parsed,
      })
      .onConflictDoNothing({ target: [researchEvidence.companyId, researchEvidence.digest] })
      .returning({ id: researchEvidence.id });
    const row = inserted[0];
    if (row) evidenceIds.push(row.id);
  }

  const runId = await upsertResearchRun(db, {
    requestId: payload.requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    phase: 'gather',
    evidenceCount: evidenceIds.length,
    now,
  });

  await upsertResearchResult(db, {
    requestId: payload.requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    status: 'gathered',
    evidenceIds,
    envelope: request.envelope as Record<string, unknown>,
    failureReason:
      gatherErrors.length > 0
        ? gatherErrors.map((e) => `${e.sourceKind}:${e.code}`).join(';').slice(0, 300)
        : null,
    now,
  });

  await db
    .update(researchRequests)
    .set({ status: 'validating', updatedAt: now })
    .where(eq(researchRequests.id, payload.requestId));

  await enqueue(db, clock, {
    queueClass: 'RESEARCH',
    kind: 'research.validate',
    payload: {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      requestId: payload.requestId,
      researchRunId: runId,
    },
    idempotencyKey: `research-validate-${payload.requestId}`,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
  });
});

/** Admitted/accepted concepts from libraries linked to this research module on the canvas. */
async function loadLinkedLibraryConceptEvidence(
  db: Db,
  companyId: string,
  researchModuleId: string,
): Promise<LibraryConceptEvidenceInput[]> {
  const graph = await loadCompanyLinkGraph(db, companyId);
  const outbound = resolveOutboundLibraryModules(graph, researchModuleId);
  const inbound = resolveLinkedModules(graph, {
    fromModuleId: researchModuleId,
    targetTypes: ['library'],
    kinds: ['data_feed'],
    direction: 'in',
    activeOnly: false,
  });
  const libraryModuleIds = [
    ...new Set([...outbound, ...inbound].map((m) => m.id)),
  ];
  if (libraryModuleIds.length === 0) return [];

  const libRows = await db
    .select({ id: libraries.id, name: libraries.name, moduleId: libraries.moduleId })
    .from(libraries)
    .where(
      and(
        eq(libraries.companyId, companyId),
        eq(libraries.status, 'active'),
        inArray(libraries.moduleId, libraryModuleIds),
      ),
    );
  if (libRows.length === 0) return [];

  const libraryIds = libRows.map((l) => l.id);
  const nameById = new Map(libRows.map((l) => [l.id, l.name]));
  const rows = await db
    .select({
      conceptId: libraryConcepts.conceptId,
      libraryId: libraryConcepts.libraryId,
      curationStatus: libraryConcepts.curationStatus,
      title: concepts.title,
      body: concepts.body,
    })
    .from(libraryConcepts)
    .innerJoin(concepts, eq(concepts.id, libraryConcepts.conceptId))
    .where(inArray(libraryConcepts.libraryId, libraryIds))
    .limit(48);

  return rows
    .filter((r) => r.curationStatus === 'accepted' || r.curationStatus === 'auto_admitted')
    .map((r) => {
      const libraryName = nameById.get(r.libraryId);
      return {
        conceptId: r.conceptId,
        title: r.title,
        body: r.body,
        libraryId: r.libraryId,
        ...(libraryName ? { libraryName } : {}),
      };
    });
}
