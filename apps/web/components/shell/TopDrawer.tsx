'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PHILOSOPHY_PROFILE,
  normalizePhilosophyProfile,
  PHILOSOPHY_AXIS_CATALOG,
  type BandPosition,
  type LlmBudgetSummary,
  type LlmBudgetsResponse,
  type PhilosophyProfile,
} from '@hftr/contracts';
import { api } from '@/lib/client';

type Tab = 'ledger' | 'profile' | 'operating' | 'settings' | 'philosophy';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ledger', label: 'Ledger / PnL' },
  { id: 'profile', label: 'Trading profile' },
  { id: 'operating', label: 'LLM / operating' },
  { id: 'settings', label: 'Settings' },
  { id: 'philosophy', label: 'Philosophy' },
];

interface LedgerRow {
  id: string;
  kind: string;
  amountCents: string;
  balanceAfterCents: string;
  description: string;
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

function dollars(cents: string | number): string {
  const n = BigInt(cents);
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  return `${sign}$${(abs / 100n).toLocaleString()}.${String(abs % 100n).padStart(2, '0')}`;
}

/**
 * Top drawer sliding from the app-shell ribbon (ui-ux spec): company ledger
 * and PnL rollup, trading profile summary, settings, and the editable
 * philosophy prompt.
 */
export function TopDrawer(props: {
  companyId: string;
  companyName: string;
  philosophy: string;
  philosophyProfile?: unknown;
  seedCreditsCents: string;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('ledger');
  const [balance, setBalance] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [llmBudgets, setLlmBudgets] = useState<LlmBudgetSummary[]>([]);

  const load = useCallback(async () => {
    try {
      const base = `/api/companies/${props.companyId}`;
      const [a, p, budgets] = await Promise.all([
        api<{ balanceCents: string; ledger: LedgerRow[] }>(`${base}/activity`),
        api<{ positions: PositionRow[] }>(`${base}/positions`),
        api<LlmBudgetsResponse>(`${base}/llm-budgets`),
      ]);
      setBalance(a.balanceCents);
      setLedger(a.ledger);
      setPositions(p.positions);
      setLlmBudgets(budgets.providers);
    } catch {
      // transient
    }
  }, [props.companyId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const realized = positions.reduce((acc, p) => acc + BigInt(p.realizedPnlCents), 0n);
  const unrealized = positions.reduce((acc, p) => acc + BigInt(p.unrealizedPnlCents), 0n);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md px-2 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        aria-expanded={open}
      >
        {open ? 'Close ▲' : 'Company ▾'}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-2xl">
          <div className="mx-auto flex max-w-5xl gap-6 px-6 py-4">
            <nav className="w-40 shrink-0 space-y-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${
                    tab === t.id
                      ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                      : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <div className="min-h-48 max-h-80 min-w-0 flex-1 overflow-y-auto pr-2">
              {tab === 'ledger' && (
                <div className="space-y-4">
                  <div className="flex gap-8">
                    <Metric label="Paper balance" value={balance ? dollars(balance) : '—'} />
                    <Metric
                      label="Realized PnL"
                      value={dollars(realized.toString())}
                      tone={realized >= 0n ? 'ok' : 'block'}
                    />
                    <Metric
                      label="Unrealized PnL"
                      value={dollars(unrealized.toString())}
                      tone={unrealized >= 0n ? 'ok' : 'block'}
                    />
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="text-[var(--color-ink-faint)]">
                      <tr>
                        <th className="pb-1.5 font-normal">Entry</th>
                        <th className="pb-1.5 font-normal">Amount</th>
                        <th className="pb-1.5 font-normal">Balance after</th>
                        <th className="pb-1.5 font-normal">Time</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--color-ink-dim)]">
                      {ledger.map((l) => (
                        <tr key={l.id} className="border-t border-[var(--color-line)]">
                          <td className="max-w-64 truncate py-1.5 pr-3">{l.description}</td>
                          <td className="py-1.5 pr-3 font-mono">{dollars(l.amountCents)}</td>
                          <td className="py-1.5 pr-3 font-mono">{dollars(l.balanceAfterCents)}</td>
                          <td className="py-1.5 text-[var(--color-ink-faint)]">
                            {new Date(l.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {ledger.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-3 text-[var(--color-ink-faint)]">
                            No ledger entries yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'profile' && (
                <div className="space-y-3 text-sm text-[var(--color-ink-dim)]">
                  <Metric label="Company" value={props.companyName} />
                  <Metric label="Seed credits" value={dollars(props.seedCreditsCents)} />
                  <Metric label="Created" value={new Date(props.createdAt).toLocaleDateString()} />
                  <Metric
                    label="Open positions"
                    value={String(positions.filter((p) => BigInt(p.qty) !== 0n).length)}
                  />
                  <p className="pt-2 text-xs text-[var(--color-ink-faint)]">
                    Broker connections, risk envelopes, and live-trading arming land with the broker
                    milestone; paper mode uses the built-in simulator adapter.
                  </p>
                </div>
              )}

              {tab === 'operating' && <OperatingBudgets budgets={llmBudgets} />}

              {tab === 'settings' && (
                <SettingsTab companyId={props.companyId} name={props.companyName} />
              )}

              {tab === 'philosophy' && (
                <PhilosophyTab
                  companyId={props.companyId}
                  philosophy={props.philosophy}
                  philosophyProfile={props.philosophyProfile}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OperatingBudgets(props: { budgets: LlmBudgetSummary[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-ink)]">Provider operating budgets</h3>
        <p className="text-[11px] text-[var(--color-ink-faint)]">
          API-provider spend and call admission are separate from module trading-capital
          allocations.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {props.budgets.map((budget) => (
          <div
            key={budget.provider}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium capitalize text-[var(--color-ink)]">
                {budget.provider}
              </span>
              <span className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-faint)]">
                {budget.credentialSource.replace('_', ' ')}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-[10px] text-[var(--color-ink-dim)]">
              <BudgetLine label="Calls" consumed={budget.consumedCalls} maximum={budget.maxCalls} />
              <BudgetLine
                label="Provider cost"
                consumed={budget.consumedCostCents}
                maximum={budget.maxCostCents}
                cents
              />
              <p className="text-[var(--color-ink-faint)]">
                {budget.windowMinutes
                  ? `${budget.windowMinutes}-minute admission window`
                  : 'No company budget configured'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetLine(props: {
  label: string;
  consumed: number;
  maximum: number | null;
  cents?: boolean;
}) {
  const format = (value: number) => (props.cents ? dollars(value) : value.toLocaleString());
  return (
    <div className="flex justify-between gap-3">
      <span>{props.label}</span>
      <span className="font-mono text-[var(--color-ink)]">
        {format(props.consumed)} / {props.maximum === null ? 'unbounded' : format(props.maximum)}
      </span>
    </div>
  );
}

function Metric(props: { label: string; value: string; tone?: 'ok' | 'block' }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-ink-faint)]">{props.label}</div>
      <div
        className="font-mono text-sm"
        style={
          props.tone
            ? { color: props.tone === 'ok' ? 'var(--color-ok)' : 'var(--color-block)' }
            : undefined
        }
      >
        {props.value}
      </div>
    </div>
  );
}

function SettingsTab(props: { companyId: string; name: string }) {
  const [name, setName] = useState(props.name);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    try {
      await api(`/api/companies/${props.companyId}`, { method: 'PATCH', body: { name } });
      setMessage('Saved. Reload to see the new name everywhere.');
    } catch {
      setMessage('Save failed.');
    }
  }

  return (
    <div className="max-w-md space-y-3">
      <label className="block space-y-1.5">
        <span className="text-xs text-[var(--color-ink-dim)]">Company name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      <button
        onClick={save}
        className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
      >
        Save
      </button>
      {message && <p className="text-xs text-[var(--color-ink-dim)]">{message}</p>}
    </div>
  );
}

function PhilosophyTab(props: {
  companyId: string;
  philosophy: string;
  philosophyProfile?: unknown;
}) {
  const [text, setText] = useState(props.philosophy);
  const [profile, setProfile] = useState<PhilosophyProfile>(() =>
    normalizePhilosophyProfile(props.philosophyProfile ?? DEFAULT_PHILOSOPHY_PROFILE),
  );
  const [message, setMessage] = useState<string | null>(null);

  function setAxis(axisId: keyof PhilosophyProfile['axes'], position: BandPosition) {
    setProfile((prev) => ({
      version: 1,
      axes: { ...prev.axes, [axisId]: position },
    }));
  }

  async function save() {
    try {
      await api(`/api/companies/${props.companyId}`, {
        method: 'PATCH',
        body: { philosophyPrompt: text, philosophyProfile: profile },
      });
      setMessage(
        'Philosophy saved — promote/compile will map axes to lever band positions and sizing.',
      );
    } catch {
      setMessage('Save failed.');
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-ink-faint)]">
        Free-text steers narrative research context. Slideable axes map deterministically to
        bounded-range lever positions (min / typical / max). They never emit raw prices or
        timestamps — only band selections the calculator understands.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={4000}
        className="w-full resize-none rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {PHILOSOPHY_AXIS_CATALOG.map((axis) => {
          const value = profile.axes[axis.id] ?? 'typical';
          return (
            <label
              key={axis.id}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--color-ink)]">
                  {axis.label}
                </span>
                <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">
                  {axis.layer}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">{axis.description}</p>
              <select
                value={value}
                onChange={(e) => setAxis(axis.id, e.target.value as BandPosition)}
                className="mt-1.5 w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-1.5 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
              >
                <option value="min">min (conservative)</option>
                <option value="typical">typical</option>
                <option value="max">max (aggressive)</option>
              </select>
            </label>
          );
        })}
      </div>
      <button
        onClick={save}
        className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
      >
        Save philosophy
      </button>
      {message && <p className="text-xs text-[var(--color-ink-dim)]">{message}</p>}
    </div>
  );
}
