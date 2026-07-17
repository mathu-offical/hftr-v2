'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { ACTIVITY_REFRESH_EVENT } from './canvas/PaperTradeForm';

interface LedgerRow {
  id: string;
  kind: string;
  amountCents: string;
  balanceAfterCents: string;
  description: string;
  traceId?: string;
  createdAt: string;
}

interface TraceRow {
  id: string;
  outcome: string;
  venue: string;
  mode: string;
  failureCode: string | null;
  createdAt: string;
  verification: { result: string } | null;
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

interface TrendRow {
  id: string;
  symbol: string;
  direction: string;
  strengthBand: string;
  sourceClass: string;
  scannedAt: string;
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

interface Activity {
  balanceCents: string;
  ledger: LedgerRow[];
  traces: TraceRow[];
}

type Tab = 'activity' | 'positions' | 'trends' | 'values';
const TABS: { id: Tab; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'positions', label: 'Positions' },
  { id: 'trends', label: 'Trends' },
  { id: 'values', label: 'Values' },
];

function dollars(cents: string | number): string {
  const n = BigInt(cents);
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  return `${sign}$${(abs / 100n).toLocaleString()}.${String(abs % 100n).padStart(2, '0')}`;
}

function scaled(valueInt: string, scale: number): string {
  if (scale === 0) return valueInt;
  const s = valueInt.replace('-', '').padStart(scale + 1, '0');
  const sign = valueInt.startsWith('-') ? '-' : '';
  return `${sign}${s.slice(0, -scale)}.${s.slice(-scale)}`;
}

const OUTCOME_COLOR: Record<string, string> = {
  filled: 'var(--color-ok)',
  blocked: 'var(--color-block)',
  rejected: 'var(--color-warn)',
  up: 'var(--color-ok)',
  down: 'var(--color-block)',
  flat: 'var(--color-ink-dim)',
};

/**
 * Right rail: balance + tabbed projections (activity ledger/traces, positions
 * with mark-to-market, trend candidates, and the Math value-store audit).
 * All sources are append-only or derived; nothing here mutates state.
 */
export function ActivityPanel(props: { companyId: string }) {
  const [tab, setTab] = useState<Tab>('activity');
  const [open, setOpen] = useState(true);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [values, setValues] = useState<ValueRow[]>([]);

  const load = useCallback(async () => {
    try {
      const base = `/api/companies/${props.companyId}`;
      const [a, p, t, v] = await Promise.all([
        api<Activity>(`${base}/activity`),
        api<{ positions: PositionRow[] }>(`${base}/positions`),
        api<{ trends: TrendRow[] }>(`${base}/trends`),
        api<{ values: ValueRow[] }>(`${base}/values`),
      ]);
      setActivity(a);
      setPositions(p.positions);
      setTrends(t.trends);
      setValues(v.values);
    } catch {
      // transient; next poll retries
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
        className="border-l border-[var(--color-line)] bg-[var(--color-surface-1)] px-1.5 text-[10px] tracking-widest text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        style={{ writingMode: 'vertical-rl' }}
      >
        INFO
      </button>
    );
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex gap-1">
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
        <button
          onClick={() => setOpen(false)}
          className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-label="Collapse info panel"
        >
          ×
        </button>
      </div>

      <div className="border-b border-[var(--color-line)] px-4 py-2.5">
        <div className="text-xs text-[var(--color-ink-dim)]">Paper balance</div>
        <div className="font-mono text-lg">{activity ? dollars(activity.balanceCents) : '—'}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {tab === 'activity' && <ActivityTab activity={activity} />}
        {tab === 'positions' && <PositionsTab positions={positions} />}
        {tab === 'trends' && <TrendsTab trends={trends} />}
        {tab === 'values' && <ValuesTab values={values} />}
      </div>
    </aside>
  );
}

function Empty(props: { text: string }) {
  return <p className="px-1 text-xs text-[var(--color-ink-faint)]">{props.text}</p>;
}

function ActivityTab({ activity }: { activity: Activity | null }) {
  if (!activity || activity.traces.length === 0)
    return (
      <Empty text="No activity yet. Add a trading module, set it active, and submit a paper order." />
    );
  return (
    <ul className="space-y-2.5">
      {activity.traces.map((t) => {
        const ledger = activity.ledger.find((l) => l.traceId === t.id);
        return (
          <li key={t.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium capitalize"
                style={{ color: OUTCOME_COLOR[t.outcome] ?? 'var(--color-ink)' }}
              >
                {t.outcome}
              </span>
              <span className="text-[10px] text-[var(--color-ink-faint)]">
                {new Date(t.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="mt-1 text-xs text-[var(--color-ink-dim)]">
              {ledger ? ledger.description : (t.failureCode ?? `${t.venue} · ${t.mode}`)}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              {ledger && <span className="font-mono text-xs">{dollars(ledger.amountCents)}</span>}
              {t.verification && (
                <span
                  className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                  style={{
                    color:
                      t.verification.result === 'pass' ? 'var(--color-ok)' : 'var(--color-block)',
                  }}
                >
                  verify {t.verification.result}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PositionsTab({ positions }: { positions: PositionRow[] }) {
  const held = positions.filter((p) => BigInt(p.qty) !== 0n);
  if (held.length === 0) return <Empty text="No open positions." />;
  return (
    <ul className="space-y-2">
      {held.map((p) => {
        const unrealized = BigInt(p.unrealizedPnlCents);
        return (
          <li key={p.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-medium">{p.symbol}</span>
              <span className="font-mono text-xs">{p.qty} sh</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-[var(--color-ink-dim)]">
              <span>
                avg {dollars(p.avgCostCents)} · mark {dollars(p.markCents)}
              </span>
              <span
                className="font-mono"
                style={{ color: unrealized >= 0n ? 'var(--color-ok)' : 'var(--color-block)' }}
              >
                {dollars(p.unrealizedPnlCents)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TrendsTab({ trends }: { trends: TrendRow[] }) {
  if (trends.length === 0)
    return <Empty text="No trend candidates yet. Select a trend module and run a scan." />;
  return (
    <ul className="space-y-2">
      {trends.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between rounded-lg border border-[var(--color-line)] px-2.5 py-2"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{t.symbol}</span>
            <span
              className="text-xs capitalize"
              style={{ color: OUTCOME_COLOR[t.direction] ?? 'var(--color-ink)' }}
            >
              {t.direction} · {t.strengthBand}
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-ink-faint)]">
            {t.sourceClass === 'deterministic_scan' ? 'scan' : 'model'} ·{' '}
            {new Date(t.scannedAt).toLocaleTimeString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ValuesTab({ values }: { values: ValueRow[] }) {
  if (values.length === 0) return <Empty text="No recorded values yet for this company." />;
  return (
    <ul className="space-y-1.5">
      {values.map((v) => (
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
