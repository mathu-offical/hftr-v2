'use client';

import { memo, useMemo, useState } from 'react';
import { researchTopicDisplayLabel } from '@/lib/research-topic-display';

export type ResearchEntityType = 'topics' | 'concepts' | 'tags' | 'libraries';

const ENTITY_TYPES: ResearchEntityType[] = ['topics', 'concepts', 'tags', 'libraries'];

const ENTITY_LABELS: Record<ResearchEntityType, string> = {
  topics: 'Topics',
  concepts: 'Concepts',
  tags: 'Tags',
  libraries: 'Libraries',
};

const MAX_RESULTS = 40;

export interface ResearchEntitySearchConcept {
  id: string;
  title: string;
  tags: string[];
  body: string;
  sourceClass: string;
}

export interface ResearchEntitySearchProps {
  companyId: string;
  concepts: ResearchEntitySearchConcept[];
  topics: { id: string; title: string }[];
  libraries: { id: string; name: string }[];
  onSelectConcept: (conceptId: string) => void;
  onSelectTopic: (topicId: string) => void;
  onSelectTag: (tag: string) => void;
  onSelectLibrary: (libraryId: string) => void;
  highlightedTopicIds?: string[];
  /** Galaxy chrome is compact; panel uses bordered block (legacy). */
  variant?: 'panel' | 'galaxy';
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function ResearchEntitySearchInner(props: ResearchEntitySearchProps) {
  const [query, setQuery] = useState('');
  const [entityType, setEntityType] = useState<ResearchEntityType>('concepts');
  const galaxy = props.variant === 'galaxy';

  const normalizedQuery = normalizeQuery(query);

  const tagCorpus = useMemo(() => {
    const tags = new Set<string>();
    for (const c of props.concepts) {
      for (const t of c.tags) tags.add(t);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [props.concepts]);

  const results = useMemo(() => {
    const q = normalizedQuery;
    switch (entityType) {
      case 'topics': {
        const rows = props.topics.filter((t) => {
          if (!q) return true;
          const display = researchTopicDisplayLabel(t.title, 1).toLowerCase();
          return t.title.toLowerCase().includes(q) || display.includes(q);
        });
        return rows.slice(0, MAX_RESULTS).map((t) => ({
          key: t.id,
          label: researchTopicDisplayLabel(t.title, 1),
          meta: props.highlightedTopicIds?.includes(t.id) ? 'linked' : undefined,
          onSelect: () => props.onSelectTopic(t.id),
        }));
      }
      case 'concepts': {
        const rows = props.concepts.filter(
          (c) =>
            !q ||
            c.title.toLowerCase().includes(q) ||
            c.body.toLowerCase().includes(q) ||
            c.tags.some((tag) => tag.toLowerCase().includes(q)),
        );
        return rows.slice(0, MAX_RESULTS).map((c) => ({
          key: c.id,
          label: c.title,
          meta: c.sourceClass,
          onSelect: () => props.onSelectConcept(c.id),
        }));
      }
      case 'tags': {
        const rows = tagCorpus.filter((t) => !q || t.toLowerCase().includes(q));
        return rows.slice(0, MAX_RESULTS).map((t) => ({
          key: t,
          label: t,
          meta: undefined,
          onSelect: () => props.onSelectTag(t),
        }));
      }
      case 'libraries': {
        const rows = props.libraries.filter((l) => !q || l.name.toLowerCase().includes(q));
        return rows.slice(0, MAX_RESULTS).map((l) => ({
          key: l.id,
          label: l.name,
          meta: undefined,
          onSelect: () => props.onSelectLibrary(l.id),
        }));
      }
      default: {
        const _exhaustive: never = entityType;
        return _exhaustive;
      }
    }
  }, [
    entityType,
    normalizedQuery,
    props.concepts,
    props.topics,
    props.libraries,
    props.highlightedTopicIds,
    props.onSelectConcept,
    props.onSelectTopic,
    props.onSelectTag,
    props.onSelectLibrary,
    tagCorpus,
  ]);

  return (
    <div
      data-testid="research-entity-search"
      className={
        galaxy
          ? 'min-w-0'
          : 'rounded-lg border border-[var(--color-line)] p-2.5'
      }
    >
      {!galaxy ? (
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Entity search
        </p>
      ) : null}
      <div className={galaxy ? 'flex flex-wrap items-center gap-2' : undefined}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${ENTITY_LABELS[entityType].toLowerCase()}…`}
          aria-label="Research entity search"
          className={`${galaxy ? 'min-w-[12rem] flex-1' : 'mt-1.5 w-full'} rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]`}
        />
        <div
          className={`${galaxy ? '' : 'mt-1.5'} flex flex-wrap gap-1`}
          role="group"
          aria-label="Entity type"
        >
          {ENTITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={entityType === type}
              onClick={() => setEntityType(type)}
              className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                entityType === type
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {ENTITY_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
      <ul
        className={`${galaxy ? 'mt-1.5 max-h-36' : 'mt-1.5 max-h-48'} space-y-0.5 overflow-y-auto`}
      >
        {results.length === 0 ? (
          <li className="text-[10px] text-[var(--color-ink-faint)]">No matches.</li>
        ) : (
          results.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={row.onSelect}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]"
              >
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {row.meta && (
                  <span className="shrink-0 text-[8px] uppercase text-[var(--color-ink-faint)]">
                    {row.meta}
                  </span>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export const ResearchEntitySearch = memo(ResearchEntitySearchInner);
