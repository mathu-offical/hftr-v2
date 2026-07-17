'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ResearchTopic } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';

interface TopicNode {
  topic: ResearchTopic;
  children: TopicNode[];
}

function buildTopicTree(topics: ResearchTopic[]): TopicNode[] {
  const byParent = new Map<string | null, ResearchTopic[]>();
  for (const t of topics) {
    const key = t.parentTopicId;
    const list = byParent.get(key) ?? [];
    list.push(t);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }

  function walk(parentId: string | null): TopicNode[] {
    const rows = byParent.get(parentId) ?? [];
    return rows.map((topic) => ({ topic, children: walk(topic.id) }));
  }

  return walk(null);
}

function TopicBranch(props: {
  node: TopicNode;
  depth: number;
  companyId: string;
  moduleId: string;
  onResearch: (topic: ResearchTopic) => void;
  busyTopicId: string | null;
}) {
  const { topic, children } = props.node;
  return (
    <li>
      <div
        className="flex items-center gap-2 py-0.5"
        style={{ paddingLeft: `${props.depth * 12}px` }}
      >
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-ink)]">
          {topic.title}
        </span>
        <span className="text-[9px] uppercase text-[var(--color-ink-faint)]">{topic.priority}</span>
        <span className="text-[9px] text-[var(--color-ink-faint)]">{topic.status}</span>
        <button
          type="button"
          disabled={props.busyTopicId === topic.id}
          onClick={() => props.onResearch(topic)}
          aria-label={`Research topic ${topic.title}`}
          className="shrink-0 rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-accent)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {props.busyTopicId === topic.id ? '…' : 'Research'}
        </button>
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <TopicBranch
              key={child.topic.id}
              node={child}
              depth={props.depth + 1}
              companyId={props.companyId}
              moduleId={props.moduleId}
              onResearch={props.onResearch}
              busyTopicId={props.busyTopicId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export interface ResearchTopicsTreeProps {
  companyId: string;
  moduleId: string;
  moduleName: string;
}

function ResearchTopicsTreeInner(props: ResearchTopicsTreeProps) {
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyTopicId, setBusyTopicId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!props.companyId || !props.moduleId) return;
    try {
      const data = await api<{ topics: ResearchTopic[] }>(
        `/api/companies/${props.companyId}/research/topics?moduleId=${props.moduleId}`,
      );
      setTopics(data.topics);
    } catch {
      setTopics([]);
    } finally {
      setLoaded(true);
    }
  }, [props.companyId, props.moduleId]);

  useEffect(() => {
    setLoaded(false);
    void load();
  }, [load]);

  const tree = useMemo(() => buildTopicTree(topics), [topics]);

  async function createTopic(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/research/topics`, {
        method: 'POST',
        body: { moduleId: props.moduleId, title: trimmed },
      });
      setTitle('');
      setMessage('Topic created.');
      await load();
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.status === 404
          ? 'Topics API not available yet.'
          : 'Could not create topic.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function researchTopic(topic: ResearchTopic) {
    setBusyTopicId(topic.id);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}/curate`, {
        method: 'POST',
        body: {
          mode: 'manual',
          topicScope: topic.title,
          queryText: topic.title,
        },
      });
      setMessage(`Research queued for "${topic.title}".`);
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.status === 404
          ? 'Curation not available yet.'
          : 'Research request failed.',
      );
    } finally {
      setBusyTopicId(null);
    }
  }

  return (
    <div className="mt-2 border-t border-[var(--color-line)] pt-2">
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        Topics · {props.moduleName}
      </p>
      {!loaded ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">Loading topics…</p>
      ) : tree.length === 0 ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">No topics yet.</p>
      ) : (
        <ul className="mt-1">
          {tree.map((node) => (
            <TopicBranch
              key={node.topic.id}
              node={node}
              depth={0}
              companyId={props.companyId}
              moduleId={props.moduleId}
              onResearch={(topic) => void researchTopic(topic)}
              busyTopicId={busyTopicId}
            />
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void createTopic(e)} className="mt-2 space-y-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New topic title"
          aria-label={`New topic for ${props.moduleName}`}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add topic'}
          </button>
          {message && <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>}
        </div>
      </form>
    </div>
  );
}

export const ResearchTopicsTree = memo(ResearchTopicsTreeInner);
