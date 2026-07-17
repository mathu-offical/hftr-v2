'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { dollars, toneFor } from './format';

type Tab = 'trends' | 'scenarios' | 'watchlists' | 'decisions';
const TABS: { id: Tab; label: string }[] = [
  { id: 'trends', label: 'Trends' },
  { id: 'scenarios', label: 'Scenario engine' },
  { id: 'watchlists', label: 'Watch lists' },
  { id: 'decisions', label: 'Decisions + traces' },
];

interface ModuleOption {
  id: string;
  name: string;
  type: string;
}

interface TrendRow {
  id: string;
  moduleId: string;
  symbol: string;
  direction: string;
  strengthBand: string;
  sourceClass: string;
  status: string;
  scannedAt: string;
}

interface ExecutionRow {
  id: string;
  moduleId: string;
  venue: string;
  mode: string;
  outcome: string;
  failureCode: string | null;
  amountCents: string | null;
  description: string | null;
  createdAt: string;
}

interface VerificationRow {
  id: string;
  traceId: string | null;
  result: string;
  failureCode: string | null;
  createdAt: string;
}

interface WatchlistRow {
  id: string;
  moduleId: string;
  moduleName: string;
  symbol: string;
  bias: string;
  note: string;
  sourceClass: string;
  status: string;
  updatedAt: string;
}

/**
 * Bottom panel (ui-ux spec): tabbed views over trends, the scenario engine
 * (trend → trade decomposition), watch lists, and decision traces — each
 * filterable by module. Collapsible to a slim strip.
 */
export function BottomPanel(props: { companyId: string; modules: ModuleOption[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('trends');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [watchlists, setWatchlists] = useState<WatchlistRow[]>([]);

  const load = useCallback(async () => {
    const base = `/api/companies/${props.companyId}`;
    const results = await Promise.allSettled([
      api<{ trends: TrendRow[] }>(`${base}/trends`),
      api<{ executions: ExecutionRow[] }>(`${base}/executions`),
      api<{ verifications: VerificationRow[] }>(`${base}/verifications`),
      api<{ items: WatchlistRow[] }>(`${base}/watchlists`),
    ]);
    if (results[0].status === 'fulfilled') setTrends(results[0].value.trends);
    if (results[1].status === 'fulfilled') setExecutions(results[1].value.executions);
    if (results[2].status === 'fulfilled') setVerifications(results[2].value.verifications);
    if (results[3].status === 'fulfilled') setWatchlists(results[3].value.items);
  }, [props.companyId]);

  useEffect(() => {
    if (!open) return;
    void load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [open, load]);

  const moduleName = useCallback(
    (id: string) => props.modules.find((m) => m.id === id)?.name ?? 'unknown',
    [props.modules],
  );
  const byModule = <T extends { moduleId: string }>(rows: T[]) =>
    moduleFilter === 'all' ? rows : rows.filter((r) => r.moduleId === moduleFilter);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 border-t border-[var(--color-line)] bg-[var(--color-surface-1)] py-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
      >
        Trends · Scenarios · Watch lists · Decisions ▲
      </button>
    );
  }

  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-1.5">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
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
        <div className="flex items-center gap-2">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            aria-label="Filter by module"
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-xs text-[var(--color-ink-dim)] outline-none"
          >
            <option value="all">All modules</option>
            {props.modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.type})
              </option>
            ))}
          </select>
          <button
            onClick={() => setOpen(false)}
            className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            aria-label="Collapse bottom panel"
          >
            ▼
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 text-sm">
        {tab === 'trends' && (
          <Table
            head={['Symbol', 'Direction', 'Strength', 'Source', 'Module', 'Scanned']}
            rows={byModule(trends).map((t) => [
              <span key="s" className="font-mono">
                {t.symbol}
              </span>,
              <span key="d" className="capitalize" style={{ color: toneFor(t.direction) }}>
                {t.direction}
              </span>,
              t.strengthBand,
              t.sourceClass === 'deterministic_scan' ? 'scan' : 'model',
              moduleName(t.moduleId),
              new Date(t.scannedAt).toLocaleTimeString(),
            ])}
            empty="No trend candidates. Run a scan from a trend module."
          />
        )}

        {tab === 'scenarios' && (
          <ScenarioView trends={byModule(trends)} executions={executions} moduleName={moduleName} />
        )}

        {tab === 'watchlists' && (
          <Table
            head={['Symbol', 'Bias', 'Status', 'Module', 'Note', 'Updated']}
            rows={byModule(watchlists).map((w) => [
              <span key="s" className="font-mono">
                {w.symbol}
              </span>,
              <span
                key="b"
                className="capitalize"
                style={{
                  color:
                    w.bias === 'long'
                      ? 'var(--color-ok)'
                      : w.bias === 'short'
                        ? 'var(--color-block)'
                        : 'var(--color-ink-dim)',
                }}
              >
                {w.bias}
              </span>,
              w.status,
              w.moduleName,
              <span key="n" className="block max-w-56 truncate">
                {w.note || '—'}
              </span>,
              new Date(w.updatedAt).toLocaleTimeString(),
            ])}
            empty="No watched symbols. Add them from a trading or trend module inspector."
          />
        )}

        {tab === 'decisions' && (
          <Table
            head={['Outcome', 'Detail', 'Amount', 'Verification', 'Module', 'Time']}
            rows={byModule(executions).map((e) => {
              const v = verifications.find((x) => x.traceId === e.id);
              return [
                <span key="o" className="capitalize" style={{ color: toneFor(e.outcome) }}>
                  {e.outcome}
                </span>,
                <span key="d" className="block max-w-72 truncate">
                  {e.description ?? e.failureCode ?? `${e.venue} · ${e.mode}`}
                </span>,
                e.amountCents ? (
                  <span key="a" className="font-mono">
                    {dollars(e.amountCents)}
                  </span>
                ) : (
                  '—'
                ),
                v ? (
                  <span key="v" style={{ color: toneFor(v.result) }}>
                    {v.result}
                    {v.failureCode ? ` (${v.failureCode})` : ''}
                  </span>
                ) : (
                  '—'
                ),
                moduleName(e.moduleId),
                new Date(e.createdAt).toLocaleTimeString(),
              ];
            })}
            empty="No decisions traced yet."
          />
        )}
      </div>
    </section>
  );
}

