import type { ConceptBatch } from '@hftr/contracts';

export interface RejectRepairHint {
  /** Qualitative instruction only — no raw ratios. */
  hint: string;
  /** Band the librarian should aim to improve. */
  targetBand: 'structure' | 'link' | 'freshness' | 'grounding';
}

const MAX_REPAIR_ITERATIONS = 3;

/**
 * Build band-only repairHints for librarian reject-repair loops (D-071).
 * Models never see raw ratios / Hamming distances.
 */
export function buildRejectRepairHints(opts: {
  shapeOk: boolean;
  overallBand: 'low' | 'medium' | 'high';
  grounded: boolean;
  existingHints?: string[];
}): RejectRepairHint[] {
  const hints: RejectRepairHint[] = [];
  if (!opts.shapeOk) {
    hints.push({
      hint: 'Restore required markdown sections and tags for this SystemDocKind.',
      targetBand: 'structure',
    });
  }
  if (!opts.grounded) {
    hints.push({
      hint: 'Cite every draft via evidence:{digest} or seal:{sealId} from the provided summaries.',
      targetBand: 'grounding',
    });
  }
  if (opts.overallBand === 'low') {
    hints.push({
      hint: 'Improve wikilink connectivity and refresh stale sections before re-admit.',
      targetBand: 'link',
    });
  }
  for (const h of opts.existingHints ?? []) {
    hints.push({ hint: h, targetBand: 'structure' });
  }
  return hints.slice(0, 8);
}

/**
 * Whether another reject-repair iteration is allowed (≤3).
 */
export function canContinueRejectRepair(iteration: number): boolean {
  return iteration >= 0 && iteration < MAX_REPAIR_ITERATIONS;
}

/**
 * Surface only bands + repairHints for LLM-facing librarian envelopes.
 */
export function librarianEnvelopeFromBatch(opts: {
  batch: ConceptBatch | null;
  overallBand: 'low' | 'medium' | 'high';
  repairHints: RejectRepairHint[];
  iteration: number;
}): {
  overallBand: 'low' | 'medium' | 'high';
  repairHints: string[];
  canRetry: boolean;
  conceptCount: number;
} {
  return {
    overallBand: opts.overallBand,
    repairHints: opts.repairHints.map((h) => h.hint),
    canRetry: canContinueRejectRepair(opts.iteration),
    conceptCount: opts.batch?.concepts.length ?? 0,
  };
}
