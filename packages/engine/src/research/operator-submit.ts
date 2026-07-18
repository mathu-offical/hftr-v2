import { and, eq } from 'drizzle-orm';
import {
  ConceptBatch,
  SubmitResearchArticleInput,
  type SubmitResearchArticleResult,
} from '@hftr/contracts';
import {
  deriveOperatorArticleTitle,
  normalizeOperatorArticleEvidence,
} from '@hftr/adapters';
import type { Db } from '@hftr/db';
import {
  concepts,
  libraries,
  libraryConcepts,
  modules,
  researchEvidence,
  researchRequests,
} from '@hftr/db/schema';
import { buildResearchEnvelope } from './envelope';
import { persistConceptBatch } from './research-persist';
import { upsertResearchResult, upsertResearchRun } from './run-state';

export interface SubmitOperatorResearchArticleOpts {
  db: Db;
  companyId: string;
  input: SubmitResearchArticleInput;
  now?: Date;
  causationRef?: string;
}

/**
 * Model-free operator article ingest (D-079).
 * Persists concept with sourceClass `operator`, records research_request + evidence,
 * attaches to library/topic. Does not call LLM or external gather.
 */
export async function submitOperatorResearchArticle(
  opts: SubmitOperatorResearchArticleOpts,
): Promise<SubmitResearchArticleResult> {
  const input = SubmitResearchArticleInput.parse(opts.input);
  const now = opts.now ?? new Date();

  const [mod] = await opts.db
    .select({ id: modules.id, type: modules.type, status: modules.status })
    .from(modules)
    .where(and(eq(modules.id, input.moduleId), eq(modules.companyId, opts.companyId)))
    .limit(1);
  if (!mod) throw new Error('module_not_found');
  if (mod.type !== 'research') throw new Error('module_type_not_research');
  if (mod.status !== 'active') throw new Error('module_not_active');

  if (input.libraryId) {
    const [lib] = await opts.db
      .select({ id: libraries.id })
      .from(libraries)
      .where(
        and(eq(libraries.id, input.libraryId), eq(libraries.companyId, opts.companyId)),
      )
      .limit(1);
    if (!lib) throw new Error('library_not_found');
  }

  const title = deriveOperatorArticleTitle({
    kind: input.kind,
    content: input.content,
    ...(input.title !== undefined ? { title: input.title } : {}),
  });

  const externalRef = input.kind === 'link' ? input.content.trim() : null;
  const body =
    input.kind === 'link'
      ? [
          input.notes?.trim() || 'Operator-submitted link reference.',
          '',
          `Source: ${externalRef}`,
        ].join('\n')
      : input.content.trim();

  const evidence = normalizeOperatorArticleEvidence({
    kind: input.kind,
    title,
    body,
    externalRef,
  });

  const envelope = buildResearchEnvelope({
    companyId: opts.companyId,
    moduleId: input.moduleId,
    idempotencyKey: `operator-submit-${input.moduleId}-${evidence.digest.slice(0, 16)}`,
    causationRefs: opts.causationRef ? [opts.causationRef] : [],
  });

  const inserted = await opts.db
    .insert(researchRequests)
    .values({
      companyId: opts.companyId,
      moduleId: input.moduleId,
      mode: 'manual',
      queryText: title.slice(0, 500),
      topicScope: 'operator_submit',
      topicId: input.topicId ?? null,
      sourceModuleId: null,
      sourceKinds: ['operator'],
      maxEvidence: 1,
      status: 'admitting',
      envelope,
    })
    .returning({ id: researchRequests.id });
  const requestId = inserted[0]?.id;
  if (!requestId) throw new Error('research_request_insert_failed');

  const [evidenceRow] = await opts.db
    .insert(researchEvidence)
    .values({
      companyId: opts.companyId,
      moduleId: input.moduleId,
      requestId,
      sourceKind: 'operator',
      feedClass: evidence.feedClass,
      title: evidence.title,
      summary: evidence.summary,
      digest: evidence.digest,
      legalUseClass: evidence.legalUseClass,
      expiresAt: null,
      artifactRefs: evidence.artifactRefs,
      externalRef: evidence.externalRef,
      authorityClass: evidence.authorityClass,
      package: evidence,
    })
    .onConflictDoNothing({ target: [researchEvidence.companyId, researchEvidence.digest] })
    .returning({ id: researchEvidence.id });

  // Re-select if digest already existed from a prior identical submit.
  let evidenceId = evidenceRow?.id ?? null;
  if (!evidenceId) {
    const [existing] = await opts.db
      .select({ id: researchEvidence.id })
      .from(researchEvidence)
      .where(
        and(
          eq(researchEvidence.companyId, opts.companyId),
          eq(researchEvidence.digest, evidence.digest),
        ),
      )
      .limit(1);
    evidenceId = existing?.id ?? null;
  }

  const tags = [
    'operator_submit',
    input.kind === 'link' ? 'operator_link' : 'operator_text',
    ...(input.tags ?? []),
  ].slice(0, 16);

  const batch = ConceptBatch.parse({
    concepts: [
      {
        title,
        body: body.slice(0, 50_000),
        tags,
        sourceRef: `evidence:${evidence.digest}`,
      },
    ],
    links: [],
    escalateToStrategic: false,
    escalateReason: 'none',
  });

  const runId = await upsertResearchRun(opts.db, {
    requestId,
    companyId: opts.companyId,
    moduleId: input.moduleId,
    phase: 'admit',
    evidenceCount: 1,
    conceptCount: 1,
    validationPassed: true,
    admissionApplied: 'operator_submit',
    now,
  });

  const conceptIds = await persistConceptBatch({
    db: opts.db,
    companyId: opts.companyId,
    moduleId: input.moduleId,
    batch,
    now,
    researchRunId: runId,
    sourceClass: 'operator',
    curationStatus: 'accepted',
    topicId: input.topicId ?? null,
  });
  const conceptId = conceptIds[0];
  if (!conceptId) throw new Error('operator_concept_persist_failed');

  let attachedLibraryId: string | null = null;
  if (input.libraryId) {
    await opts.db
      .insert(libraryConcepts)
      .values({
        libraryId: input.libraryId,
        conceptId,
        curationStatus: 'accepted',
        researchRunId: runId,
      })
      .onConflictDoUpdate({
        target: [libraryConcepts.libraryId, libraryConcepts.conceptId],
        set: {
          curationStatus: 'accepted',
          researchRunId: runId,
          updatedAt: now,
        },
      });
    await opts.db
      .update(concepts)
      .set({ primaryLibraryId: input.libraryId, updatedAt: now })
      .where(eq(concepts.id, conceptId));
    attachedLibraryId = input.libraryId;
  }

  await upsertResearchResult(opts.db, {
    requestId,
    companyId: opts.companyId,
    moduleId: input.moduleId,
    status: 'admitted',
    evidenceIds: evidenceId ? [evidenceId] : [],
    conceptIds: [conceptId],
    artifactRefs: [`evidence:${evidence.digest}`],
    admissionMode: 'auto_admit_validated',
    envelope: envelope as unknown as Record<string, unknown>,
    now,
  });

  await upsertResearchRun(opts.db, {
    requestId,
    companyId: opts.companyId,
    moduleId: input.moduleId,
    phase: 'done',
    evidenceCount: 1,
    conceptCount: 1,
    validationPassed: true,
    admissionApplied: 'operator_submit',
    now,
  });

  await opts.db
    .update(researchRequests)
    .set({ status: 'completed', updatedAt: now })
    .where(eq(researchRequests.id, requestId));

  return {
    requestId,
    conceptId,
    libraryId: attachedLibraryId,
    topicId: input.topicId ?? null,
  };
}
