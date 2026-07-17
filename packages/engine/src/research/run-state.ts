import { eq } from 'drizzle-orm';
import type { ConceptValidationResult, ResearchResultStatus } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  researchEvidence,
  researchRequests,
  researchResults,
  researchRuns,
} from '@hftr/db/schema';

export async function loadResearchRequest(db: Db, requestId: string) {
  const rows = await db
    .select()
    .from(researchRequests)
    .where(eq(researchRequests.id, requestId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertResearchRun(
  db: Db,
  opts: {
    requestId: string;
    companyId: string;
    moduleId: string | null;
    phase: 'gather' | 'validate' | 'synthesize' | 'admit' | 'done' | 'failed';
    evidenceCount?: number;
    conceptCount?: number;
    validationPassed?: boolean | null;
    admissionApplied?: string | null;
    now: Date;
  },
): Promise<string> {
  const rows = await db
    .insert(researchRuns)
    .values({
      requestId: opts.requestId,
      companyId: opts.companyId,
      moduleId: opts.moduleId,
      phase: opts.phase,
      evidenceCount: opts.evidenceCount ?? 0,
      conceptCount: opts.conceptCount ?? 0,
      validationPassed: opts.validationPassed ?? null,
      admissionApplied: opts.admissionApplied ?? null,
      updatedAt: opts.now,
    })
    .onConflictDoUpdate({
      target: [researchRuns.requestId],
      set: {
        phase: opts.phase,
        evidenceCount: opts.evidenceCount ?? undefined,
        conceptCount: opts.conceptCount ?? undefined,
        validationPassed: opts.validationPassed ?? undefined,
        admissionApplied: opts.admissionApplied ?? undefined,
        updatedAt: opts.now,
      },
    })
    .returning({ id: researchRuns.id });
  const row = rows[0];
  if (!row) throw new Error('research_run_upsert_failed');
  return row.id;
}

export async function upsertResearchResult(
  db: Db,
  opts: {
    requestId: string;
    companyId: string;
    moduleId: string | null;
    status: ResearchResultStatus;
    evidenceIds?: string[];
    conceptIds?: string[];
    artifactRefs?: string[];
    validation?: ConceptValidationResult | null;
    admissionMode?: 'auto_admit_validated' | 'require_operator_approval' | null;
    failureReason?: string | null;
    envelope: Record<string, unknown>;
    now: Date;
  },
): Promise<void> {
  await db
    .insert(researchResults)
    .values({
      requestId: opts.requestId,
      companyId: opts.companyId,
      moduleId: opts.moduleId,
      status: opts.status,
      evidenceIds: opts.evidenceIds ?? [],
      conceptIds: opts.conceptIds ?? [],
      artifactRefs: opts.artifactRefs ?? [],
      validation: opts.validation ?? null,
      admissionMode: opts.admissionMode ?? null,
      failureReason: opts.failureReason ?? null,
      envelope: opts.envelope,
      updatedAt: opts.now,
    })
    .onConflictDoUpdate({
      target: [researchResults.requestId],
      set: {
        status: opts.status,
        evidenceIds: opts.evidenceIds ?? undefined,
        conceptIds: opts.conceptIds ?? undefined,
        artifactRefs: opts.artifactRefs ?? undefined,
        validation: opts.validation ?? undefined,
        admissionMode: opts.admissionMode ?? undefined,
        failureReason: opts.failureReason ?? undefined,
        updatedAt: opts.now,
      },
    });
}

export async function listEvidenceForRequest(db: Db, requestId: string) {
  return db
    .select()
    .from(researchEvidence)
    .where(eq(researchEvidence.requestId, requestId));
}
