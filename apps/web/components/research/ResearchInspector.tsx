'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { Components } from 'react-markdown';
import type { ResearchGraphNode, ResearchTopicDetail, TopicConcept } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import {
  buildWikilinkContextFromTopic,
  parseWikilinkHref,
  preprocessSynopsisWikilinks,
} from '@/lib/research-wikilinks';
import { ResearchConceptPreview } from '@/components/research/ResearchConceptPreview';
import { ResearchMarkdown } from '@/components/research/ResearchMarkdown';
import {
  useResearchView,
  type InspectorTarget,
} from '@/components/research/ResearchViewContext';

function usageLine(queryCount: number, referenceCount: number): string {
  return `Queried ${queryCount} · Referenced ${referenceCount}`;
}

function ConceptMembershipRow(props: {
  membership: TopicConcept;
  onOpenConcept: (conceptId: string) => void;
}) {
  const m = props.membership;
  return (
    <ResearchConceptPreview
      title={m.title ?? 'Untitled concept'}
      body={m.body}
      role={m.role}
      onOpen={() => props.onOpenConcept(m.conceptId)}
      testId={`inspector-membership-${m.conceptId}`}
    />
  );
}

function TopicInspector(props: {
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
                rv.inspectConcept(target.id);
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
    return <p className="p-4 text-[11px] text-[var(--color-ink-faint)]">Loading page…</p>;
  }
  if (!props.topic) {
    return (
      <p className="p-4 text-center text-[11px] text-[var(--color-ink-faint)]">
        Select a page from the left panel.
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
          {topic.status} · {topic.priority} · {topic.conceptCount ?? topic.memberships.length}{' '}
          concepts
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
          <ResearchMarkdown
            markdown={renderedSynopsis}
            components={synopsisMarkdownComponents}
          />
        ) : (
          <p className="text-[11px] text-[var(--color-ink-faint)]">No synopsis yet.</p>
        )}
        {saveError && (
          <p className="mt-1 text-[10px] text-[var(--color-warn)]" role="alert">
            {saveError}
          </p>
        )}
      </section>

      <section aria-label="Member concepts">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Member concepts
        </p>
        {topic.memberships.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-faint)]">No concepts linked yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {topic.memberships.map((m) => (
              <li key={m.id}>
                <ConceptMembershipRow
                  membership={m}
                  onOpenConcept={(id) => rv.inspectConcept(id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ConceptInspector(props: {
  companyId: string;
  concept: ResearchGraphNode | null;
  loading: boolean;
  onChanged?: () => void;
}) {
  const [actionBusy, setActionBusy] = useState<'verify' | 'delete' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [local, setLocal] = useState<ResearchGraphNode | null>(props.concept);

  useEffect(() => {
    setLocal(props.concept);
    setActionMessage(null);
  }, [props.concept]);

  const runAction = useCallback(
    async (action: 'verify_object' | 'archive_object') => {
      if (!local) return;
      setActionBusy(action === 'verify_object' ? 'verify' : 'delete');
      setActionMessage(null);
      try {
        const res = await api<{ confidenceBand?: string }>(
          `/api/companies/${props.companyId}/research/archive`,
          {
            method: 'POST',
            body: { action, objectKind: 'concept', objectId: local.id },
          },
        );
        if (action === 'archive_object') {
          setActionMessage('Archived.');
          props.onChanged?.();
        } else {
          const band = res.confidenceBand ?? local.confidenceBand ?? 'medium';
          setLocal({ ...local, confidenceBand: band as ResearchGraphNode['confidenceBand'] });
          setActionMessage(`Verified · confidence ${band}`);
          props.onChanged?.();
        }
      } catch (err) {
        const code = err instanceof RequestError ? err.code : 'action_failed';
        setActionMessage(
          code === 'seed_protected'
            ? 'Seeded catalog concepts cannot be archived.'
            : 'Action failed.',
        );
      } finally {
        setActionBusy(null);
      }
    },
    [local, props],
  );

  if (props.loading) {
    return <p className="p-4 text-[11px] text-[var(--color-ink-faint)]">Loading concept…</p>;
  }
  if (!local) {
    return (
      <p className="p-4 text-center text-[11px] text-[var(--color-ink-faint)]">
        Concept not found in the current galaxy.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <header className="mb-3 border-b border-[var(--color-line)] pb-2">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">{local.title}</h2>
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
          {usageLine(local.queryCount ?? 0, local.referenceCount ?? 0)}
          {local.confidenceBand ? ` · Confidence ${local.confidenceBand}` : ''}
        </p>
        {local.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {local.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-faint)]"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="mb-2 flex flex-wrap gap-1">
        <button
          type="button"
          disabled={actionBusy !== null}
          onClick={() => void runAction('verify_object')}
          className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] disabled:opacity-50"
        >
          {actionBusy === 'verify' ? '…' : 'Verify'}
        </button>
        <button
          type="button"
          disabled={actionBusy !== null || local.sourceClass === 'catalog_seed'}
          onClick={() => void runAction('archive_object')}
          className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] disabled:opacity-50"
        >
          {actionBusy === 'delete' ? '…' : 'Delete'}
        </button>
      </div>
      {actionMessage && (
        <p className="mb-2 text-[9px] text-[var(--color-ink-faint)]" role="status">
          {actionMessage}
        </p>
      )}

      <ResearchMarkdown markdown={local.body} />

      <dl className="mt-3 space-y-0.5 text-[9px] text-[var(--color-ink-faint)]">
        <div>
          {local.sourceClass.replace(/_/g, ' ')} · {local.status}
        </div>
        {local.curationStatus && (
          <div>Library admission: {local.curationStatus.replace(/_/g, ' ')}</div>
        )}
        {local.sourceRef && <div className="break-all">Evidence: {local.sourceRef}</div>}
      </dl>
    </div>
  );
}

function LibraryInspector(props: {
  companyId: string;
  libraryId: string;
  libraryName: string;
  memberConcepts: ResearchGraphNode[];
  onOpenConcept: (conceptId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <header className="mb-3 border-b border-[var(--color-line)] pb-2">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">{props.libraryName}</h2>
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
          {props.memberConcepts.length} concepts in galaxy nest
        </p>
      </header>
      {props.memberConcepts.length === 0 ? (
        <p className="text-[11px] text-[var(--color-ink-faint)]">No concepts in this nest yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {props.memberConcepts.map((c) => (
            <li key={c.id}>
              <ResearchConceptPreview
                title={c.title}
                body={c.body}
                tags={c.tags}
                meta={c.confidenceBand ? `Confidence ${c.confidenceBand}` : null}
                onOpen={() => props.onOpenConcept(c.id)}
                testId={`inspector-library-member-${c.id}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagInspector(props: {
  tag: string;
  memberConcepts: ResearchGraphNode[];
  onOpenConcept: (conceptId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <header className="mb-3 border-b border-[var(--color-line)] pb-2">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">{props.tag}</h2>
        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
          {props.memberConcepts.length} matching concepts
        </p>
      </header>
      {props.memberConcepts.length === 0 ? (
        <p className="text-[11px] text-[var(--color-ink-faint)]">No concepts with this tag.</p>
      ) : (
        <ul className="space-y-1.5">
          {props.memberConcepts.map((c) => (
            <li key={c.id}>
              <ResearchConceptPreview
                title={c.title}
                body={c.body}
                tags={c.tags}
                meta={c.sourceClass.replace(/_/g, ' ')}
                onOpen={() => props.onOpenConcept(c.id)}
                testId={`inspector-tag-member-${c.id}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ResearchInspectorProps {
  companyId: string;
  target: InspectorTarget | null;
  topic: ResearchTopicDetail | null;
  topicLoading: boolean;
  graphNodes: ResearchGraphNode[];
  onTopicPatched: (partial: Partial<ResearchTopicDetail>) => void;
  onGraphInvalidated?: () => void;
}

function ResearchInspectorInner(props: ResearchInspectorProps) {
  const rv = useResearchView();
  const target = props.target;

  if (!target) {
    return (
      <p className="p-4 text-center text-[11px] text-[var(--color-ink-faint)]">
        Select a page, concept, library, or tag from the left panel.
      </p>
    );
  }

  switch (target.kind) {
    case 'topic':
      return (
        <TopicInspector
          companyId={props.companyId}
          topic={props.topic}
          loading={props.topicLoading}
          onTopicPatched={props.onTopicPatched}
        />
      );
    case 'concept': {
      const concept = props.graphNodes.find((n) => n.id === target.conceptId) ?? null;
      return (
        <ConceptInspector
          companyId={props.companyId}
          concept={concept}
          loading={false}
          {...(props.onGraphInvalidated ? { onChanged: props.onGraphInvalidated } : {})}
        />
      );
    }
    case 'library': {
      const members = props.graphNodes.filter(
        (n) =>
          n.primaryLibraryId === target.libraryId ||
          (n.secondaryLibraryIds ?? []).includes(target.libraryId),
      );
      return (
        <LibraryInspector
          companyId={props.companyId}
          libraryId={target.libraryId}
          libraryName={target.libraryName}
          memberConcepts={members}
          onOpenConcept={(id) => rv.inspectConcept(id)}
        />
      );
    }
    case 'tag': {
      const members = props.graphNodes.filter((n) => n.tags.includes(target.tag));
      return (
        <TagInspector
          tag={target.tag}
          memberConcepts={members}
          onOpenConcept={(id) => rv.inspectConcept(id)}
        />
      );
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

export const ResearchInspector = memo(ResearchInspectorInner);