function Table(props: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (props.rows.length === 0) {
    return <p className="py-3 text-xs text-[var(--color-ink-faint)]">{props.empty}</p>;
  }
  return (
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-[var(--color-surface-1)] text-[var(--color-ink-faint)]">
        <tr>
          {props.head.map((h) => (
            <th key={h} className="pb-1.5 pr-3 font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="text-[var(--color-ink-dim)]">
        {props.rows.map((cells, i) => (
          <tr key={i} className="border-t border-[var(--color-line)]">
            {cells.map((c, j) => (
              <td key={j} className="py-1.5 pr-3 align-top">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Scenario engine: shows how trend candidates decompose into trade actions —
 * each trend is matched with executions on the same symbol. Simulated runs
 * join this view when the simulator module lands.
 */
function ScenarioView(props: {
  trends: TrendRow[];
  executions: ExecutionRow[];
  moduleName: (id: string) => string;
}) {
  if (props.trends.length === 0) {
    return (
      <p className="py-3 text-xs text-[var(--color-ink-faint)]">
        No scenarios yet — scenarios appear when trend candidates exist and trades reference them.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {props.trends.map((t) => {
        const related = props.executions.filter((e) => (e.description ?? '').includes(t.symbol));
        return (
          <li key={t.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-medium">{t.symbol}</span>
              <span className="capitalize" style={{ color: toneFor(t.direction) }}>
                {t.direction} · {t.strengthBand}
              </span>
              <span className="text-[var(--color-ink-faint)]">
                from {props.moduleName(t.moduleId)}
              </span>
            </div>
            {related.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-[var(--color-ink-dim)]">
                {related.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="capitalize" style={{ color: toneFor(e.outcome) }}>
                      {e.outcome}
                    </span>
                    <span className="truncate">{e.description ?? e.failureCode ?? ''}</span>
                    {e.amountCents && <span className="font-mono">{dollars(e.amountCents)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
                No trades against this trend yet.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
