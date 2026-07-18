'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import type { ResearchGraphResponse, ResearchTopicDetail, TopicConcept } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import {
  buildWikilinkContextFromTopic,
  parseWikilinkHref,
  preprocessSynopsisWikilinks,
} from '@/lib/research-wikilinks';
import { GalaxyView } from '@/components/research/GalaxyView';
import { useResearchView } from '@/components/research/ResearchViewContext';

function usageLine(queryCount: number, referenceCount: number): string {
  return `Queried ${queryCount} · Referenced ${referenceCount}`;
}

function ConceptSection(props: { membership: TopicConcept; defaultOpen: boolean }) {
  const [open, setOpen] = useState(props.defaultOpen);
  const m = props.membership;
  const title = m.title ?? 'Untitled concept';
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)]"
    >
      <summary className="cursor-pointer px-2.5 py-2 text-[11px] font-medium text-[var(--color-ink)]">
        <span>{title}</span>
        {m.role && (
          <span className="ml-2 text-[9px] font-normal uppercase text-[var(--color-ink-faint)]">
            {m.role}
          </span>
        )}
        {(m.queryCount !== undefined || m.referenceCount !== undefined) && (
          <span className="ml-2 text-[9px] font-normal text-[var(--color-ink-faint)]">
            {usageLine(m.queryCount ?? 0, m.referenceCount ?? 0)}
          </span>
        )}
      </summary>
      <div className="border-t border-[var(--color-line)] px-2.5 py-2">
        {m.tags && m.tags.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {m.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-faint)]"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        {m.curationStatus && (
          <p className="mb-1 text-[9px] text-[var(--color-ink-faint)]">
            Library admission: {m.curationStatus.replace(/_/g, ' ')}
          </p>
        )}
        {m.body ? (
          <div className="prose prose-invert max-w-none text-[11px] text-[var(--color-ink-dim)] prose-p:my-1">
            <ReactMarkdown>{m.body}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-[10px] text-[var(--color-ink-faint)]">No body excerpt yet.</p>
        )}
      </div>
    </details>
  );
}

