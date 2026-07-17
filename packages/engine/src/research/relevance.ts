/** Tokenize qualitative text for librarian overlap metrics (model-free). */
export function tokenizeQualitativeText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/** Jaccard overlap on token sets; returns 0–1. */
export function tokenOverlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type RelevanceBand = 'low' | 'medium' | 'high';

/** Map overlap ratio to qualitative librarian band. */
export function overlapToRelevanceBand(ratio: number): RelevanceBand {
  if (ratio >= 0.35) return 'high';
  if (ratio >= 0.12) return 'medium';
  return 'low';
}

/** Multi-metric relevance: max overlap across query/topic vs corpus tokens. */
export function scoreRelevanceBand(opts: {
  queryText: string;
  topicScope: string;
  corpusTexts: string[];
}): { band: RelevanceBand; bestRatio: number } {
  const queryTokens = [
    ...tokenizeQualitativeText(opts.queryText),
    ...tokenizeQualitativeText(opts.topicScope),
  ];
  if (queryTokens.length === 0) {
    return { band: 'low', bestRatio: 0 };
  }

  let bestRatio = 0;
  for (const text of opts.corpusTexts) {
    const corpusTokens = tokenizeQualitativeText(text);
    const ratio = tokenOverlapRatio(queryTokens, corpusTokens);
    if (ratio > bestRatio) bestRatio = ratio;
  }

  return { band: overlapToRelevanceBand(bestRatio), bestRatio };
}

/** Normalized title similarity for duplicate detection (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokenizeQualitativeText(a);
  const tb = tokenizeQualitativeText(b);
  if (ta.length === 0 || tb.length === 0) {
    const na = a.trim().toLowerCase();
    const nb = b.trim().toLowerCase();
    return na === nb ? 1 : 0;
  }
  return tokenOverlapRatio(ta, tb);
}
