'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { ResearchMarkdown } from '@/components/research/ResearchMarkdown';
import { useDataView } from '@/components/panels/DataViewContext';
import { api } from '@/lib/client';
import {
  fetchCompanyConcepts,
  fetchLibraryConceptPages,
  type LibraryConceptPageRow,
  type ResearchConceptRow,
} from '@/lib/research-resource-api';
import type { LiveDataSourceRow as ContractLiveRow, LiveDataSourcesResponse } from '@hftr/contracts';
import { loadLiveDataSources } from '@/lib/live-data-sources-cache';

type LiveDataSourceRow = Pick<
  ContractLiveRow,
  'kind' | 'label' | 'domain' | 'authMode' | 'status' | 'feedClass' | 'docsUrl' | 'notes' | 'canvasModuleIds'
>;

type ModuleRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  config: Record<string, unknown>;
};

function overlayTitle(target: ReturnType<typeof useDataView>['target']): string {
  if (!target) return 'Data Explorer';
  switch (target.type) {
    case 'live_source':
      return target.label;
    case 'library':
      return target.libraryName;
    case 'concept':
      return target.title ?? 'Concept';
    case 'company_module':
      return target.moduleName;
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

function JsonBlock(props: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3 font-mono text-[10px] leading-relaxed text-[var(--color-ink-dim)]">
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}

function ViewModeToggle(props: {
  viewMode: 'markdown' | 'json';
  onChange: (mode: 'markdown' | 'json') => void;
}) {
  return (
    <div
      className="flex rounded border border-[var(--color-line)] text-[10px]"
      role="group"
      aria-label="View mode"
    >
      {(['markdown', 'json'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          data-testid={`data-explorer-view-${mode}`}
          onClick={() => props.onChange(mode)}
          aria-pressed={props.viewMode === mode}
          className={`px-2 py-0.5 capitalize ${
            props.viewMode === mode
              ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
              : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
          }`}
        >
          {mode === 'markdown' ? 'Markdown' : 'JSON'}
        </button>
      ))}
    </div>
  );
}

function LiveSourceBody(props: {
  companyId: string;
  kind: string;
  label: string;
  viewMode: 'markdown' | 'json';
}) {
  const [row, setRow] = useState<LiveDataSourceRow | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [widgets, setWidgets] = useState<
    Array<{
      id: string;
      title: string;
      summary: string;
      feedClass: string;
      authorityClass: string;
      externalRef: string | null;
      expiresAt: string | null;
    }>
  >([]);
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [queriedStatus, setQueriedStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMetaLoading(true);
    setMetaError(null);
    setWidgets([]);
    setQueryError(null);
    setLastQuery(null);
    setQueryText('');

    void loadLiveDataSources(
      { companyId: props.companyId },
      () =>
        api<LiveDataSourcesResponse>(
          `/api/companies/${props.companyId}/live-data-sources`,
        ),
      { force: false, allowStale: true },
    )
      .then((result) => {
        if (cancelled) return;
        const match =
          result.data.sources.find((s) => s.kind === props.kind) ??
          result.data.sources.find((s) => s.label === props.label) ??
          null;
        setRow(match);
        if (!match) setMetaError('Source not found in inventory');
      })
      .catch(() => {
        if (!cancelled) {
          setRow(null);
          setMetaError('Live source inventory unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [props.companyId, props.kind, props.label]);

  // Auto-browse public/current data once metadata is ready.
  useEffect(() => {
    if (!row) return;
    if (row.status === 'missing_key' || row.status === 'stub' || row.status === 'researched') {
      return;
    }
    let cancelled = false;
    setQueryBusy(true);
    setQueryError(null);
    void api<{
      query: string;
      status: string;
      widgets: Array<{
        id: string;
        title: string;
        summary: string;
        feedClass: string;
        authorityClass: string;
        externalRef: string | null;
        expiresAt: string | null;
      }>;
      errors: Array<{ code: string }>;
    }>(`/api/companies/${props.companyId}/live-data-sources/${props.kind}/query`, {
      method: 'POST',
      body: { mode: 'browse', query: '', maxResults: 8 },
    })
      .then((res) => {
        if (cancelled) return;
        setWidgets(res.widgets);
        setLastQuery(res.query);
        setQueriedStatus(res.status);
        if (res.errors.length > 0 && res.widgets.length === 0) {
          setQueryError(res.errors.map((e) => e.code).join(' · '));
        }
      })
      .catch(() => {
        if (!cancelled) setQueryError('Query failed');
      })
      .finally(() => {
        if (!cancelled) setQueryBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.companyId, props.kind, row]);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (!row) return;
    setQueryBusy(true);
    setQueryError(null);
    try {
      const res = await api<{
        query: string;
        status: string;
        widgets: Array<{
          id: string;
          title: string;
          summary: string;
          feedClass: string;
          authorityClass: string;
          externalRef: string | null;
          expiresAt: string | null;
        }>;
        errors: Array<{ code: string }>;
      }>(`/api/companies/${props.companyId}/live-data-sources/${props.kind}/query`, {
        method: 'POST',
        body: { mode: 'search', query: queryText.trim(), maxResults: 8 },
      });
      setWidgets(res.widgets);
      setLastQuery(res.query);
      setQueriedStatus(res.status);
      if (res.errors.length > 0 && res.widgets.length === 0) {
        setQueryError(res.errors.map((err) => err.code).join(' · '));
      }
    } catch {
      setQueryError('Query failed');
    } finally {
      setQueryBusy(false);
    }
  }

  if (metaLoading) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        Loading source metadata…
      </p>
    );
  }

  const display = row ?? {
    kind: props.kind,
    label: props.label,
    domain: '—',
    authMode: '—',
    status: 'unknown',
    feedClass: '—',
  };

  if (props.viewMode === 'json') {
    return (
      <JsonBlock
        value={{
          metadata: display,
          lastQuery,
          status: queriedStatus,
          widgets,
          queryError,
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden text-xs text-[var(--color-ink-dim)]">
      {metaError ? <p className="text-[var(--color-warn,var(--color-ink-faint))]">{metaError}</p> : null}
      <dl className="grid shrink-0 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Readiness
          </dt>
          <dd className="font-mono text-[11px] text-[var(--color-ink)]">{display.status}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Domain
          </dt>
          <dd>{display.domain}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Auth mode
          </dt>
          <dd>{display.authMode}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Feed class
          </dt>
          <dd className="font-mono text-[10px]">{display.feedClass}</dd>
        </div>
      </dl>
      {row?.docsUrl ? (
        <p className="shrink-0">
          <a
            href={row.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] hover:underline"
          >
            Provider documentation
          </a>
        </p>
      ) : null}
      {row?.notes ? (
        <p className="shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5 text-[11px]">
          {row.notes}
        </p>
      ) : null}

      <form
        onSubmit={(e) => void runSearch(e)}
        className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3"
        aria-label="Query this data source"
      >
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Search this service…"
          aria-label="Search query"
          data-testid="data-explorer-live-query"
          className="min-w-[12rem] flex-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={queryBusy}
          data-testid="data-explorer-live-search"
          className="rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {queryBusy ? 'Querying…' : 'Search'}
        </button>
        <button
          type="button"
          disabled={queryBusy}
          onClick={() => {
            setQueryText('');
            void (async () => {
              setQueryBusy(true);
              setQueryError(null);
              try {
                const res = await api<{
                  query: string;
                  status: string;
                  widgets: typeof widgets;
                  errors: Array<{ code: string }>;
                }>(`/api/companies/${props.companyId}/live-data-sources/${props.kind}/query`, {
                  method: 'POST',
                  body: { mode: 'browse', query: '', maxResults: 8 },
                });
                setWidgets(res.widgets);
                setLastQuery(res.query);
                setQueriedStatus(res.status);
                if (res.errors.length > 0 && res.widgets.length === 0) {
                  setQueryError(res.errors.map((err) => err.code).join(' · '));
                }
              } catch {
                setQueryError('Browse failed');
              } finally {
                setQueryBusy(false);
              }
            })();
          }}
          className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          Browse current
        </button>
      </form>

      {lastQuery ? (
        <p className="shrink-0 font-mono text-[9px] text-[var(--color-ink-faint)]">
          Query · {lastQuery}
          {queriedStatus ? ` · ${queriedStatus}` : ''}
        </p>
      ) : null}
      {queryError ? (
        <p className="shrink-0 text-[11px] text-[var(--color-ink-faint)]">{queryError}</p>
      ) : null}

      <section
        className="min-h-0 flex-1 overflow-y-auto"
        aria-label="Service data widgets"
        data-testid="data-explorer-live-widgets"
      >
        {queryBusy && widgets.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-faint)]">Loading service data…</p>
        ) : widgets.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            No widgets yet. Search or browse current public/ready data for this service.
          </p>
        ) : (
          <ul className="space-y-2">
            {widgets.map((w) => (
              <li
                key={w.id}
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium text-[var(--color-ink)]">{w.title}</p>
                  <span className="shrink-0 font-mono text-[9px] text-[var(--color-ink-faint)]">
                    {w.feedClass}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-ink-dim)]">
                  {w.summary}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[9px] text-[var(--color-ink-faint)]">
                  <span>{w.authorityClass.replace(/_/g, ' ')}</span>
                  {w.externalRef ? (
                    <a
                      href={w.externalRef.startsWith('http') ? w.externalRef : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={
                        w.externalRef.startsWith('http')
                          ? 'text-[var(--color-accent)] hover:underline'
                          : undefined
                      }
                    >
                      {w.externalRef.startsWith('http') ? 'Open source' : w.externalRef}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ConceptDetail(props: {
  concept: ResearchConceptRow | null;
  loading: boolean;
  viewMode: 'markdown' | 'json';
}) {
  if (props.loading) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        Loading concept…
      </p>
    );
  }
  if (!props.concept) {
    return <p className="text-xs text-[var(--color-ink-faint)]">Concept not found</p>;
  }
  if (props.viewMode === 'json') {
    return <JsonBlock value={props.concept} />;
  }
  return <ResearchMarkdown markdown={props.concept.body} omitLeadingH1 />;
}

function LibraryBrowseBody(props: {
  companyId: string;
  libraryId: string;
  searchQuery: string;
  filterAdmission: string | 'all';
  viewMode: 'markdown' | 'json';
  initialConceptId?: string;
}) {
  const [pages, setPages] = useState<LibraryConceptPageRow[]>([]);
  const [concepts, setConcepts] = useState<ResearchConceptRow[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(
    props.initialConceptId ?? null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchLibraryConceptPages(props.companyId, props.libraryId),
      fetchCompanyConcepts(props.companyId),
    ])
      .then(([pageRows, conceptRows]) => {
        if (cancelled) return;
        setPages(pageRows);
        setConcepts(conceptRows);
        if (props.initialConceptId) {
          setSelectedConceptId(props.initialConceptId);
        } else if (pageRows.length > 0) {
          setSelectedConceptId(pageRows[0]!.conceptId);
        } else {
          setSelectedConceptId(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPages([]);
          setConcepts([]);
          setSelectedConceptId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.companyId, props.libraryId, props.initialConceptId]);

  const conceptById = useMemo(() => {
    const map = new Map<string, ResearchConceptRow>();
    for (const c of concepts) map.set(c.id, c);
    return map;
  }, [concepts]);

  const filteredPages = useMemo(() => {
    const q = props.searchQuery.trim().toLowerCase();
    return pages.filter((page) => {
      const concept = conceptById.get(page.conceptId);
      if (props.filterAdmission !== 'all' && concept) {
        if (
          concept.sourceClass !== props.filterAdmission &&
          concept.status !== props.filterAdmission &&
          !page.tags.includes(props.filterAdmission)
        ) {
          return false;
        }
      }
      if (!q) return true;
      const hay = `${page.title} ${page.tags.join(' ')} ${concept?.body ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pages, conceptById, props.searchQuery, props.filterAdmission]);

  const selectedConcept = selectedConceptId ? (conceptById.get(selectedConceptId) ?? null) : null;

  if (loading) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        Loading library pages…
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <aside className="flex w-48 shrink-0 flex-col overflow-hidden rounded border border-[var(--color-line)] bg-[var(--color-surface-1)]">
        <p className="border-b border-[var(--color-line)] px-2 py-1.5 text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Pages ({filteredPages.length})
        </p>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filteredPages.length === 0 ? (
            <li className="px-2 py-3 text-[10px] text-[var(--color-ink-faint)]">No matching pages</li>
          ) : (
            filteredPages.map((page) => {
              const active = page.conceptId === selectedConceptId;
              return (
                <li key={page.conceptId}>
                  <button
                    type="button"
                    data-testid={`data-explorer-page-${page.conceptId}`}
                    onClick={() => setSelectedConceptId(page.conceptId)}
                    className={`w-full px-2 py-1.5 text-left text-[11px] ${
                      active
                        ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                        : 'text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)]/60'
                    }`}
                  >
                    {page.title}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <ConceptDetail concept={selectedConcept} loading={false} viewMode={props.viewMode} />
      </div>
    </div>
  );
}

function CompanyModuleBody(props: {
  companyId: string;
  moduleId: string;
  moduleName: string;
  viewMode: 'markdown' | 'json';
}) {
  const [moduleRow, setModuleRow] = useState<ModuleRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api<{ module: ModuleRow }>(
      `/api/companies/${props.companyId}/modules/${props.moduleId}`,
    )
      .then((data) => {
        if (!cancelled) setModuleRow(data.module);
      })
      .catch(() => {
        if (!cancelled) setModuleRow(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.companyId, props.moduleId]);

  if (loading) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        Loading module…
      </p>
    );
  }

  const payload = moduleRow ?? {
    id: props.moduleId,
    name: props.moduleName,
    type: 'library',
    status: 'unknown',
    config: {},
  };

  if (props.viewMode === 'json') {
    return <JsonBlock value={payload} />;
  }

  return (
    <div className="space-y-3 text-xs text-[var(--color-ink-dim)]">
      <p>
        Module <span className="font-medium text-[var(--color-ink)]">{payload.name}</span> (
        {payload.type}) stores curated knowledge linked to library shelves.
      </p>
      <p className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5 text-[11px]">
        Browse linked library shelves in the Libraries dock to read pages and concepts for this
        module.
      </p>
      {Object.keys(payload.config).length > 0 ? (
        <section>
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Module config
          </h3>
          <JsonBlock value={payload.config} />
        </section>
      ) : null}
    </div>
  );
}

function ConceptOnlyBody(props: {
  companyId: string;
  conceptId: string;
  viewMode: 'markdown' | 'json';
}) {
  const [concept, setConcept] = useState<ResearchConceptRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConcept = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchCompanyConcepts(props.companyId);
      setConcept(rows.find((c) => c.id === props.conceptId) ?? null);
    } catch {
      setConcept(null);
    } finally {
      setLoading(false);
    }
  }, [props.companyId, props.conceptId]);

  useEffect(() => {
    void loadConcept();
  }, [loadConcept]);

  return <ConceptDetail concept={concept} loading={loading} viewMode={props.viewMode} />;
}

/**
 * Canvas overlay for browsing live data sources and library contents (D-120).
 */
export function DataExplorerOverlay() {
  const dv = useDataView();

  const title = overlayTitle(dv.target);
  const showLibraryControls =
    dv.target?.type === 'library' || dv.target?.type === 'concept';

  if (!dv.overlayOpen) return null;

  return (
    <div
      data-testid="data-explorer-overlay"
      className="absolute inset-0 z-20 flex min-h-0 items-stretch justify-center overflow-hidden bg-[var(--color-surface-0)]/40 p-3 backdrop-blur-[2px]"
      role="dialog"
      aria-label="Data Explorer"
    >
      <div className="flex min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)]/95 shadow-lg backdrop-blur-sm">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-ink)]">
            {title}
          </span>
          {showLibraryControls ? (
            <ViewModeToggle viewMode={dv.viewMode} onChange={dv.setViewMode} />
          ) : dv.target?.type === 'live_source' || dv.target?.type === 'company_module' ? (
            <ViewModeToggle viewMode={dv.viewMode} onChange={dv.setViewMode} />
          ) : null}
          <input
            type="search"
            value={dv.searchQuery}
            onChange={(e) => dv.setSearchQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search data explorer"
            data-testid="data-explorer-search"
            className="w-36 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-0.5 text-[11px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)]"
          />
          {dv.target?.type === 'library' ? (
            <select
              value={dv.filterAdmission}
              onChange={(e) => dv.setFilterAdmission(e.target.value as string | 'all')}
              aria-label="Filter by admission or source class"
              data-testid="data-explorer-filter-admission"
              className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-dim)]"
            >
              <option value="all">All</option>
              <option value="catalog_seed">Catalog seed</option>
              <option value="operator">Operator</option>
              <option value="model_generated">Model generated</option>
              <option value="deterministic_placeholder">Placeholder</option>
              <option value="active">Active</option>
            </select>
          ) : null}
          <button
            type="button"
            onClick={dv.closeWorkspace}
            aria-label="Close data explorer"
            className="rounded p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {!dv.target ? (
            <p className="text-xs text-[var(--color-ink-faint)]">
              Select a live data source or library to browse.
            </p>
          ) : dv.target.type === 'live_source' ? (
            <LiveSourceBody
              companyId={dv.companyId}
              kind={dv.target.kind}
              label={dv.target.label}
              viewMode={dv.viewMode}
            />
          ) : dv.target.type === 'library' ? (
            <LibraryBrowseBody
              companyId={dv.companyId}
              libraryId={dv.target.libraryId}
              searchQuery={dv.searchQuery}
              filterAdmission={dv.filterAdmission}
              viewMode={dv.viewMode}
            />
          ) : dv.target.type === 'concept' ? (
            <ConceptOnlyBody
              companyId={dv.companyId}
              conceptId={dv.target.conceptId}
              viewMode={dv.viewMode}
            />
          ) : (
            <CompanyModuleBody
              companyId={dv.companyId}
              moduleId={dv.target.moduleId}
              moduleName={dv.target.moduleName}
              viewMode={dv.viewMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}