function ArticleTab(props: {
  companyId: string;
  topic: ResearchTopicDetail | null;
  loading: boolean;
  onTopicPatched: (partial: Partial<ResearchTopicDetail>) => void;
}) {
  const rv = useResearchView();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const wikilinkCtx = useMemo(
    () => (props.topic ? buildWikilinkContextFromTopic(props.topic) : null),
    [props.topic],
  );

  const renderedSynopsis = useMemo(() => {
    if (!props.topic?.synopsisMd || !wikilinkCtx) return '';
    return preprocessSynopsisWikilinks(props.topic.synopsisMd, wikilinkCtx);
  }, [props.topic?.synopsisMd, wikilinkCtx]);

  const synopsisMarkdownComponents = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const target = href ? parseWikilinkHref(href) : null;
        if (!target) {
          return (
            <a href={href} className="text-[var(--color-accent)] underline">
              {children}
            </a>
          );
        }
        return (
          <button
            type="button"
            data-testid={`wikilink-${target.kind}-${target.id}`}
            onClick={() => {
              if (target.kind === 'concept') {
                rv.focusConcept(target.id);
              } else {
                void rv.selectTopic(target.id);
              }
            }}
            className="cursor-pointer border-0 bg-transparent p-0 text-[var(--color-accent)] underline"
          >
            {children}
          </button>
        );
      },
    }),
    [rv],
  );

  useEffect(() => {
    if (props.topic) {
      setDraft(props.topic.synopsisMd ?? '');
      setEditing(false);
      setSaveError(null);
    }
  }, [props.topic?.id, props.topic?.synopsisMd]);

  if (props.loading) {
    return <p className="p-4 text-[11px] text-[var(--color-ink-faint)]">Loading article…</p>;
  }
  if (!props.topic) {
    return (
      <p className="flex flex-1 items-center justify-center p-6 text-center text-[11px] text-[var(--color-ink-faint)]">
        Select a topic from the left panel to read its hybrid article.
      </p>
    );
  }

  const topic = props.topic;

  const saveSynopsis = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const data = await api<{ topic: ResearchTopicDetail }>(
        `/api/companies/${props.companyId}/research/topics/${topic.id}`,
        { method: 'PATCH', body: { synopsisMd: draft } },
      );
      props.onTopicPatched({
        synopsisMd: data.topic.synopsisMd,
        title: data.topic.title,
        status: data.topic.status,
        priority: data.topic.priority,
        updatedAt: data.topic.updatedAt,
      });
      setEditing(false);
    } catch (err) {
      if (err instanceof RequestError && err.code === 'synopsis_leak_lint_failed') {
        setSaveError('Synopsis rejected: raw numbers or dates are not allowed in article text.');
      } else {
        setSaveError('Could not save synopsis. Try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <header className="mb-3 border-b border-[var(--color-line)] pb-2">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">{topic.title}</h2>
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
          {topic.status} · {topic.priority} priority ·{' '}
          {topic.conceptCount ?? topic.memberships.length} concepts
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
          {usageLine(topic.queryCount, topic.referenceCount)}
        </p>
      </header>

      <section aria-label="Topic synopsis" className="mb-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Synopsis
          </p>
          {!editing ? (
            <button
              type="button"
              data-testid="article-edit-synopsis"
              onClick={() => {
                setDraft(topic.synopsisMd ?? '');
                setEditing(true);
              }}
              className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                type="button"
                data-testid="article-save-synopsis"
                disabled={saving}
                onClick={() => void saveSynopsis()}
                className="rounded border border-[var(--color-accent)] px-2 py-0.5 text-[10px] text-[var(--color-accent)] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                data-testid="article-cancel-synopsis"
                disabled={saving}
                onClick={() => {
                  setDraft(topic.synopsisMd ?? '');
                  setEditing(false);
                  setSaveError(null);
                }}
                className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-faint)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <textarea
            data-testid="article-synopsis-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            aria-label="Edit topic synopsis markdown"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
        ) : topic.synopsisMd ? (
          <div className="prose prose-invert max-w-none text-[12px] text-[var(--color-ink-dim)] prose-p:my-1.5 prose-headings:text-[var(--color-ink)]">
            <ReactMarkdown components={synopsisMarkdownComponents}>
              {renderedSynopsis}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-[11px] text-[var(--color-ink-faint)]">No synopsis yet.</p>
        )}
        {saveError && (
          <p className="mt-1 text-[10px] text-[var(--color-warn)]" role="alert">
            {saveError}
          </p>
        )}
      </section>

      <section aria-label="Concept sections">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Member concepts
        </p>
        {topic.memberships.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            No concepts linked to this topic yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {topic.memberships.map((m, i) => (
              <li key={m.id}>
                <ConceptSection membership={m} defaultOpen={i === 0} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ResearchOverlayInner() {
  const rv = useResearchView();
  const [graph, setGraph] = useState<ResearchGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [articleLoading, setArticleLoading] = useState(false);
  const [topicForArticle, setTopicForArticle] = useState<ResearchTopicDetail | null>(null);
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
        setGraph({ nodes: [], links: [], tags: [], libraries: [] });
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
    if (!rv.overlayOpen || rv.activeTab !== 'article' || !rv.selectedTopicId) {
      if (rv.activeTab !== 'article') setTopicForArticle(null);
      return;
    }
    if (rv.selectedTopic && rv.selectedTopic.id === rv.selectedTopicId) {
      setTopicForArticle(rv.selectedTopic);
      return;
    }
    let cancelled = false;
    setArticleLoading(true);
    void api<{ topic: ResearchTopicDetail }>(
      `/api/companies/${rv.companyId}/research/topics/${rv.selectedTopicId}`,
    )
      .then((data) => {
        if (!cancelled) setTopicForArticle(data.topic);
      })
      .catch(() => {
        if (!cancelled) setTopicForArticle(null);
      })
      .finally(() => {
        if (!cancelled) setArticleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rv.overlayOpen, rv.activeTab, rv.selectedTopicId, rv.selectedTopic, rv.companyId]);

  if (!rv.overlayOpen) return null;

  return (
    <div
      data-testid="research-overlay"
      className="absolute inset-0 z-20 flex flex-col border border-[var(--color-line)] bg-[var(--color-surface-0)]/95 shadow-lg backdrop-blur-sm"
      role="dialog"
      aria-label="Research workspace"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="research-tab-galaxy"
            onClick={() => rv.setActiveTab('galaxy')}
            aria-pressed={rv.activeTab === 'galaxy'}
            className={`rounded px-2.5 py-1 text-xs ${
              rv.activeTab === 'galaxy'
                ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
            }`}
          >
            Galaxy
          </button>
          <button
            type="button"
            data-testid="research-tab-article"
            onClick={() => rv.setActiveTab('article')}
            aria-pressed={rv.activeTab === 'article'}
            className={`rounded px-2.5 py-1 text-xs ${
              rv.activeTab === 'article'
                ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
            }`}
          >
            Page
          </button>
        </div>
        <div className="flex items-center gap-2">
          {rv.selectedTopicId && rv.activeTab === 'galaxy' && (
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
          {rv.selectedTopicId && (
            <button
              type="button"
              onClick={rv.clearTopicFocus}
              className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Clear topic focus
            </button>
          )}
          <button
            type="button"
            onClick={rv.closeOverlay}
            aria-label="Close research overlay"
            className="rounded p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </header>

      {rv.activeTab === 'galaxy' && (graph?.libraries?.length ?? 0) > 0 && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--color-line)] px-3 py-1.5"
          role="toolbar"
          aria-label="Library nest filters"
        >
          {(graph?.libraries ?? []).map((lib) => {
            const selected = selectedLibraryIds.includes(lib.id);
            return (
              <button
                key={lib.id}
                type="button"
                data-testid={`galaxy-library-chip-${lib.id}`}
                onClick={() => toggleLibraryFilter(lib.id)}
                aria-pressed={selected}
                aria-label={`Filter galaxy by library ${lib.name}`}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  selected
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
                }`}
              >
                {lib.name}
                {lib.conceptCount !== undefined && (
                  <span className="ml-1 text-[9px] opacity-70">{lib.conceptCount}</span>
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
              className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Clear libraries
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {rv.activeTab === 'galaxy' ? (
          <>
            {graphLoading && !graph && (
              <p className="px-4 pt-3 text-[11px] text-[var(--color-ink-faint)]">Loading galaxy…</p>
            )}
            <GalaxyView
              companyId={rv.companyId}
              nodes={graph?.nodes ?? []}
              links={graph?.links ?? []}
              tags={graph?.tags ?? []}
              libraries={graph?.libraries ?? []}
              focusConceptIds={effectiveFocusConceptIds}
              highlightConceptId={rv.highlightConceptId}
              selectedLibraryIds={selectedLibraryIds.length > 0 ? selectedLibraryIds : null}
              className="h-full min-h-0 border-0 rounded-none"
            />
          </>
        ) : (
          <ArticleTab
            companyId={rv.companyId}
            topic={topicForArticle ?? rv.selectedTopic}
            loading={articleLoading && !topicForArticle && !rv.selectedTopic}
            onTopicPatched={(partial) => {
              rv.patchSelectedTopic(partial);
              setTopicForArticle((prev) => (prev ? { ...prev, ...partial } : prev));
            }}
          />
        )}
      </div>
    </div>
  );
}

export const ResearchOverlay = memo(ResearchOverlayInner);
