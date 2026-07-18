/**
 * Operator-facing labels for research topics (module-side research points).
 * Storage titles stay stable for archive/seed matching; UI may shorten nested leaves.
 */

/** Matches engine `SECTOR_RESEARCH_TOPIC_PREFIX` (D-126). */
const SECTOR_RESEARCH_TOPIC_PREFIX = 'Sector · ';
/** Legacy D-096 desk-focus prefix (still shortened in UI if present). */
const DESK_FOCUS_TOPIC_PREFIX = 'Desk focus · ';

const NESTED_TITLE_PREFIXES = [
  'Strategy class — ',
  'Strategy families — ',
  'Guardrail — ',
  'Compliance — ',
  'Trend lead — ',
  'Macro — ',
  'Event — ',
  'Sector — ',
] as const;

export type ResearchTopicDisplayKind = 'program' | 'group' | 'leaf';

export function researchTopicDisplayLabel(title: string, depth = 0): string {
  const trimmed = title.trim();
  if (depth <= 0) return trimmed;
  for (const prefix of NESTED_TITLE_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim() || trimmed;
    }
  }
  if (trimmed.startsWith(SECTOR_RESEARCH_TOPIC_PREFIX) && depth > 0) {
    return trimmed.slice(SECTOR_RESEARCH_TOPIC_PREFIX.length).trim() || trimmed;
  }
  // Desk focus · Label · Combination → show combination suffix under the focus parent.
  if (trimmed.startsWith(DESK_FOCUS_TOPIC_PREFIX)) {
    const afterPrefix = trimmed.slice(DESK_FOCUS_TOPIC_PREFIX.length);
    const sep = afterPrefix.lastIndexOf(' · ');
    if (sep >= 0) return afterPrefix.slice(sep + 3).trim() || trimmed;
  }
  return trimmed;
}

export function researchTopicDisplayKind(opts: {
  title: string;
  childCount: number;
  provenance?: string | null | undefined;
}): ResearchTopicDisplayKind {
  if (opts.childCount > 0) {
    if (
      opts.title === 'Current awareness' ||
      opts.title === 'Seeded trading mechanisms' ||
      opts.title.startsWith(SECTOR_RESEARCH_TOPIC_PREFIX) ||
      opts.title.startsWith(DESK_FOCUS_TOPIC_PREFIX)
    ) {
      return 'program';
    }
    return 'group';
  }
  return 'leaf';
}

export function researchTopicKindLabel(kind: ResearchTopicDisplayKind): string {
  switch (kind) {
    case 'program':
      return 'Program';
    case 'group':
      return 'Group';
    case 'leaf':
      return 'Research point';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
