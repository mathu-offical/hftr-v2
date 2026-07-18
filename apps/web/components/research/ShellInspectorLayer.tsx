'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ResearchGraphResponse, ResearchTopicDetail } from '@hftr/contracts';
import { api } from '@/lib/client';
import { ResearchInspector } from '@/components/research/ResearchInspector';
import { useResearchView } from '@/components/research/ResearchViewContext';

/**
 * Shell-level floating library/concept inspector (D-133).
 * Persists above Research / Posture / Data overlays; background = last left-tab view.
 */
function ShellInspectorLayerInner() {
  const rv = useResearchView();
  const [graph, setGraph] = useState<ResearchGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicForInspector, setTopicForInspector] = useState<ResearchTopicDetail | null>(null);

  const loadGraph = useCallback(async () => {
    if (!rv.companyId) return;
    setGraphLoading(true);
    try {
      const data = await api<ResearchGraphResponse>(
        `/api/companies/${rv.companyId}/research/graph`,
      );
      setGraph(data);
    } catch {
      setGraph({ nodes: [], links: [], tags: [], libraries: [], folders: [], articles: [] });
    } finally {
      setGraphLoading(false);
    }
  }, [rv.companyId]);

  useEffect(() => {
    if (!rv.pageInspectorOpen) return;
    void loadGraph();
  }, [rv.pageInspectorOpen, loadGraph, rv.inspectorTarget]);

  useEffect(() => {
    if (!rv.pageInspectorOpen) {
      setTopicForInspector(null);
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

  if (!rv.pageInspectorOpen || !rv.inspectorTarget) return null;

  return (
    <aside
      data-testid="research-page-inspector"
      className="pointer-events-auto absolute bottom-2 right-2 top-2 z-40 flex w-[min(420px,42%)] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)]/95 shadow-xl backdrop-blur-sm"
      aria-label={`${inspectorLabel} inspector`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-2.5 py-1.5">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          {inspectorLabel}
          {graphLoading ? ' · …' : ''}
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
          onGraphInvalidated={() => void loadGraph()}
        />
      </div>
    </aside>
  );
}

export const ShellInspectorLayer = memo(ShellInspectorLayerInner);
