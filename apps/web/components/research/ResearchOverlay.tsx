'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ResearchGraphResponse, ResearchTopic } from '@hftr/contracts';
import { api } from '@/lib/client';
import { shortLibraryLabel } from '@/lib/research-library-shelves';
import { GalaxyView } from '@/components/research/GalaxyView';
import { ResearchEntitySearch } from '@/components/research/ResearchEntitySearch';
import { useResearchView } from '@/components/research/ResearchViewContext';

function ResearchOverlayInner() {
  const rv = useResearchView();
  const [graph, setGraph] = useState<ResearchGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [searchTopics, setSearchTopics] = useState<Array<{ id: string; title: string }>>([]);
  const bumpQueriesDoneRef = useRef(false);

  const effectiveFocusConceptIds = useMemo(() => {
    if (!rv.focusConceptIds) return null;
    if (!rv.includeNeighbors || !graph?.links?.length) return rv.focusConceptIds;
    const expanded = new Set(rv.focusConceptIds);
    for (const link of graph.links) {
      if (expanded.has(link.fromConceptId)) expanded.add(link.toConceptId);
      if (expanded.has(link.toConceptId)) expanded.add(link.fromConceptId);
    }
    return [...expanded];
  }, [rv.focusConceptIds, rv.includeNeighbors, graph?.links]);

  const loadGraph = useCallback(
    async (opts?: { bumpQueries?: boolean }) => {
      if (!rv.companyId) return;
      setGraphLoading(true);
      try {
        const qs = opts?.bumpQueries ? '?bumpQueries=1' : '';
        const data = await api<ResearchGraphResponse>(
          `/api/companies/${rv.companyId}/research/graph${qs}`,
        );
        setGraph(data);
      } catch {
        setGraph({ nodes: [], links: [], tags: [], libraries: [], folders: [], articles: [] });
      } finally {
        setGraphLoading(false);
      }
    },
    [rv.companyId],
  );

  const toggleLibraryFilter = useCallback((libraryId: string) => {
    setSelectedLibraryIds((prev) =>
      prev.includes(libraryId) ? prev.filter((id) => id !== libraryId) : [...prev, libraryId],
    );
  }, []);

  const clearLibraryFilters = useCallback(() => {
    setSelectedLibraryIds([]);
    rv.clearLibrarySelection();
  }, [rv.clearLibrarySelection]);

  useEffect(() => {
    if (!rv.overlayOpen) {
      bumpQueriesDoneRef.current = false;
      return;
    }
    const bumpQueries = !bumpQueriesDoneRef.current;
    if (bumpQueries) bumpQueriesDoneRef.current = true;
    void loadGraph({ bumpQueries });
    const interval = setInterval(() => void loadGraph({ bumpQueries: false }), 30_000);
    return () => clearInterval(interval);
  }, [rv.overlayOpen, loadGraph]);

  useEffect(() => {
    if (!rv.overlayOpen || !rv.companyId) return;
    let cancelled = false;
    void api<{ topics: ResearchTopic[] }>(`/api/companies/${rv.companyId}/research/topics`)
      .then((data) => {
        if (cancelled) return;
        setSearchTopics(
          data.topics
            .filter((t) => t.status === 'active' || t.status === 'deferred')
            .map((t) => ({ id: t.id, title: t.title })),
        );
      })
      .catch(() => {
        if (!cancelled) setSearchTopics([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rv.overlayOpen, rv.companyId, graph?.nodes?.length]);

  useEffect(() => {
    if (rv.selectedLibraryId) {
      setSelectedLibraryIds([rv.selectedLibraryId]);
    } else {
      setSelectedLibraryIds([]);
    }
  }, [rv.selectedLibraryId]);

  if (!rv.overlayOpen) return null;

  return (
    <div
      data-testid="research-overlay"
      className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface-0)]/95 shadow-lg backdrop-blur-sm"
      role="dialog"
      aria-label="Research workspace"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <span className="text-xs font-medium text-[var(--color-ink)]">Galaxy</span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {rv.focusConceptIds && rv.focusConceptIds.length > 0 && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--color-ink-dim)]">
              <input
                type="checkbox"
                data-testid="galaxy-include-neighbors"
                checked={rv.includeNeighbors}
                onChange={(e) => rv.setIncludeNeighbors(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              Include neighbors
            </label>
          )}
          {(rv.selectedTopicId || rv.focusConceptIds) && (
            <button
              type="button"
              onClick={rv.clearTopicFocus}
              className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Clear focus
            </button>
          )}
          {!rv.pageInspectorOpen && rv.inspectorTarget && (
            <button
              type="button"
              data-testid="open-page-inspector"
              onClick={rv.openPageInspector}
              className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Open inspector
            </button>
          )}
          <button
            type="button"
            onClick={rv.closeResearchWorkspace}
            aria-label="Close research workspace"
            title="Close research panel"
            data-testid="close-research-workspace"
            className="rounded p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </header>

      <div className="shrink-0 border-b border-[var(--color-line)] px-3 py-2">
        <ResearchEntitySearch
          companyId={rv.companyId}
          variant="galaxy"
          concepts={(graph?.nodes ?? []).map((n) => ({
            id: n.id,
            title: n.title,
            tags: n.tags,
            body: n.body,
            sourceClass: n.sourceClass,
          }))}
          topics={searchTopics}
          libraries={(graph?.libraries ?? []).map((l) => ({ id: l.id, name: l.name }))}
          highlightedTopicIds={rv.linkedTopicIds}
          onSelectConcept={(conceptId) => rv.inspectConcept(conceptId)}
          onSelectTopic={(topicId) => void rv.selectTopic(topicId)}
          onSelectTag={(tag) => {
            const ids = (graph?.nodes ?? [])
              .filter((n) => n.tags.includes(tag))
              .map((n) => n.id);
            rv.inspectTag(tag, ids);
          }}
          onSelectLibrary={(libraryId) => {
            const lib = (graph?.libraries ?? []).find((l) => l.id === libraryId);
            rv.inspectLibrary(libraryId, lib?.name ?? 'Library');
          }}
        />
      </div>

      {(graph?.libraries?.length ?? 0) > 0 && (
        <div
          className="flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-contain border-b border-[var(--color-line)] px-3 py-1.5"
          role="toolbar"
          aria-label="Library nest filters"
        >
          {(graph?.libraries ?? []).map((lib) => {
            const selected = selectedLibraryIds.includes(lib.id);
            const label = shortLibraryLabel(lib.name, 26);
            return (
              <button
                key={lib.id}
                type="button"
                data-testid={`galaxy-library-chip-${lib.id}`}
                title={lib.name}
                onClick={() => {
                  // Nest filter only — do not open library inspector (keeps full-galaxy
                  // readable; shelves/inspector remain the inspect entry points).
                  toggleLibraryFilter(lib.id);
                }}
                aria-pressed={selected}
                aria-label={`Filter galaxy by library ${lib.name}`}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                  selected
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
                }`}
              >
                {label}
                {lib.conceptCount !== undefined && (
                  <span className="ml-1 text-[9px] opacity-70"> {lib.conceptCount}</span>
                )}
              </button>
            );
          })}
          {selectedLibraryIds.length > 0 && (
            <button
              type="button"
              data-testid="galaxy-clear-library-filters"
              onClick={clearLibraryFilters}
              aria-label="Clear library filters"
              className="shrink-0 rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Clear libraries
            </button>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {graphLoading && !graph && (
          <p className="px-4 pt-3 text-[11px] text-[var(--color-ink-faint)]">Loading galaxy…</p>
        )}
        <GalaxyView
          companyId={rv.companyId}
          nodes={graph?.nodes ?? []}
          links={graph?.links ?? []}
          tags={graph?.tags ?? []}
          libraries={graph?.libraries ?? []}
          folders={graph?.folders ?? []}
          articles={graph?.articles ?? []}
          focusConceptIds={effectiveFocusConceptIds}
          highlightConceptId={rv.highlightConceptId}
          selectedLibraryIds={selectedLibraryIds.length > 0 ? selectedLibraryIds : null}
          loading={graphLoading && !graph}
          className="h-full min-h-0 overflow-hidden border-0 rounded-none"
          onInspectConcept={(id) => rv.inspectConcept(id)}
          onGraphInvalidated={() => void loadGraph({ bumpQueries: false })}
        />
      </div>
    </div>
  );
}

export const ResearchOverlay = memo(ResearchOverlayInner);
