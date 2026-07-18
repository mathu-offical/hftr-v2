'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ResearchTopic } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';

interface TopicNode {
  topic: ResearchTopic;
  children: TopicNode[];
}

export interface ResearchModuleOption {
  id: string;
  name: string;
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

function formatUsage(topic: ResearchTopic): string {
  return `Q ${topic.queryCount} · Ref ${topic.referenceCount}`;
}

function TopicBranch(props: {
  node: TopicNode;
  depth: number;
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string) => void;
  onResearch: (topic: ResearchTopic) => void;
  busyTopicId: string | null;
}) {
  const { topic, children } = props.node;
  const selected = props.selectedTopicId === topic.id;
  return (
    <li>
      <div
        data-testid={`research-topic-${topic.id}`}
        className={`flex items-center gap-1.5 rounded py-0.5 ${
          selected ? 'bg-[var(--color-surface-2)]' : ''
        }`}
        style={{ paddingLeft: `${props.depth * 12}px` }}
      >
        <button
          type="button"
          onClick={() => props.onSelectTopic(topic.id)}
          aria-pressed={selected}
          aria-label={`Select topic ${topic.title}`}
          className="min-w-0 flex-1 truncate text-left text-[11px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
        >
          {topic.title}
        </button>
        <span className="shrink-0 text-[9px] text-[var(--color-ink-faint)]">
          {topic.conceptCount ?? 0}
        </span>
        <span className="hidden shrink-0 text-[8px] text-[var(--color-ink-faint)] sm:inline">
          {formatUsage(topic)}
        </span>
        <span className="shrink-0 text-[9px] uppercase text-[var(--color-ink-faint)]">
          {topic.priority}
        </span>
        <span className="shrink-0 text-[9px] text-[var(--color-ink-faint)]">{topic.status}</span>
        <button
          type="button"
          disabled={props.busyTopicId === topic.id}
          onClick={(e) => {
            e.stopPropagation();
            props.onResearch(topic);
          }}
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
              selectedTopicId={props.selectedTopicId}
              onSelectTopic={props.onSelectTopic}
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
  /** When set, scopes list + create to one module. When omitted, loads all company topics. */
  moduleId?: string;
  moduleName?: string;
  /** Research modules available for create + grouping (company-wide mode). */
  modules?: ResearchModuleOption[];
  selectedTopicId?: string | null;
  onSelectTopic?: (topicId: string) => void;
}

function ResearchTopicsTreeInner(props: ResearchTopicsTreeProps) {
  const modules = props.modules ?? [];
  const companyWide = !props.moduleId;
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [createModuleId, setCreateModuleId] = useState(props.moduleId ?? modules[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [busyTopicId, setBusyTopicId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (props.moduleId) {
      setCreateModuleId(props.moduleId);
      return;
    }
    if (!createModuleId && modules[0]?.id) {
      setCreateModuleId(modules[0].id);
    }
  }, [props.moduleId, modules, createModuleId]);

  const load = useCallback(async () => {
    if (!props.companyId) return;
    try {
      const qs = props.moduleId ? `?moduleId=${props.moduleId}` : '';
      const data = await api<{ topics: ResearchTopic[] }>(
        `/api/companies/${props.companyId}/research/topics${qs}`,
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

  const moduleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of modules) map.set(m.id, m.name);
    return map;
  }, [modules]);

  const grouped = useMemo(() => {
    if (!companyWide) {
      return [{ moduleId: props.moduleId!, moduleName: props.moduleName ?? 'Topics', topics }];
    }
    const byModule = new Map<string, ResearchTopic[]>();
    for (const t of topics) {
      const list = byModule.get(t.moduleId) ?? [];
      list.push(t);
      byModule.set(t.moduleId, list);
    }
    const groups = [...byModule.entries()].map(([moduleId, rows]) => ({
      moduleId,
      moduleName: moduleNameById.get(moduleId) ?? 'Research module',
      topics: rows,
    }));
    groups.sort((a, b) => a.moduleName.localeCompare(b.moduleName));
    return groups;
  }, [companyWide, props.moduleId, props.moduleName, topics, moduleNameById]);

  async function createTopic(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    const moduleId = props.moduleId ?? createModuleId;
    if (!trimmed || !moduleId) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/research/topics`, {
        method: 'POST',
        body: { moduleId, title: trimmed },
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
      await api(`/api/companies/${props.companyId}/modules/${topic.moduleId}/curate`, {
        method: 'POST',
        body: {
          mode: 'manual',
          topicScope: topic.title,
          queryText: topic.title,
          topicId: topic.id,
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

  const handleSelectTopic = useCallback(
    (topicId: string) => {
      props.onSelectTopic?.(topicId);
    },
    [props],
  );

  const canCreate = Boolean(props.moduleId ?? createModuleId);
  const heading = companyWide ? 'Topics' : `Topics · ${props.moduleName ?? 'module'}`;

  return (
    <div
      data-testid="research-topics-panel"
      className="rounded-lg border border-[var(--color-line)] p-2.5"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        {heading}
      </p>
      {!loaded ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">Loading topics…</p>
      ) : topics.length === 0 ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">No topics yet.</p>
      ) : (
        <div className="mt-1 space-y-2">
          {grouped.map((group) => {
            const tree = buildTopicTree(group.topics);
            return (
              <div key={group.moduleId}>
                {companyWide && (
                  <p className="mb-0.5 text-[9px] text-[var(--color-ink-faint)]">
                    {group.moduleName}
                  </p>
                )}
                {tree.length === 0 ? (
                  <p className="text-[10px] text-[var(--color-ink-faint)]">No topics.</p>
                ) : (
                  <ul>
                    {tree.map((node) => (
                      <TopicBranch
                        key={node.topic.id}
                        node={node}
                        depth={0}
                        selectedTopicId={props.selectedTopicId ?? null}
                        onSelectTopic={handleSelectTopic}
                        onResearch={(topic) => void researchTopic(topic)}
                        busyTopicId={busyTopicId}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      <form onSubmit={(e) => void createTopic(e)} className="mt-2 space-y-1.5">
        {companyWide && modules.length > 1 && (
          <select
            value={createModuleId}
            onChange={(e) => setCreateModuleId(e.target.value)}
            aria-label="Research module for new topic"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New topic title"
          aria-label="New topic title"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || !title.trim() || !canCreate}
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
