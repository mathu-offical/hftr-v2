/**
 * Galaxy layout springs over shared qualitative relevance (contracts + LLM-assist regex).
 * No forked Jaccard path — same tokenize / band thresholds as librarian scoreRelevanceBand.
 */

export {
  tokenizeQualitativeText,
  tokenOverlapRatio,
  overlapToSimilarityBand,
  overlapToRelevanceBand,
  similarityBandBetweenTexts,
  scoreRelevanceBand,
  type RelevanceBand,
  type SimilarityBand,
} from '@hftr/contracts';

import { tokenizeQualitativeText, type RelevanceBand } from '@hftr/contracts';

/** Spring rest length from qualitative similarity band (RelevanceBand). */
export function linkDistanceForSimilarity(band: RelevanceBand): number {
  switch (band) {
    case 'high':
      return 58;
    case 'medium':
      return 95;
    case 'low':
      return 150;
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

/** Spring strength from qualitative similarity band. */
export function linkStrengthForSimilarity(band: RelevanceBand): number {
  switch (band) {
    case 'high':
      return 0.65;
    case 'medium':
      return 0.35;
    case 'low':
      return 0.12;
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

/** Amalgamation mass from unique token count across member texts. */
export function computeAmalgamationMass(uniqueTokenCount: number): number {
  return Math.max(2, Math.min(24, Math.sqrt(uniqueTokenCount) * 1.8));
}

/** Amalgamation mass from one or more qualitative text blobs. */
export function amalgamationMassFromTexts(texts: ReadonlyArray<string>): number {
  const tokens = new Set<string>();
  for (const text of texts) {
    for (const token of tokenizeQualitativeText(text)) {
      tokens.add(token);
    }
  }
  return computeAmalgamationMass(tokens.size);
}

/** Collect unique tokens from concept title/body pairs. */
export function uniqueTokensFromConceptTexts(
  members: ReadonlyArray<{ title: string; body: string }>,
): Set<string> {
  const tokens = new Set<string>();
  for (const member of members) {
    for (const token of tokenizeQualitativeText(`${member.title} ${member.body}`)) {
      tokens.add(token);
    }
  }
  return tokens;
}

/** Concatenated qualitative corpus for pairwise concept similarity. */
export function conceptSimilarityText(node: {
  title: string;
  body: string;
  tags: string[];
}): string {
  return `${node.title} ${node.tags.join(' ')} ${node.body.slice(0, 800)}`;
}
