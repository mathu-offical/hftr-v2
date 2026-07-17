'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, RequestError } from '@/lib/client';
import { provenanceChip, snippet } from './format';

type Tab = 'research' | 'data';

interface ModuleOption {
  id: string;
  name: string;
  type: string;
  status: string;
  config: Record<string, unknown>;
}

interface LinkRow {
  fromModuleId: string;
  toModuleId: string;
  linkKind: string;
}

interface ConceptRow {
  id: string;
  moduleId: string;
  title: string;
  body: string;
  tags: string[];
  sourceClass: 'deterministic_placeholder' | 'model_generated' | 'operator';
  sourceRef: string;
  status: string;
  createdAt: string;
}

/**
 * Left panel (ui-ux spec): Research curation spaces and Data sources.
 * Research shows each research/trend module's scope card plus a searchable,
 * tag-filterable concepts browser; research modules get an on-demand
 * "Curate now" action. Data sources show which nodes each source hydrates
 * (derived from data_feed links). Collapsible to a slim strip.
 */
export function LeftPanel(props: { modules: ModuleOption[]; links: LinkRow[] }) {
  // page.tsx does not pass companyId; the panel only renders under
  // /companies/[companyId], so the route param is the reliable source.
  const params = useParams<{ companyId: string }>();
  const companyId = params?.companyId ?? '';

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('research');
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [conceptsLoaded, setConceptsLoaded] = useState(false);

  const loadConcepts = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await api<{ concepts: ConceptRow[] }>(`/api/companies/${companyId}/concepts`);
      setConcepts(data.concepts);
    } catch {
      // Route may not be deployed yet; keep whatever we have.
    } finally {
      setConceptsLoaded(true);
    }
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    void loadConcepts();
    const interval = setInterval(loadConcepts, 30_000);
    return () => clearInterval(interval);
  }, [open, loadConcepts]);

  const research = props.modules.filter((m) => m.type === 'research' || m.type === 'trend');
  const sources = props.modules.filter((m) => m.type === 'live_api' || m.type === 'library');
  const nameOf = (id: string) => props.modules.find((m) => m.id === id)?.name ?? 'unknown';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Expand left panel"
        className="border-r border-[var(--color-line)] bg-[var(--color-surface-1)] px-1.5 text-[10px] tracking-widest text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        style={{ writingMode: 'vertical-rl' }}
      >
        RESEARCH · DATA
      </button>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex gap-1">
          {(
            [
              { id: 'research', label: 'Research' },
              { id: 'data', label: 'Data sources' },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded px-2 py-1 text-xs ${
                tab === t.id
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-label="Collapse left panel"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {tab === 'research' && (
          <>
            {research.length === 0 ? (
              <p className="px-1 text-xs text-[var(--color-ink-faint)]">
                No research or trend modules yet — add them from the canvas palette. The 3D research
                galaxy lands with the research milestone.
              </p>
            ) : (
              <ul className="space-y-3">
                {research.map((m) => (
                  <li key={m.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{m.name}</span>
                      <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                        {m.type}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
                      {String(m.config.topicScope ?? m.config.focus ?? 'scope not configured yet')}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--color-ink-faint)]">{m.status}</div>
                    {m.type === 'research' && (
                      <CurateAction companyId={companyId} moduleId={m.id} onDone={loadConcepts} />
                    )}
                    <ConceptsBrowser
                      concepts={concepts.filter((c) => c.moduleId === m.id)}
                      loaded={conceptsLoaded}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'data' && (
          <>
            {sources.length === 0 ? (
              <p className="px-1 text-xs text-[var(--color-ink-faint)]">
                No data sources yet — add a Live API or Library module from the canvas palette.
              </p>
            ) : (
              <ul className="space-y-2">
                {sources.map((m) => {
                  const hydrates = props.links
                    .filter((l) => l.fromModuleId === m.id && l.linkKind === 'data_feed')
                    .map((l) => nameOf(l.toModuleId));
                  return (
                    <li key={m.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{m.name}</span>
                        <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                          {m.type === 'live_api' ? 'live api' : 'library'}
                        </span>
                      </div>
                      {m.type === 'live_api' && (
                        <div className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
                          venue {String(m.config.venue ?? '—')} ·{' '}
                          {Array.isArray(m.config.instruments)
                            ? `${m.config.instruments.length} instruments`
                            : 'no instruments'}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
                        {hydrates.length > 0
                          ? `hydrates: ${hydrates.join(', ')}`
                          : 'not feeding any node yet'}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/** "Curate now" button for research modules: queues a curation run. */
function CurateAction(props: { companyId: string; moduleId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function curate() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}/curate`, {
        method: 'POST',
        body: {},
      });
      setMessage('Curation queued.');
      props.onDone();
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.status === 404
          ? 'Curation not available yet.'
          : 'Curation request failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button
        onClick={curate}
        disabled={busy}
        aria-label="Curate this research module now"
        className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
      >
        {busy ? 'Curating…' : 'Curate now'}
      </button>
      {message && <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>}
    </div>
  );
}

/**
 * Concepts browser for one module: client-side search over title/tags/body,
 * tag chip filters, and expandable concept cards with provenance chips.
 */
function ConceptsBrowser(props: { concepts: ConceptRow[]; loaded: boolean }) {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of props.concepts) for (const t of c.tags) set.add(t);
    return [...set].sort();
  }, [props.concepts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.concepts.filter((c) => {
      if (activeTag && !c.tags.includes(activeTag)) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [props.concepts, query, activeTag]);

  if (!props.loaded) {
    return (
      <p className="mt-2 border-t border-[var(--color-line)] pt-2 text-[10px] text-[var(--color-ink-faint)]">
        Loading concepts…
      </p>
    );
  }
  if (props.concepts.length === 0) {
    return (
      <p className="mt-2 border-t border-[var(--color-line)] pt-2 text-[10px] text-[var(--color-ink-faint)]">
        No concepts curated yet.
      </p>
    );
  }

  return (
    <div className="mt-2 border-t border-[var(--color-line)] pt-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search concepts"
        aria-label="Search concepts by title, tag, or body"
        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
      />
      {allTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
              aria-label={`Filter concepts by tag ${t}`}
              aria-pressed={activeTag === t}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                activeTag === t
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">
          No concepts match the current filter.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {filtered.map((c) => {
            const prov = provenanceChip(c.sourceClass);
            const expanded = expandedId === c.id;
            return (
              <li key={c.id} className="rounded-md border border-[var(--color-line)] p-2">
                <button
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} concept ${c.title}`}
                  aria-expanded={expanded}
                  className="block w-full text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--color-ink)]">
                      {c.title}
                    </span>
                    <span
                      className="shrink-0 rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[9px]"
                      style={{ color: prov.color }}
                    >
                      {prov.label}
                    </span>
                  </div>
                  {!expanded && (
                    <p className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">
                      {snippet(c.body)}
                    </p>
                  )}
                </button>
                {c.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-faint)]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {expanded && (
                  <div className="mt-1.5 border-t border-[var(--color-line)] pt-1.5">
                    <p className="whitespace-pre-wrap text-[11px] text-[var(--color-ink-dim)]">
                      {c.body}
                    </p>
                    <p className="mt-1.5 font-mono text-[9px] text-[var(--color-ink-faint)]">
                      source: {c.sourceRef}
                    </p>
                    <p className="text-[9px] text-[var(--color-ink-faint)]">
                      {c.status} · created {new Date(c.createdAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
