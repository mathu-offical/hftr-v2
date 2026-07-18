'use client';

import { memo, useMemo } from 'react';

export interface ResearchPageTopic {
  id: string;
  title: string;
  moduleId: string;
}

export interface ResearchPagesListProps {
  topics: ResearchPageTopic[];
  selectedTopicId: string | null;
  linkedTopicIds: string[];
  linkedTopicTitles: string[];
  onSelectTopic: (topicId: string) => void;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function ResearchPagesListInner(props: ResearchPagesListProps) {
  const linkedIdSet = useMemo(() => new Set(props.linkedTopicIds), [props.linkedTopicIds]);
  const linkedTitleSet = useMemo(
    () => new Set(props.linkedTopicTitles),
    [props.linkedTopicTitles],
  );

  const sorted = useMemo(
    () => [...props.topics].sort((a, b) => a.title.localeCompare(b.title)),
    [props.topics],
  );

  return (
    <div
      data-testid="research-pages-list"
      className="rounded-lg border border-[var(--color-line)] p-2.5"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">Pages</p>
      {sorted.length === 0 ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">No pages yet.</p>
      ) : (
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
          {sorted.map((topic) => {
            const selected = props.selectedTopicId === topic.id;
            const linked =
              linkedIdSet.has(topic.id) || linkedTitleSet.has(normalizeTitle(topic.title));
            return (
              <li key={topic.id}>
                <button
                  type="button"
                  onClick={() => props.onSelectTopic(topic.id)}
                  aria-pressed={selected}
                  aria-label={`Select page ${topic.title}`}
                  className={`w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] ${
                    selected
                      ? 'bg-[var(--color-surface-2)] text-[var(--color-accent)]'
                      : linked
                        ? 'border-l-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5 text-[var(--color-ink)]'
                        : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]'
                  }`}
                >
                  {topic.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const ResearchPagesList = memo(ResearchPagesListInner);
