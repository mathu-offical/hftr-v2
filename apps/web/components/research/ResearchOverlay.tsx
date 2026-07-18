'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ResearchGraphResponse, ResearchTopicDetail } from '@hftr/contracts';
import { api } from '@/lib/client';
import { shortLibraryLabel } from '@/lib/research-library-shelves';
import { GalaxyView } from '@/components/research/GalaxyView';
import { ResearchInspector } from '@/components/research/ResearchInspector';
import { useResearchView } from '@/components/research/ResearchViewContext';

function ResearchOverlayInner() {
  const rv = useResearchView();
  const [graph, setGraph] = useState<ResearchGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicForInspector, setTopicForInspector] = useState<ResearchTopicDetail | null>(null);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
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
  }, []);

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
    if (rv.selectedLibraryId) {
      setSelectedLibraryIds([rv.selectedLibraryId]);
    }
  }, [rv.selectedLibraryId]);

  useEffect(() => {
    if (!rv.overlayOpen || !rv.pageInspectorOpen) {
      if (!rv.pageInspectorOpen) setTopicForInspector(null);
      return;
    }
    if (rv.inspectorTarget?.kind !== 'topic' || !rv.selectedTopicId) {
      setTopicForInspector(null);
      return;
    }
    if (rv.selectedTopic && rv.selectedTopic.id === rv.selectedTopicId) {
      setTopicForInspector(rv.selectedTopic);
      return;
    }
    let cancelled = false;
    setTopicLoading(true);
    void api<{ topic: ResearchTopicDetail }>(
      `/api/companies/${rv.companyId}/research/topics/${rv.selectedTopicId}`,
    )
      .then((data) => {
        if (!cancelled) setTopicForInspector(data.topic);
      })
      .catch(() => {
        if (!cancelled) setTopicForInspector(null);
      })
      .finally(() => {
        if (!cancelled) setTopicLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    rv.overlayOpen,
    rv.pageInspectorOpen,
    rv.inspectorTarget,
    rv.selectedTopicId,
    rv.selectedTopic,
    rv.companyId,
  ]);

  const inspectorLabel = useMemo(() => {
    const t = rv.inspectorTarget;
    if (!t) return 'Inspector';
    switch (t.kind) {
      case 'topic':
        return 'Page';
      case 'concept':
        return 'Concept';
      case 'library':
        return 'Library';
      case 'tag':
        return 'Tag';
      default: {
        const _exhaustive: never = t;
        return _exhaustive;
      }
    }
  }, [rv.inspectorTarget]);

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
                  toggleLibraryFilter(lib.id);
                  if (!selected) rv.inspectLibrary(lib.id, lib.name);
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
          className="h-full min-h-0 overflow-hidden border-0 rounded-none"
          onInspectConcept={(id) => rv.inspectConcept(id)}
          onGraphInvalidated={() => void loadGraph({ bumpQueries: false })}
        />

        {rv.pageInspectorOpen && (
          <aside
            data-testid="research-page-inspector"
            className="absolute bottom-2 right-2 top-2 z-30 flex w-[min(420px,42%)] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)]/95 shadow-xl backdrop-blur-sm"
            aria-label={`${inspectorLabel} inspector`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-2.5 py-1.5">
              <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                {inspectorLabel}
              </span>
              <button
                type="button"
                onClick={rv.closePageInspector}
                aria-label="Close inspector"
                className="rounded p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <ResearchInspector
                companyId={rv.companyId}
                target={rv.inspectorTarget}
                topic={topicForInspector ?? rv.selectedTopic}
                topicLoading={topicLoading && !topicForInspector && !rv.selectedTopic}
                graphNodes={graph?.nodes ?? []}
                onTopicPatched={(partial) => {
                  rv.patchSelectedTopic(partial);
                  setTopicForInspector((prev) => (prev ? { ...prev, ...partial } : prev));
                }}
                onGraphInvalidated={() => void loadGraph({ bumpQueries: false })}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export const ResearchOverlay = memo(ResearchOverlayInner);
