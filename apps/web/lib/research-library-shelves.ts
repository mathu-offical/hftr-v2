export type LibraryShelfKind = 'system_curated' | 'runtime' | 'baseline_seeded';

const BASELINE_NAME = 'Seeded trading mechanisms';
const BASELINE_TOPIC_SCOPE = 'compile_time_mechanisms';

export function classifyLibraryShelf(lib: {
  name: string;
  topicScope: string;
}): LibraryShelfKind {
  if (lib.name === BASELINE_NAME || lib.topicScope === BASELINE_TOPIC_SCOPE) {
    return 'baseline_seeded';
  }
  if (lib.topicScope.startsWith('system:')) {
    return 'system_curated';
  }
  return 'runtime';
}

/** Match a library folder to its overview topic page by exact title (D-045 / D-049). */
export function findLibraryOverviewTopic(
  libraryName: string,
  topics: ReadonlyArray<{ id: string; title: string }>,
): { id: string; title: string } | null {
  const match = topics.find((t) => t.title === libraryName);
  return match ?? null;
}

/**
 * Compact label for chips / hulls. Module-derived library names often include
 * arrow chains (`A ← B → C`); keep the head segment and truncate.
 */
export function shortLibraryLabel(name: string, maxLen = 28): string {
  const head = name.split(/\s*[←→]\s*/)[0]?.trim() || name;
  if (head.length <= maxLen) return head;
  return `${head.slice(0, Math.max(1, maxLen - 1))}…`;
}

export function humanizeConceptTitle(title: string): string {
  return title.replace(/_/g, ' ');
}

export const LIBRARY_SHELF_LABELS: Record<LibraryShelfKind, string> = {
  system_curated: 'System curated (runtime)',
  runtime: 'Runtime (user / engine)',
  baseline_seeded: 'Baseline seeded',
};

export const LIBRARY_SHELF_ORDER: LibraryShelfKind[] = [
  'system_curated',
  'runtime',
  'baseline_seeded',
];
