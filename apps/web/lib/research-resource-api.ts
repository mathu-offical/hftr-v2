'use client';

import type { Library, ResearchTopic } from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  invalidateResearchResources,
  loadResearchResource,
  peekResearchResource,
  type ResearchShellKind,
} from '@/lib/research-resource-cache';

export type ResearchConceptRow = {
  id: string;
  moduleId: string;
  title: string;
  body: string;
  tags: string[];
  sourceClass: 'catalog_seed' | 'deterministic_placeholder' | 'model_generated' | 'operator';
  sourceRef: string;
  status: string;
  createdAt: string;
};

export type LibraryConceptPageRow = {
  conceptId: string;
  title: string;
  tags: string[];
};

export async function fetchCompanyLibraries(
  companyId: string,
  opts?: { force?: boolean },
): Promise<Library[]> {
  const loadOpts = {
    allowStale: opts?.force !== true,
    ...(opts?.force === true ? { force: true as const } : {}),
  };
  const result = await loadResearchResource(
    { kind: 'libraries', companyId },
    async () => {
      const data = await api<{ libraries: Library[] }>(`/api/companies/${companyId}/libraries`);
      return data.libraries;
    },
    loadOpts,
  );
  return result.data;
}

export async function fetchCompanyTopics(
  companyId: string,
  opts?: { force?: boolean },
): Promise<ResearchTopic[]> {
  const loadOpts = {
    allowStale: opts?.force !== true,
    ...(opts?.force === true ? { force: true as const } : {}),
  };
  const result = await loadResearchResource(
    { kind: 'topics', companyId },
    async () => {
      const data = await api<{ topics: ResearchTopic[] }>(
        `/api/companies/${companyId}/research/topics`,
      );
      return data.topics;
    },
    loadOpts,
  );
  return result.data;
}

export async function fetchCompanyConcepts(
  companyId: string,
  opts?: { force?: boolean },
): Promise<ResearchConceptRow[]> {
  const loadOpts = {
    allowStale: opts?.force !== true,
    ...(opts?.force === true ? { force: true as const } : {}),
  };
  const result = await loadResearchResource(
    { kind: 'concepts', companyId },
    async () => {
      const data = await api<{ concepts: ResearchConceptRow[] }>(
        `/api/companies/${companyId}/concepts`,
      );
      return data.concepts;
    },
    loadOpts,
  );
  return result.data;
}

export async function fetchLibraryConceptPages(
  companyId: string,
  libraryId: string,
  opts?: { force?: boolean },
): Promise<LibraryConceptPageRow[]> {
  const loadOpts = {
    allowStale: opts?.force !== true,
    ...(opts?.force === true ? { force: true as const } : {}),
  };
  const result = await loadResearchResource(
    { kind: 'libraryConcepts', companyId, libraryId },
    async () => {
      const data = await api<{
        libraryConcepts: { conceptId: string; title: string; tags?: string[] }[];
      }>(`/api/companies/${companyId}/libraries/${libraryId}/concepts`);
      return data.libraryConcepts
        .map((row) => ({
          conceptId: row.conceptId,
          title: row.title,
          tags: Array.isArray(row.tags) ? row.tags : [],
        }))
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    loadOpts,
  );
  return result.data;
}

/** Background warm for baseline / recently opened libraries. */
export function warmLibraryConceptPages(companyId: string, libraryId: string): void {
  const existing = peekResearchResource({
    kind: 'libraryConcepts',
    companyId,
    libraryId,
  });
  if (existing !== null) {
    void fetchLibraryConceptPages(companyId, libraryId, { force: false });
    return;
  }
  void fetchLibraryConceptPages(companyId, libraryId, { force: false }).catch(() => {
    // warm is best-effort
  });
}

export function refreshResearchShell(
  companyId: string,
  opts?: { force?: boolean; kinds?: ResearchShellKind[] },
): Promise<void> {
  const kinds = opts?.kinds ?? ['libraries', 'topics', 'concepts'];
  const force = opts?.force ?? false;
  return Promise.all(
    kinds.map(async (kind) => {
      if (kind === 'libraries') await fetchCompanyLibraries(companyId, { force });
      else if (kind === 'topics') await fetchCompanyTopics(companyId, { force });
      else if (kind === 'concepts') await fetchCompanyConcepts(companyId, { force });
      else if (kind === 'libraryConcepts') {
        invalidateResearchResources(companyId, ['libraryConcepts']);
      } else if (kind === 'archive') {
        invalidateResearchResources(companyId, ['archive']);
      } else {
        const _exhaustive: never = kind;
        void _exhaustive;
      }
    }),
  ).then(() => undefined);
}

export function invalidateAfterResearchMutation(
  companyId: string,
  scope: 'topics' | 'libraries' | 'concepts' | 'all' | 'libraryPages',
  libraryId?: string,
): void {
  switch (scope) {
    case 'topics':
      invalidateResearchResources(companyId, ['topics']);
      break;
    case 'libraries':
      invalidateResearchResources(companyId, ['libraries', 'libraryConcepts'], libraryId);
      break;
    case 'concepts':
      invalidateResearchResources(companyId, ['concepts', 'libraryConcepts'], libraryId);
      break;
    case 'libraryPages':
      invalidateResearchResources(companyId, ['libraryConcepts'], libraryId);
      break;
    case 'all':
      invalidateResearchResources(companyId);
      break;
    default: {
      const _exhaustive: never = scope;
      void _exhaustive;
    }
  }
}
