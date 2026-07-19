'use client';

import { memo, useMemo, useState } from 'react';
import { researchTopicEngineChip } from '@/lib/research-topic-engine-groups';
import { api } from '@/lib/client';

export interface ResearchPageTopic {
  id: string;
  title: string;
  moduleId: string;
  parentTopicId?: string | null;
  conceptCount?: number | undefined;
  status?: string;
  priority?: string;
  provenance?: string | null | undefined;
  engineInstanceId?: string | null;
  engineLabel?: string | null;
  researchModuleName?: string | null;
}

export interface ResearchPagesListProps {
  companyId: string;
  topics: ResearchPageTopic[];
  selectedTopicId: string | null;
  linkedTopicIds: string[];
  linkedTopicTitles: string[];
  onSelectTopic: (topicId: string) => void;
  loading?: boolean;
  /** When false, topics stay blank (no research modules on canvas). */
  hasResearchModules?: boolean;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function TopicRow(props: {
  topic: ResearchPageTopic;
  selectedTopicId: string | null;
  linkedIdSet: Set<string>;
  linkedTitleSet: Set<string>;
  onSelectTopic: (topicId: string) => void;
  onResearchTopic: (topicId: string) => void;
  researchingId: string | null;
}) {
  const { topic } = props;
  const selected = props.selectedTopicId === topic.id;
  const linked =
    props.linkedIdSet.has(topic.id) ||
    props.linkedTitleSet.has(normalizeTitle(topic.title));
  const researching = props.researchingId === topic.id;
  const owner = researchTopicEngineChip(topic);

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => props.onSelectTopic(topic.id)}
          aria-pressed={selected}
          aria-label={`Select research topic ${topic.title}`}
          title={topic.title}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] ${
            selected
              ? 'bg-[var(--color-surface-2)] text-[var(--color-accent)]'
              : linked
                ? 'border-l-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5 text-[var(--color-ink)]'
                : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]'
          }`}
        >
          <span className="min-w-0 flex-1 truncate">{topic.title}</span>
          <span
            data-testid={`research-topic-engine-chip-${topic.id}`}
            title={owner}
            className="max-w-[8rem] shrink-0 truncate rounded border border-[var(--color-line)] px-1.5 py-px text-[9px] text-[var(--color-ink-dim)]"
          >
            {owner}
          </span>
        </button>
        <button
          type="button"
          data-testid={`research-topic-queue-${topic.id}`}
          disabled={researching || props.researchingId === 'all'}
          onClick={(e) => {
            e.stopPropagation();
            props.onResearchTopic(topic.id);
          }}
          title="Queue library research for this topic"
          aria-label={`Initiate research for ${topic.title}`}
          className="shrink-0 rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          {researching ? '…' : 'Research'}
        </button>
      </div>
    </li>
  );
}

function ResearchPagesListInner(props: ResearchPagesListProps) {
  const hasResearchModules = props.hasResearchModules !== false;
  const linkedIdSet = useMemo(() => new Set(props.linkedTopicIds), [props.linkedTopicIds]);
  const linkedTitleSet = useMemo(() => new Set(props.linkedTopicTitles), [props.linkedTopicTitles]);
  const [filter, setFilter] = useState('');
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

  const flatTopics = useMemo(() => {
    if (!hasResearchModules) return [];
    const q = filter.trim().toLowerCase();
    const rows = [...props.topics].sort((a, b) => {
      const ownerCmp = researchTopicEngineChip(a).localeCompare(researchTopicEngineChip(b));
      if (ownerCmp !== 0) return ownerCmp;
      return a.title.localeCompare(b.title);
    });
    if (!q) return rows;
    return rows.filter((t) => {
      const owner = researchTopicEngineChip(t).toLowerCase();
      return t.title.toLowerCase().includes(q) || owner.includes(q);
    });
  }, [filter, hasResearchModules, props.topics]);

  const topicCount = hasResearchModules ? props.topics.length : 0;

  async function queueTopics(body: { all: true } | { topicIds: string[] }, label: string) {
    if (!props.companyId) return;
    const researchingKey =
      'all' in body && body.all ? 'all' : 'topicIds' in body ? (body.topicIds[0] ?? 'one') : 'one';
    setResearchingId(researchingKey);
    setQueueMessage(null);
    try {
      const result = await api<{ queued: number; queueClass: string }>(
        `/api/companies/${props.companyId}/research/topics/research`,
        { method: 'POST', body },
      );
      setQueueMessage(
        `Queued ${result.queued} on library research lane${label ? ` (${label})` : ''}.`,
      );
    } catch {
      setQueueMessage('Could not queue library research.');
    } finally {
      setResearchingId(null);
    }
  }

  return (
    <div
      data-testid="research-pages-list"
      className="rounded-lg border border-[var(--color-line)] p-2.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Topics
        </p>
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums text-[9px] text-[var(--color-ink-faint)]">{topicCount}</span>
          {topicCount > 0 ? (
            <button
              type="button"
              data-testid="research-topics-queue-all"
              disabled={researchingId !== null}
              onClick={() => void queueTopics({ all: true }, 'all topics')}
              title="Queue library research for every topic"
              className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
            >
              {researchingId === 'all' ? 'Queuing…' : 'Research all'}
            </button>
          ) : null}
        </div>
      </div>
      {queueMessage ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-dim)]" role="status">
          {queueMessage}
        </p>
      ) : null}
      {!hasResearchModules ? (
        <p
          className="mt-1 text-[10px] text-[var(--color-ink-faint)]"
          data-testid="research-topics-empty-no-modules"
        >
          No research modules — topics stay empty until a research engine is on the canvas.
        </p>
      ) : topicCount > 8 ? (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter topics…"
          aria-label="Filter research topics"
          className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
        />
      ) : null}
      {hasResearchModules && !props.topics.length ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
          {props.loading ? 'Loading research topics…' : 'No research topics yet.'}
        </p>
      ) : hasResearchModules && flatTopics.length === 0 ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">No matching topics.</p>
      ) : hasResearchModules ? (
        <ul className="mt-1.5 max-h-72 space-y-0.5 overflow-y-auto">
          {flatTopics.map((topic) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              selectedTopicId={props.selectedTopicId}
              linkedIdSet={linkedIdSet}
              linkedTitleSet={linkedTitleSet}
              onSelectTopic={props.onSelectTopic}
              onResearchTopic={(topicId) =>
                void queueTopics({ topicIds: [topicId] }, 'one topic')
              }
              researchingId={researchingId}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const ResearchPagesList = memo(ResearchPagesListInner);
