import { and, eq } from 'drizzle-orm';
import type { NormalizedViewKind, SystemDocKind, VerifiedNormalizedBundle } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { concepts, libraryConcepts, systemNormalizedViews } from '@hftr/db/schema';
import { recordCurationScoreEvent, scoreDocumentCuration } from './curation-score';
import { validateDocumentShape } from './document-shape';

export interface PersistVerifiedBundleInput {
  db: Db;
  companyId: string;
  moduleId: string;
  bundle: VerifiedNormalizedBundle;
  reportBody: string;
  reportTitle: string;
  libraryId: string;
  ownerModuleId: string;
  tags: readonly string[];
  now: Date;
  /** Override when report title maps to a different SystemDocKind than the view kind. */
  docKind?: SystemDocKind;
}

/** Map sealed view kind → rigid SystemDocKind for shape + librarian score (D-069). */
export function systemDocKindForView(kind: NormalizedViewKind): SystemDocKind {
  switch (kind) {
    case 'movers_board':
      return 'movers_report';
    case 'sector_bulletin':
      return 'sector_bulletin';
    case 'daily_summary_phase':
      return 'daily_summary';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Dual persist: normalized view row + readable report concept with seal sourceRef (D-072).
 * Fail-closed on document shape before insert (D-069); records curation score telemetry (D-071).
 */
export async function persistVerifiedBundle(
  input: PersistVerifiedBundleInput,
): Promise<{ sealId: string; reportConceptId: string }> {
  const sealRef = `seal:${input.bundle.sealId}`;
  const expiresAt = new Date(input.bundle.expiresAt);
  const docKind = input.docKind ?? systemDocKindForView(input.bundle.view.kind);
  const nowMs = input.now.getTime();

  const shape = validateDocumentShape({
    kind: docKind,
    body: input.reportBody,
    tags: input.tags,
    sourceRef: sealRef,
  });
  if (!shape.ok) {
    throw new Error(`document_shape_invalid:${shape.failedChecks.join(',')}`);
  }

  const score = scoreDocumentCuration({
    kind: docKind,
    body: input.reportBody,
    tags: input.tags,
    sourceRef: sealRef,
    updatedAt: input.now,
    nowMs,
  });

  await recordCurationScoreEvent({
    db: input.db,
    companyId: input.companyId,
    gateId: 'document_shape',
    scoreBand: score.structureBand,
    passed: shape.ok,
    reason: shape.ok ? 'shape ok' : shape.failedChecks.join(','),
    rawMeta: {
      overallBand: score.overallBand,
      linkBand: score.linkBand,
      freshnessBand: score.freshnessBand,
      // Raw ratios stay in telemetry only — never model-facing.
      repairHintCount: score.repairHints.length,
    },
    now: input.now,
  });

  const [existingView] = await input.db
    .select({ id: systemNormalizedViews.id, reportConceptId: systemNormalizedViews.reportConceptId })
    .from(systemNormalizedViews)
    .where(
      and(
        eq(systemNormalizedViews.companyId, input.companyId),
        eq(systemNormalizedViews.kind, input.bundle.view.kind),
        eq(systemNormalizedViews.subjectKey, input.bundle.view.subjectKey),
        eq(systemNormalizedViews.sealId, input.bundle.sealId),
      ),
    )
    .limit(1);

  let reportConceptId = existingView?.reportConceptId ?? input.bundle.reportConceptId ?? null;

  if (!reportConceptId) {
    await input.db
      .insert(concepts)
      .values({
        companyId: input.companyId,
        moduleId: input.ownerModuleId,
        title: input.reportTitle,
        body: input.reportBody,
        tags: [...input.tags],
        sourceClass: 'deterministic_placeholder',
        sourceRef: sealRef,
        status: 'active',
        primaryLibraryId: input.libraryId,
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body: input.reportBody,
          tags: [...input.tags],
          sourceClass: 'deterministic_placeholder',
          sourceRef: sealRef,
          primaryLibraryId: input.libraryId,
          status: 'active',
          updatedAt: input.now,
        },
      });

    const [conceptRow] = await input.db
      .select({ id: concepts.id })
      .from(concepts)
      .where(
        and(eq(concepts.moduleId, input.ownerModuleId), eq(concepts.title, input.reportTitle)),
      )
      .limit(1);

    if (!conceptRow) {
      throw new Error('verified_report_concept_missing');
    }
    reportConceptId = conceptRow.id;
  } else {
    await input.db
      .update(concepts)
      .set({
        body: input.reportBody,
        tags: [...input.tags],
        sourceRef: sealRef,
        primaryLibraryId: input.libraryId,
        updatedAt: input.now,
      })
      .where(eq(concepts.id, reportConceptId));
  }

  const bundleWithConcept: VerifiedNormalizedBundle = {
    ...input.bundle,
    reportConceptId,
  };

  if (existingView) {
    await input.db
      .update(systemNormalizedViews)
      .set({
        bundle: bundleWithConcept,
        expiresAt,
        reportConceptId,
        updatedAt: input.now,
      })
      .where(eq(systemNormalizedViews.id, existingView.id));
  } else {
    await input.db.insert(systemNormalizedViews).values({
      companyId: input.companyId,
      kind: input.bundle.view.kind,
      subjectKey: input.bundle.view.subjectKey,
      sealId: input.bundle.sealId,
      bundle: bundleWithConcept,
      expiresAt,
      reportConceptId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  await input.db
    .insert(libraryConcepts)
    .values({
      libraryId: input.libraryId,
      conceptId: reportConceptId,
      curationStatus: 'auto_admitted',
    })
    .onConflictDoUpdate({
      target: [libraryConcepts.libraryId, libraryConcepts.conceptId],
      set: {
        curationStatus: 'auto_admitted',
        updatedAt: input.now,
      },
    });

  await recordCurationScoreEvent({
    db: input.db,
    companyId: input.companyId,
    conceptId: reportConceptId,
    gateId: 'document_curation',
    scoreBand: score.overallBand,
    passed: score.overallBand !== 'low',
    reason: `overall=${score.overallBand}`,
    rawMeta: {
      structureBand: score.structureBand,
      linkBand: score.linkBand,
      freshnessBand: score.freshnessBand,
    },
    now: input.now,
  });

  return { sealId: input.bundle.sealId, reportConceptId };
}
