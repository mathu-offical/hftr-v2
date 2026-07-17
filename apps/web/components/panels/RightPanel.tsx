'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { ACTIVITY_REFRESH_EVENT } from '../canvas/PaperTradeForm';
import { dollars, scaled, toneFor } from './format';

type Tab = 'verification' | 'executions' | 'ledger' | 'simulation' | 'values';
const TABS: { id: Tab; label: string }[] = [
  { id: 'verification', label: 'Verify' },
  { id: 'executions', label: 'Executions' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'simulation', label: 'Sims' },
  { id: 'values', label: 'Values' },
];
const RIGHT_TABS: Tab[] = TABS.map((t) => t.id);

function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

function readPanelState<T extends Record<string, unknown>>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function writePanelState(key: string, value: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota or private mode — ignore
  }
}

function isRightTab(v: unknown): v is Tab {
  return typeof v === 'string' && RIGHT_TABS.includes(v as Tab);
}

interface LedgerRow {
  id: string;
  kind: string;
  amountCents: string;
  balanceAfterCents: string;
  description: string;
  traceId?: string;
  createdAt: string;
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
  fieldResults: unknown;
  failureCode: string | null;
  createdAt: string;
}

interface PositionRow {
  id: string;
  symbol: string;
  qty: string;
  avgCostCents: number;
  markCents: number;
  unrealizedPnlCents: string;
  realizedPnlCents: string;
}

interface ValueRow {
  ref: string;
  kind: string;
  unit: string;
  scale: number;
  valueInt: string;
  sourceClass: string;
  sourceId: string;
  capturedAt: string;
}

interface SimulationRow {
  id: string;
  moduleId: string | null;
  label: string;
  status: string;
  config: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Right panel (ui-ux spec): Verification, Executions, Ledger (with open
 * positions), Simulation, and the Math value-store audit. Read-only
 * projections over append-only sources.
 */
export function RightPanel(props: { companyId: string }) {
  const storageKey = props.companyId ? `hftr:${props.companyId}:panel:right` : null;

  const [tab, setTab] = useState<Tab>('executions');
  const [open, setOpen] = useState(true);
  const [persistReady, setPersistReady] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [values, setValues] = useState<ValueRow[]>([]);
  const [simulations, setSimulations] = useState<SimulationRow[]>([]);
  const [simComparison, setSimComparison] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setPersistReady(true);
      return;
    }
    const stored = readPanelState<{ open?: unknown; tab?: unknown }>(storageKey);
    if (stored) {
      if (typeof stored.open === 'boolean') setOpen(stored.open);
      if (isRightTab(stored.tab)) setTab(stored.tab);
    }
    setPersistReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !persistReady) return;
    writePanelState(storageKey, { open, tab });
  }, [storageKey, open, tab, persistReady]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ']' && !isEditableTarget(e)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open && !isEditableTarget(e)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const load = useCallback(async () => {
    const base = `/api/companies/${props.companyId}`;
    const results = await Promise.allSettled([
      api<{ balanceCents: string; ledger: LedgerRow[] }>(`${base}/activity`),
      api<{ executions: ExecutionRow[] }>(`${base}/executions`),
      api<{ verifications: VerificationRow[] }>(`${base}/verifications`),
      api<{ positions: PositionRow[] }>(`${base}/positions`),
      api<{ values: ValueRow[] }>(`${base}/values`),
      api<{ runs: SimulationRow[]; comparison?: { runIds: string[]; deltaSummary: string } }>(
        `${base}/simulations`,
      ),
    ]);
    if (results[0].status === 'fulfilled') {
      setBalance(results[0].value.balanceCents);
      setLedger(results[0].value.ledger);
    }
    if (results[1].status === 'fulfilled') setExecutions(results[1].value.executions);
    if (results[2].status === 'fulfilled') setVerifications(results[2].value.verifications);
    if (results[3].status === 'fulfilled') setPositions(results[3].value.positions);
    if (results[4].status === 'fulfilled') setValues(results[4].value.values);
    if (results[5].status === 'fulfilled') {
      setSimulations(results[5].value.runs);
      setSimComparison(results[5].value.comparison?.deltaSummary ?? null);
    }
  }, [props.companyId]);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 20_000);
    window.addEventListener(ACTIVITY_REFRESH_EVENT, load);
    return () => {
      clearInterval(interval);
      window.removeEventListener(ACTIVITY_REFRESH_EVENT, load);
    };
  }, [load]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Expand info panel (keyboard shortcut ])"
        title="Expand info panel (])"
        className="border-l border-[var(--color-line)] bg-[var(--color-surface-1)] px-1.5 text-[10px] tracking-widest text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        style={{ writingMode: 'vertical-rl' }}
      >
        INFO · ]
      </button>
    );
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded px-1.5 py-1 text-xs ${
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
          aria-label="Collapse info panel (keyboard shortcut ] or Escape)"
          title="Collapse (] or Esc)"
        >
          ×
        </button>
      </div>

      <div className="border-b border-[var(--color-line)] px-4 py-2.5">
        <div className="text-xs text-[var(--color-ink-dim)]">Paper balance</div>
        <div className="font-mono text-lg">{balance ? dollars(balance) : '—'}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {tab === 'verification' && (
          <VerificationTab verifications={verifications} executions={executions} />
        )}
        {tab === 'executions' && <ExecutionsTab executions={executions} />}
        {tab === 'ledger' && <LedgerTab ledger={ledger} positions={positions} />}
        {tab === 'simulation' && (
          <SimulationTab runs={simulations} comparisonSummary={simComparison} />
        )}
        {tab === 'values' && <ValuesTab companyId={props.companyId} values={values} />}
      </div>
    </aside>
  );
}

