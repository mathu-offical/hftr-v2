'use client';

import { memo, useMemo, useState } from 'react';
import {
  researchTopicDisplayKind,
  researchTopicDisplayLabel,
  researchTopicKindLabel,
  type ResearchTopicDisplayKind,
} from '@/lib/research-topic-display';
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
}

export interface ResearchPagesListProps {
  companyId: string;
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

function kindTone(kind: ResearchTopicDisplayKind): string {
  switch (kind) {
    case 'program':
      return 'text-[var(--color-accent)]';
    case 'group':
      return 'text-[var(--color-ink-dim)]';
    case 'leaf':
      return 'text-[var(--color-ink-faint)]';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function TopicRow(props: {
  node: TopicNode;
  depth: number;
  selectedTopicId: string | null;
  linkedIdSet: Set<string>;
  linkedTitleSet: Set<string>;
  onSelectTopic: (topicId: string) => void;
  onResearchTopic: (topicId: string) => void;
  researchingId: string | null;
  forceExpand: boolean;
  defaultOpen: boolean;
}) {
  const { topic, children } = props.node;
  const [open, setOpen] = useState(props.defaultOpen);
  const expanded = props.forceExpand || open;
  const kind = researchTopicDisplayKind({
    title: topic.title,
    childCount: children.length,
    provenance: topic.provenance ?? null,
  });
  const selected = props.selectedTopicId === topic.id;
  const linked =
    props.linkedIdSet.has(topic.id) ||
    props.linkedTitleSet.has(normalizeTitle(topic.title));
  const label = researchTopicDisplayLabel(topic.title, props.depth);
  const hasChildren = children.length > 0;
  const researching = props.researchingId === topic.id;

  return (
    <li>
      <div
        className="flex items-center gap-0.5"
        style={{ paddingLeft: props.depth * 8 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${topic.title}`}
            onClick={() => setOpen((v) => !v)}
            className="flex h-5 w-4 shrink-0 items-center justify-center text-[9px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            <span className={expanded ? 'inline-block rotate-90' : undefined}>▸</span>
          </button>
        ) : (
          <span className="inline-block w-4 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => props.onSelectTopic(topic.id)}
          aria-pressed={selected}
          aria-label={`Select research topic ${topic.title}`}
          title={topic.title !== label ? topic.title : undefined}
          className={`flex min-w-0 flex-1 items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-left text-[11px] ${
            selected
              ? 'bg-[var(--color-surface-2)] text-[var(--color-accent)]'
              : linked
                ? 'border-l-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5 text-[var(--color-ink)]'
                : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]'
          }`}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {typeof topic.conceptCount === 'number' ? (
            <span className="shrink-0 tabular-nums text-[9px] text-[var(--color-ink-faint)]">
              {topic.conceptCount}
            </span>
          ) : null}
          <span className={`shrink-0 text-[8px] uppercase tracking-wide ${kindTone(kind)}`}>
            {researchTopicKindLabel(kind)}
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
          className="shrink-0 rounded border border-[var(--color-line)] px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          {researching ? '…' : 'Research'}
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul className="mt-0.5 space-y-0.5 border-l border-[var(--color-line)]/50 ml-2 pl-1">
          {children.map((child) => (
            <TopicRow
              key={child.topic.id}
              node={child}
              depth={props.depth + 1}
              selectedTopicId={props.selectedTopicId}
              linkedIdSet={props.linkedIdSet}
              linkedTitleSet={props.linkedTitleSet}
              onSelectTopic={props.onSelectTopic}
              onResearchTopic={props.onResearchTopic}
              researchingId={props.researchingId}
              forceExpand={props.forceExpand}
              defaultOpen={false}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ResearchPagesListInner(props: ResearchPagesListProps) {
  const linkedIdSet = useMemo(() => new Set(props.linkedTopicIds), [props.linkedTopicIds]);
  const linkedTitleSet = useMemo(() => new Set(props.linkedTopicTitles), [props.linkedTopicTitles]);
  const forest = useMemo(() => buildTopicForest(props.topics), [props.topics]);
  const [filter, setFilter] = useState('');
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

  const filteredForest = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return forest;

    function matchNode(node: TopicNode): TopicNode | null {
      const label = researchTopicDisplayLabel(node.topic.title, 1).toLowerCase();
      const titleHit =
        node.topic.title.toLowerCase().includes(q) || label.includes(q);
      const kids = node.children
        .map((c) => matchNode(c))
        .filter((c): c is TopicNode => c !== null);
      if (titleHit || kids.length > 0) {
        return { topic: node.topic, children: titleHit ? node.children : kids };
      }
      return null;
    }

    return forest.map((n) => matchNode(n)).filter((n): n is TopicNode => n !== null);
  }, [filter, forest]);

  const topicCount = props.topics.length;
  const forceExpand = Boolean(filter.trim());

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
          Research topics
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
      <p className="mt-0.5 text-[9px] text-[var(--color-ink-faint)]">
        Module directives · library research queue (separate from posture / execution)
      </p>
      {queueMessage ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-dim)]" role="status">
          {queueMessage}
        </p>
      ) : null}
      {topicCount > 8 ? (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter topics…"
          aria-label="Filter research topics"
          className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
        />
      ) : null}
      {!props.topics.length ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">No research topics yet.</p>
      ) : filteredForest.length === 0 ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">No matching topics.</p>
      ) : (
        <ul className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto">
          {filteredForest.map((node) => (
            <TopicRow
              key={node.topic.id}
              node={node}
              depth={0}
              selectedTopicId={props.selectedTopicId}
              linkedIdSet={linkedIdSet}
              linkedTitleSet={linkedTitleSet}
              onSelectTopic={props.onSelectTopic}
              onResearchTopic={(topicId) =>
                void queueTopics({ topicIds: [topicId] }, 'one topic')
              }
              researchingId={researchingId}
              forceExpand={forceExpand}
              defaultOpen={node.children.length <= 12}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export const ResearchPagesList = memo(ResearchPagesListInner);
