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
