'use client';

import { memo, useMemo } from 'react';

export interface ResearchPageTopic {
  id: string;
  title: string;
  moduleId: string;
  parentTopicId?: string | null;
}

export interface ResearchPagesListProps {
  topics: ResearchPageTopic[];
  selectedTopicId: string | null;
  linkedTopicIds: string[];
  linkedTopicTitles: string[];
  onSelectTopic: (topicId: string) => void;
}

type TopicNode = {
  topic: ResearchPageTopic;
  children: TopicNode[];
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function buildTopicForest(topics: ResearchPageTopic[]): TopicNode[] {
  const byParent = new Map<string | null, ResearchPageTopic[]>();
  const ids = new Set(topics.map((t) => t.id));
  for (const t of topics) {
    const parent =
      t.parentTopicId && ids.has(t.parentTopicId) ? t.parentTopicId : null;
    const list = byParent.get(parent) ?? [];
    list.push(t);
    byParent.set(parent, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }
  function walk(parentId: string | null): TopicNode[] {
    return (byParent.get(parentId) ?? []).map((topic) => ({
      topic,
      children: walk(topic.id),
    }));
  }
  return walk(null);
}

function flattenForest(nodes: TopicNode[], depth = 0): Array<{ topic: ResearchPageTopic; depth: number }> {
  const out: Array<{ topic: ResearchPageTopic; depth: number }> = [];
  for (const node of nodes) {
    out.push({ topic: node.topic, depth });
    out.push(...flattenForest(node.children, depth + 1));
  }
  return out;
}

function ResearchPagesListInner(props: ResearchPagesListProps) {
  const linkedIdSet = useMemo(() => new Set(props.linkedTopicIds), [props.linkedTopicIds]);
  const linkedTitleSet = useMemo(() => new Set(props.linkedTopicTitles), [props.linkedTopicTitles]);

  const rows = useMemo(() => flattenForest(buildTopicForest(props.topics)), [props.topics]);

  return (
    <div
      data-testid="research-pages-list"
      className="rounded-lg border border-[var(--color-line)] p-2.5"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">Pages</p>
      <p className="mt-0.5 text-[9px] text-[var(--color-ink-faint)]">
        Module directives · concepts stay library-side
      </p>
      {rows.length === 0 ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">No pages yet.</p>
      ) : (
        <ul className="mt-1 max-h-56 space-y-0.5 overflow-y-auto">
          {rows.map(({ topic, depth }) => {
            const selected = props.selectedTopicId === topic.id;
            const linked =
              linkedIdSet.has(topic.id) || linkedTitleSet.has(normalizeTitle(topic.title));
            return (
              <li key={topic.id} style={{ paddingLeft: depth * 10 }}>
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
                  {depth > 0 ? (
                    <span className="mr-1 text-[var(--color-ink-faint)]">↳</span>
                  ) : null}
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