function Empty(props: { text: string }) {
  return <p className="px-1 text-xs text-[var(--color-ink-faint)]">{props.text}</p>;
}

function VerificationTab(props: { verifications: VerificationRow[]; executions: ExecutionRow[] }) {
  if (props.verifications.length === 0)
    return (
      <Empty text="No verifications yet. Every dispatched action is verified before it counts." />
    );
  return (
    <ul className="space-y-2">
      {props.verifications.map((v) => {
        const exec = props.executions.find((e) => e.id === v.traceId);
        return (
          <li key={v.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: toneFor(v.result) }}
              >
                {v.result}
              </span>
              <span className="text-[10px] text-[var(--color-ink-faint)]">
                {new Date(v.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="mt-1 text-xs text-[var(--color-ink-dim)]">
              {exec?.description ?? v.failureCode ?? 'schema verification'}
            </div>
            {v.failureCode && (
              <div className="mt-1 text-[10px] text-[var(--color-block)]">{v.failureCode}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ExecutionsTab(props: { executions: ExecutionRow[] }) {
  if (props.executions.length === 0)
    return <Empty text="No executions yet. Submit a paper order from a trading module." />;
  return (
    <ul className="space-y-2">
      {props.executions.map((e) => (
        <li key={e.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium capitalize" style={{ color: toneFor(e.outcome) }}>
              {e.outcome}
            </span>
            <span className="text-[10px] text-[var(--color-ink-faint)]">
              {new Date(e.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--color-ink-dim)]">
            {e.description ?? e.failureCode ?? `${e.venue} · ${e.mode}`}
          </div>
          {e.amountCents && <div className="mt-1 font-mono text-xs">{dollars(e.amountCents)}</div>}
        </li>
      ))}
    </ul>
  );
}

function LedgerTab(props: { ledger: LedgerRow[]; positions: PositionRow[] }) {
  const held = props.positions.filter((p) => BigInt(p.qty) !== 0n);
  return (
    <div className="space-y-4">
      {held.length > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            Open positions
          </div>
          <ul className="space-y-1.5">
            {held.map((p) => {
              const unrealized = BigInt(p.unrealizedPnlCents);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-xs"
                >
                  <span className="font-mono font-medium">{p.symbol}</span>
                  <span className="text-[var(--color-ink-dim)]">
                    {p.qty} sh · avg {dollars(p.avgCostCents)}
                  </span>
                  <span
                    className="font-mono"
                    style={{ color: unrealized >= 0n ? 'var(--color-ok)' : 'var(--color-block)' }}
                  >
                    {dollars(p.unrealizedPnlCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-1.5 px-1 text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
          Entries
        </div>
        {props.ledger.length === 0 ? (
          <Empty text="No ledger entries yet." />
        ) : (
          <ul className="space-y-1.5">
            {props.ledger.map((l) => (
              <li key={l.id} className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono">{dollars(l.amountCents)}</span>
                  <span className="text-[10px] text-[var(--color-ink-faint)]">
                    bal {dollars(l.balanceAfterCents)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--color-ink-dim)]">
                  {l.description}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SimulationTab(props: { runs: SimulationRow[]; comparisonSummary: string | null }) {
  if (props.runs.length === 0) {
    return (
      <Empty text="No simulation runs yet. Create one via POST /simulations or the simulator module." />
    );
  }
  return (
    <div className="space-y-2">
      {props.comparisonSummary && (
        <div
          role="status"
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5 text-[11px] text-[var(--color-ink-dim)]"
        >
          <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            Comparison
          </p>
          <p>{props.comparisonSummary}</p>
        </div>
      )}
      <ul className="space-y-2">
        {props.runs.map((run) => {
          const fillCount =
            typeof run.resultSummary.fillCount === 'number' ? run.resultSummary.fillCount : null;
          const pnlBand =
            typeof run.resultSummary.realizedPnlBand === 'string'
              ? run.resultSummary.realizedPnlBand
              : null;
          const provenance =
            typeof run.resultSummary.provenance === 'string' ? run.resultSummary.provenance : null;
          const analyzerSummary =
            typeof run.resultSummary.analyzerSummary === 'string'
              ? run.resultSummary.analyzerSummary
              : null;
          return (
            <li key={run.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-ink)]">{run.label}</span>
                <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                  {run.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
                {run.moduleId ? `module ${run.moduleId.slice(0, 8)}…` : 'company-scoped'} ·{' '}
                {new Date(run.createdAt).toLocaleString()}
              </p>
              {(fillCount !== null || pnlBand || provenance) && (
                <p className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
                  {fillCount !== null && <span>{fillCount} fills</span>}
                  {pnlBand && (
                    <span>
                      {fillCount !== null ? ' · ' : ''}
                      P&L band: {pnlBand.replace(/_/g, ' ')}
                    </span>
                  )}
                  {provenance && (
                    <span>
                      {' · '}
                      via {provenance}
                    </span>
                  )}
                </p>
              )}
              {analyzerSummary && (
                <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">{analyzerSummary}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ValuesTab(props: { companyId: string; values: ValueRow[] }) {
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [lineage, setLineage] = useState<
    Array<{
      ref: string;
      kind: string;
      sourceClass: string;
      sourceId: string;
      depth: number;
    }>
  >([]);
  const [lineageTruncated, setLineageTruncated] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);

  async function loadLineage(ref: string) {
    setSelectedRef(ref);
    setLineageError(null);
    try {
      const result = await api<{
        chain: Array<{
          ref: string;
          kind: string;
          sourceClass: string;
          sourceId: string;
          depth: number;
        }>;
        truncated: boolean;
      }>(`/api/companies/${props.companyId}/values/${encodeURIComponent(ref)}/lineage`);
      setLineage(result.chain);
      setLineageTruncated(result.truncated);
    } catch {
      setLineage([]);
      setLineageTruncated(false);
      setLineageError('Could not load lineage for this value.');
    }
  }

  if (props.values.length === 0) return <Empty text="No recorded values yet for this company." />;
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {props.values.map((v) => (
          <li key={v.ref}>
            <button
              type="button"
              onClick={() => void loadLineage(v.ref)}
              className={`w-full rounded-md border px-2.5 py-1.5 text-left ${
                selectedRef === v.ref
                  ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                  : 'border-[var(--color-line)] hover:bg-[var(--color-surface-2)]'
              }`}
              aria-label={`Show lineage for value ${v.ref}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">
                  {scaled(v.valueInt, v.scale)} {v.unit}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                  {v.kind}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-[var(--color-ink-faint)]">
                {v.sourceClass} · {v.sourceId} · {new Date(v.capturedAt).toLocaleTimeString()}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selectedRef && (
        <div className="rounded-lg border border-[var(--color-line)] p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            Lineage chain
          </div>
          {lineageError ? (
            <p className="mt-1 text-xs text-[var(--color-block)]">{lineageError}</p>
          ) : lineage.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--color-ink-faint)]">Loading lineage…</p>
          ) : (
            <ol className="mt-1.5 space-y-1 text-xs text-[var(--color-ink-dim)]">
              {lineage.map((node) => (
                <li key={`${node.ref}-${node.depth}`}>
                  <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                    depth {node.depth}
                  </span>
                  {' · '}
                  {node.kind} · {node.sourceClass} · {node.sourceId}
                </li>
              ))}
            </ol>
          )}
          {lineageTruncated && (
            <p className="mt-1 text-[10px] text-[var(--color-warn)]">
              Lineage truncated at depth cap.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
