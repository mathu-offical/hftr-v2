'use client';

import { memo, useMemo, useState } from 'react';
import { articleDisplayTags, isResearchArticleConcept } from '@hftr/contracts';
import { shortLibraryLabel } from '@/lib/research-library-shelves';

export type ResearchArticleRow = {
  id: string;
  title: string;
  tags: string[];
  primaryLibraryId?: string | null;
  sourceClass?: string | null;
  createdAt?: string | Date | null;
};

export interface ResearchArticlesListProps {
  articles: ResearchArticleRow[];
  libraries: Array<{ id: string; name: string }>;
  selectedConceptId?: string | null;
  onSelectArticle: (conceptId: string) => void;
  loading?: boolean;
}

function ResearchArticlesListInner(props: ResearchArticlesListProps) {
  const [filter, setFilter] = useState('');
  const libraryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const lib of props.libraries) map.set(lib.id, lib.name);
    return map;
  }, [props.libraries]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return props.articles
      .filter((a) => isResearchArticleConcept(a.tags))
      .filter((a) => {
        if (!q) return true;
        if (a.title.toLowerCase().includes(q)) return true;
        return articleDisplayTags(a.tags).some((t) => t.toLowerCase().includes(q));
      });
  }, [props.articles, filter]);

  return (
    <div
      data-testid="research-articles-panel"
      className="rounded-lg border border-[var(--color-line)] p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-faint)]">
          Articles
          {rows.length > 0 ? (
            <span className="ml-1 text-[var(--color-ink-dim)]">{rows.length}</span>
          ) : null}
        </p>
      </div>
      <p className="mt-0.5 text-[9px] text-[var(--color-ink-faint)]">
        Agent / operator research articles saved into libraries — topics become articles after
        research runs.
      </p>

      {rows.length > 8 ? (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter articles"
          aria-label="Filter research articles"
          className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
        />
      ) : null}

      {props.loading ? (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">Loading articles…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">
          No articles yet. Submit one or run Research on a topic.
        </p>
      ) : (
        <ul className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto">
          {rows.map((article) => {
            const chips = articleDisplayTags(article.tags);
            const libName = article.primaryLibraryId
              ? libraryNameById.get(article.primaryLibraryId)
              : null;
            const selected = props.selectedConceptId === article.id;
            return (
              <li key={article.id}>
                <button
                  type="button"
                  data-testid={`research-article-${article.id}`}
                  onClick={() => props.onSelectArticle(article.id)}
                  className={`flex w-full flex-col gap-0.5 rounded-md border px-1.5 py-1 text-left ${
                    selected
                      ? 'border-[var(--color-accent)] bg-[var(--color-surface-1)]'
                      : 'border-transparent hover:border-[var(--color-line)] hover:bg-[var(--color-surface-1)]'
                  }`}
                >
                  <span className="truncate text-[11px] text-[var(--color-ink)]">
                    {article.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    {chips.map((tag) => (
                      <span
                        key={tag}
                        className="max-w-[6.5rem] truncate rounded-full border border-[var(--color-line)] px-1.5 py-0 text-[8px] text-[var(--color-ink-faint)]"
                        title={tag}
                      >
                        {tag}
                      </span>
                    ))}
                    {libName ? (
                      <span
                        className="truncate text-[8px] text-[var(--color-ink-faint)]"
                        title={libName}
                      >
                        · {shortLibraryLabel(libName, 18)}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const ResearchArticlesList = memo(ResearchArticlesListInner);
