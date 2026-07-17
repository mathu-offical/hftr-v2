import { RESEARCH_SOURCE_FEED_CLASS, type EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage } from './normalize';

export interface LibraryConceptEvidenceInput {
  conceptId: string;
  title: string;
  body: string;
  libraryId: string;
  libraryName?: string;
}

/**
 * Deterministic EvidencePackage rows from admitted/accepted library concepts.
 * No DB access — engine loads rows and passes them here.
 */
export function evidenceFromLibraryConcepts(
  rows: readonly LibraryConceptEvidenceInput[],
  opts?: { maxResults?: number },
): EvidencePackage[] {
  const max = Math.min(Math.max(1, opts?.maxResults ?? 12), 24);
  const packages: EvidencePackage[] = [];
  for (const row of rows.slice(0, max)) {
    const summary =
      row.body.trim().slice(0, 400) ||
      `Admitted library concept from ${row.libraryName ?? 'library'}.`;
    packages.push(
      normalizeToEvidencePackage({
        sourceKind: 'library',
        feedClass: RESEARCH_SOURCE_FEED_CLASS.library,
        title: row.title.trim() || 'Library concept',
        summary,
        externalRef: `library:${row.libraryId}/concept:${row.conceptId}`,
        artifactRefs: [`concept:${row.conceptId}`, `library:${row.libraryId}`],
        legalUseClass: 'ALLOWED',
        authorityClass: 'CURATED_BACKGROUND',
      }),
    );
  }
  return packages;
}
