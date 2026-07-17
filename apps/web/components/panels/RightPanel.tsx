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
    ]);
    if (results[0].status === 'fulfilled') {
      setBalance(results[0].value.balanceCents);
      setLedger(results[0].value.ledger);
    }
    if (results[1].status === 'fulfilled') setExecutions(results[1].value.executions);
    if (results[2].status === 'fulfilled') setVerifications(results[2].value.verifications);
    if (results[3].status === 'fulfilled') setPositions(results[3].value.positions);
    if (results[4].status === 'fulfilled') setValues(results[4].value.values);
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
          <p className="px-1 text-xs text-[var(--color-ink-faint)]">
            Simulation runs and their analyses appear here once a simulator module executes its
            first run (simulator milestone).
          </p>
        )}
        {tab === 'values' && <ValuesTab values={values} />}
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

function ValuesTab(props: { values: ValueRow[] }) {
  if (props.values.length === 0) return <Empty text="No recorded values yet for this company." />;
  return (
    <ul className="space-y-1.5">
      {props.values.map((v) => (
        <li key={v.ref} className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5">
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
        </li>
      ))}
    </ul>
  );
}
