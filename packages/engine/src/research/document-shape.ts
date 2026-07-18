import {
  SYSTEM_DOC_SHAPE_SPECS,
  type DocumentShapeResult,
  type SystemDocKind,
} from '@hftr/contracts';
import { leakLint } from '@hftr/contracts';

export interface ValidateDocumentShapeInput {
  kind: SystemDocKind;
  body: string;
  tags: readonly string[];
  sourceRef: string;
}

const WIKILINK_PATTERN = /\[\[[^\]]+\]\]/;
const H1_PATTERN = /^#\s+.+$/m;
const SOURCE_REF_PREFIX = /^(system:|evidence:|seal:)/;

function headingPresent(body: string, title: string): boolean {
  const normalized = title.trim().toLowerCase();
  const lines = body.split('\n');
  return lines.some((line) => {
    const match = /^##\s+(.+?)\s*$/.exec(line.trim());
    if (!match?.[1]) return false;
    return match[1].trim().toLowerCase() === normalized;
  });
}

function countWikilinks(body: string): number {
  const matches = body.match(/\[\[[^\]]+\]\]/g);
  return matches?.length ?? 0;
}

/**
 * Fail-closed markdown shape validation for system-curated library concepts (D-069).
 */
export function validateDocumentShape(input: ValidateDocumentShapeInput): DocumentShapeResult {
  const spec = SYSTEM_DOC_SHAPE_SPECS[input.kind];
  const failedChecks: string[] = [];
  const repairHints: string[] = [];

  if (!H1_PATTERN.test(input.body)) {
    failedChecks.push('h1_required');
    repairHints.push('Add a single H1 title line at the top of the document.');
  }

  for (const section of spec.requiredSectionHeadings) {
    if (!headingPresent(input.body, section)) {
      failedChecks.push(`section:${section}`);
      repairHints.push(`Add ## ${section} section with qualitative prose.`);
    }
  }

  const wikilinkCount = countWikilinks(input.body);
  if (spec.requireWikilink && wikilinkCount < 1) {
    failedChecks.push('wikilink_density');
    repairHints.push('Add at least one wikilink such as [[related_concept]] in the body.');
  }

  const tagSet = new Set(input.tags.map((tag) => tag.trim().toLowerCase()));
  for (const required of spec.requiredTags) {
    if (!tagSet.has(required.toLowerCase())) {
      failedChecks.push(`tag:${required}`);
      repairHints.push(`Include required tag "${required}" on the concept.`);
    }
  }

  if (!SOURCE_REF_PREFIX.test(input.sourceRef.trim())) {
    failedChecks.push('source_ref_prefix');
    repairHints.push('Set sourceRef with a system:, evidence:, or seal: prefix.');
  }

  const lint = leakLint(input.body, []);
  if (!lint.ok) {
    failedChecks.push('leak_lint');
    repairHints.push(
      'Remove raw digits, currency, percentages, and clock literals from the body.',
    );
  }

  return {
    ok: failedChecks.length === 0,
    kind: input.kind,
    repairHints,
    failedChecks,
  };
}

/** Exported for curation scoring — wikilink count in shaped markdown bodies. */
export function countDocumentWikilinks(body: string): number {
  return countWikilinks(body);
}

/** Whether body contains at least one wikilink token. */
export function hasWikilink(body: string): boolean {
  return WIKILINK_PATTERN.test(body);
}
