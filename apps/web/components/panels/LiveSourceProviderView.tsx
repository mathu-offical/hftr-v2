'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  LiveDataSourceFormHint,
  LiveDataSourceQueryPreset,
  LiveDataSourceQueryResponse,
  LiveDataSourceRow,
  LiveDataSourceWidget,
  LiveDataSourcesResponse,
} from '@hftr/contracts';
import {
  liveDataSourceFormForDomain,
  liveDataSourceIsCompleteList,
  liveDataSourcePresetsForDomain,
  resolveLiveDataSourceMaxResults,
  type ResearchSourceKind,
} from '@hftr/contracts';
import { api } from '@/lib/client';
import { loadLiveDataSources } from '@/lib/live-data-sources-cache';
import {
  loadLiveDataSourceQuery,
  peekLiveDataSourceQuery,
  type LiveDataSourceQueryCacheKey,
} from '@/lib/live-data-source-query-cache';

function widgetKindLabel(kind: LiveDataSourceWidget['widgetKind']): string {
  switch (kind) {
    case 'headline':
      return 'Headline';
    case 'filing':
      return 'Filing';
    case 'listing':
      return 'Listing';
    case 'series':
      return 'Series';
    case 'entitlement':
      return 'Feed';
    case 'generic':
      return 'Item';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function LiveWidgetCard(props: { widget: LiveDataSourceWidget }) {
  const w = props.widget;
  return (
    <li
      className="flex flex-col rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
      data-widget-kind={w.widgetKind}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] font-medium leading-snug text-[var(--color-ink)]">
          {w.title}
        </p>
        <span className="shrink-0 rounded border border-[var(--color-line)] px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          {widgetKindLabel(w.widgetKind)}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-ink-dim)]">{w.summary}</p>
      {w.fields.length > 0 ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-[var(--color-line)] pt-2">
          {w.fields.map((f) => (
            <div key={`${f.label}-${f.value}`} className="min-w-0">
              <dt className="text-[8px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                {f.label}
              </dt>
              <dd className="truncate font-mono text-[9px] text-[var(--color-ink-dim)]">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-[var(--color-ink-faint)]">
        {w.externalRef ? (
          w.externalRef.startsWith('http') ? (
            <a
              href={w.externalRef}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline"
            >
              Open source
            </a>
          ) : (
            <span className="font-mono">{w.externalRef}</span>
          )
        ) : null}
      </div>
    </li>
  );
}

/**
 * Per-provider live view: domain form + presets + widget grid (D-121 / D-133).
 */
export function LiveSourceProviderView(props: {
  companyId: string;
  kind: string;
  label: string;
  viewMode: 'markdown' | 'json';
}) {
  const [row, setRow] = useState<LiveDataSourceRow | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [widgets, setWidgets] = useState<LiveDataSourceWidget[]>([]);
  const [presets, setPresets] = useState<LiveDataSourceQueryPreset[]>([]);
  const [form, setForm] = useState<LiveDataSourceFormHint | null>(null);
  const [completeList, setCompleteList] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [queriedStatus, setQueriedStatus] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const applyResponse = useCallback(
    (res: LiveDataSourceQueryResponse, opts?: { fromCache?: boolean }) => {
      setWidgets(res.widgets);
      setLastQuery(res.query);
      setQueriedStatus(res.status);
      setFetchedAt(res.fetchedAt);
      setCompleteList(res.completeList);
      setFromCache(opts?.fromCache === true || res.cached === true);
      if (res.presets.length > 0) setPresets(res.presets);
      if (res.form) setForm(res.form);
      if (res.errors.length > 0 && res.widgets.length === 0) {
        setQueryError(res.errors.map((e) => e.code).join(' · '));
      } else {
        setQueryError(null);
      }
    },
    [],
  );

  const runQuery = useCallback(
    async (opts: {
      mode: 'search' | 'browse';
      query: string;
      force?: boolean;
    }) => {
      setQueryBusy(true);
      setQueryError(null);
      const kind = props.kind as ResearchSourceKind;
      const maxResults = resolveLiveDataSourceMaxResults(kind);
      const cacheKey: LiveDataSourceQueryCacheKey = {
        companyId: props.companyId,
        kind: props.kind,
        mode: opts.mode,
        query: opts.query,
        maxResults,
      };
      try {
        const result = await loadLiveDataSourceQuery(
          cacheKey,
          () =>
            api<LiveDataSourceQueryResponse>(
              `/api/companies/${props.companyId}/live-data-sources/${props.kind}/query`,
              {
                method: 'POST',
                body: {
                  mode: opts.mode,
                  query: opts.query,
                  maxResults,
                  forceRefresh: opts.force === true,
                },
              },
            ),
          {
            force: opts.force === true,
            allowStale: true,
            onUpdate: (data) => applyResponse(data, { fromCache: false }),
          },
        );
        applyResponse(result.data, { fromCache: result.fromCache });
      } catch {
        setQueryError(opts.mode === 'browse' ? 'Browse failed' : 'Query failed');
      } finally {
        setQueryBusy(false);
      }
    },
    [props.companyId, props.kind, applyResponse],
  );

  useEffect(() => {
    let cancelled = false;
    setMetaLoading(true);
    setMetaError(null);
    setQueryError(null);

    // Hydrate widgets from client cache immediately when remounting a service tab.
    const kind = props.kind as ResearchSourceKind;
    const maxResults = resolveLiveDataSourceMaxResults(kind);
    const peek = peekLiveDataSourceQuery({
      companyId: props.companyId,
      kind: props.kind,
      mode: 'browse',
      query: '',
      maxResults,
    });
    if (peek) {
      applyResponse(peek, { fromCache: true });
    } else {
      setWidgets([]);
      setLastQuery(null);
      setFetchedAt(null);
      setFromCache(false);
    }
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
        if (match) {
          setPresets(liveDataSourcePresetsForDomain(match.domain));
          setForm(liveDataSourceFormForDomain(match.domain));
          setCompleteList(liveDataSourceIsCompleteList(match.kind));
        } else {
          setMetaError('Source not found in inventory');
        }
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
  }, [props.companyId, props.kind, props.label, applyResponse]);

  useEffect(() => {
    if (!row) return;
    if (row.status === 'missing_key' || row.status === 'stub' || row.status === 'researched') {
      return;
    }
    // SWR: serve cache if fresh; background revalidate when stale — no force.
    void runQuery({ mode: 'browse', query: '', force: false });
  }, [row, runQuery]);

  async function onSearch(e?: FormEvent) {
    e?.preventDefault();
    if (!row) return;
    await runQuery({ mode: 'search', query: queryText.trim(), force: false });
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
    notes: '',
    docsUrl: undefined as string | undefined,
  };

  if (props.viewMode === 'json') {
    return (
      <pre className="overflow-auto rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] p-2 font-mono text-[10px] text-[var(--color-ink-dim)]">
        {JSON.stringify(
          {
            metadata: display,
            lastQuery,
            status: queriedStatus,
            fetchedAt,
            widgets,
            queryError,
          },
          null,
          2,
        )}
      </pre>
    );
  }

  const formHint = form ?? liveDataSourceFormForDomain(String(display.domain));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden text-xs text-[var(--color-ink-dim)]">
      {metaError ? <p className="text-[var(--color-warn,var(--color-ink-faint))]">{metaError}</p> : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="rounded border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-ink)]">
          {display.status}
        </span>
        <span className="text-[10px] text-[var(--color-ink-faint)]">{display.domain}</span>
        <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">{display.feedClass}</span>
        {row?.docsUrl ? (
          <a
            href={row.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--color-accent)] hover:underline"
          >
            Docs
          </a>
        ) : null}
      </div>

      <p className="shrink-0 text-[10px] text-[var(--color-ink-faint)]">{formHint.helper}</p>

      {presets.length > 0 ? (
        <div
          className="flex shrink-0 flex-wrap gap-1.5"
          role="toolbar"
          aria-label="Live view presets"
        >
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={queryBusy}
              data-testid={`live-source-preset-${p.id}`}
              onClick={() => {
                setQueryText(p.query);
                void runQuery({ mode: p.mode, query: p.query, force: false });
              }}
              className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[9px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => void onSearch(e)}
        className="flex shrink-0 flex-wrap items-end gap-2 border-t border-[var(--color-line)] pt-3"
        aria-label={`${formHint.fieldLabel} form`}
      >
        <label className="min-w-[12rem] flex-1">
          <span className="mb-0.5 block text-[9px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            {formHint.fieldLabel}
          </span>
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder={formHint.placeholder}
            aria-label={formHint.fieldLabel}
            data-testid="data-explorer-live-query"
            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={queryBusy}
          data-testid="data-explorer-live-search"
          className="rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {queryBusy ? 'Loading…' : 'Run'}
        </button>
        <button
          type="button"
          disabled={queryBusy}
          data-testid="data-explorer-live-browse"
          onClick={() => {
            setQueryText('');
            void runQuery({ mode: 'browse', query: '', force: true });
          }}
          className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          Refresh live
        </button>
      </form>

      <div className="flex shrink-0 items-center justify-between gap-2 font-mono text-[9px] text-[var(--color-ink-faint)]">
        <span>
          {lastQuery ? `Query · ${lastQuery}` : '—'}
          {queriedStatus ? ` · ${queriedStatus}` : ''}
          {fromCache ? ' · cached' : ''}
          {widgets.length > 0
            ? completeList
              ? ` · full list · ${widgets.length}`
              : ` · ${widgets.length} widgets`
            : ''}
        </span>
        {fetchedAt ? <span>{fetchedAt.slice(11, 19)}Z</span> : null}
      </div>
      {queryError ? (
        <p className="shrink-0 text-[11px] text-[var(--color-ink-faint)]">{queryError}</p>
      ) : null}

      <section
        className="min-h-0 flex-1 overflow-y-auto"
        aria-label="Service data widgets"
        data-testid="data-explorer-live-widgets"
      >
        {queryBusy && widgets.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-faint)]">Loading live view…</p>
        ) : widgets.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            No live widgets yet. Use a preset or run a query for this service.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">{widgets.map((w) => (
            <LiveWidgetCard key={w.id} widget={w} />
          ))}</ul>
        )}
      </section>
    </div>
  );
}
