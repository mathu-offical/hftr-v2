'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  admitsRetention,
  DEFAULT_PHILOSOPHY_PROFILE,
  LlmTier,
  modelsForTier,
  normalizePhilosophyProfile,
  PHILOSOPHY_AXIS_CATALOG,
  type BandPosition,
  type BrokerConnectionSummary,
  type CompanyBrokerStatus,
  type CompanyLlmPolicy,
  type LlmBudgetSummary,
  type MarketHubResponse,
  type ModelCapability,
  type PhilosophyProfile,
  type RetentionClass,
} from '@hftr/contracts';
import { api } from '@/lib/client';
import { useOptionalLlmConnectionStatus } from '@/components/shell/LlmConnectionStatus';
import { CompanySectorsTab } from '@/components/shell/CompanySectorsTab';
import { MarketPostureEquityChart } from '@/components/panels/MarketPostureEquityChart';
import { MarketPosturePieChart } from '@/components/market/MarketPosturePieChart';
import { MarketPostureMetricBars } from '@/components/market/MarketPostureMetricBars';
import {
  invalidateDrawerSlice,
  loadDrawerSlice,
  peekDrawerSlice,
} from '@/lib/company-drawer-cache';
import { loadMarketHub, peekMarketHub } from '@/lib/market-hub-cache';

type Tab = 'desk' | 'mandate' | 'operating' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'desk', label: 'Desk / PnL' },
  { id: 'mandate', label: 'Philosophy & sectors' },
  { id: 'operating', label: 'LLM / operating' },
  { id: 'settings', label: 'Settings' },
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

type DeskSlice = {
  balanceCents: string;
  ledger: LedgerRow[];
  positions: PositionRow[];
};

function dollars(cents: string | number): string {
  const n = BigInt(cents);
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  return `${sign}$${(abs / 100n).toLocaleString()}.${String(abs % 100n).padStart(2, '0')}`;
}

/**
 * Top drawer from the app-shell ribbon (ui-ux spec / D-115): layered overlay
 * (not full-bleed), condensed Desk/PnL + Philosophy & sectors tabs, SWR cache
 * with lazy refresh when a section is viewed.
 */
export function TopDrawer(props: {
  companyId: string;
  companyName: string;
  philosophy: string;
  philosophyProfile?: unknown;
  seedCreditsCents: string;
  createdAt: string;
  sectorFocuses?: string[];
  universeExcludes?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('desk');
  const llmConnection = useOptionalLlmConnectionStatus();
  const llmBudgets = llmConnection?.budgets ?? [];

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
          open
            ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)] text-[var(--color-ink)]'
            : 'border-[var(--color-line)] bg-[var(--color-surface-0)] text-[var(--color-ink-dim)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
        }`}
        aria-expanded={open}
        aria-controls="company-profile-drawer"
        data-testid="company-profile-toggle"
      >
        <span>Company profile</span>
        <span aria-hidden className="text-[9px] text-[var(--color-ink-faint)]">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Dismiss company profile"
            className="fixed inset-0 z-30 bg-black/45"
            onClick={() => setOpen(false)}
          />
          <div
            id="company-profile-drawer"
            className="absolute left-1/2 top-full z-40 flex h-[min(86vh,calc(100vh-3.25rem))] w-[min(42rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-b-lg border border-t-0 border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
            data-testid="company-top-drawer"
            role="dialog"
            aria-label="Company profile"
          >
            <div className="flex min-h-0 flex-1 gap-4 px-4 py-3">
              <nav
                className="w-36 shrink-0 space-y-0.5 border-r border-[var(--color-line)] pr-3"
                aria-label="Company sections"
              >
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`block w-full border-l-2 px-2.5 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                      tab === t.id
                        ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                        : 'border-transparent text-[var(--color-ink-faint)] hover:text-[var(--color-ink-dim)]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>

              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
                {tab === 'desk' && (
                  <DeskPnLTab
                    companyId={props.companyId}
                    companyName={props.companyName}
                    seedCreditsCents={props.seedCreditsCents}
                    createdAt={props.createdAt}
                    active={open && tab === 'desk'}
                  />
                )}

                {tab === 'mandate' && (
                  <div className="space-y-8">
                    <PhilosophyTab
                      companyId={props.companyId}
                      philosophy={props.philosophy}
                      philosophyProfile={props.philosophyProfile}
                      active={open && tab === 'mandate'}
                    />
                    <div className="border-t border-[var(--color-line)] pt-6">
                      <h3 className="mb-3 text-sm font-medium text-[var(--color-ink)]">
                        Sector focuses & excludes
                      </h3>
                      <CompanySectorsTab
                        companyId={props.companyId}
                        initialFocuses={props.sectorFocuses ?? []}
                        initialExcludes={props.universeExcludes ?? []}
                      />
                    </div>
                  </div>
                )}

                {tab === 'operating' && (
                  <OperatingTab
                    companyId={props.companyId}
                    budgets={llmBudgets}
                    active={open && tab === 'operating'}
                  />
                )}

                {tab === 'settings' && (
                  <SettingsTab companyId={props.companyId} name={props.companyName} />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function DeskPnLTab(props: {
  companyId: string;
  companyName: string;
  seedCreditsCents: string;
  createdAt: string;
  active: boolean;
}) {
  const cachedDesk = peekDrawerSlice<DeskSlice>(props.companyId, 'desk');
  const cachedHub = peekMarketHub({ companyId: props.companyId });
  const [desk, setDesk] = useState<DeskSlice | null>(cachedDesk);
  const [hub, setHub] = useState<MarketHubResponse | null>(cachedHub);
  const [loading, setLoading] = useState(!cachedDesk);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  useEffect(() => {
    if (!props.active) return;
    let cancelled = false;
    const hasWarm = Boolean(peekDrawerSlice(props.companyId, 'desk'));
    setLoading(!hasWarm);

    const applyDesk = (d: DeskSlice) => {
      if (!cancelled) setDesk(d);
    };

    void (async () => {
      try {
        const result = await loadDrawerSlice(
          props.companyId,
          'desk',
          async () => {
            const base = `/api/companies/${props.companyId}`;
            const prior = peekDrawerSlice<DeskSlice>(props.companyId, 'desk');
            // Positions and activity load independently so a slow ledger query
            // cannot block the positions table (or reverse).
            const [positionsSettled, activitySettled] = await Promise.allSettled([
              api<{ positions: PositionRow[] }>(`${base}/positions`, {
                signal: AbortSignal.timeout(12_000),
              }),
              api<{ balanceCents: string; ledger: LedgerRow[] }>(`${base}/activity?view=ledger`, {
                signal: AbortSignal.timeout(12_000),
              }),
            ]);
            const positions =
              positionsSettled.status === 'fulfilled'
                ? positionsSettled.value.positions
                : (prior?.positions ?? []);
            const balanceCents =
              activitySettled.status === 'fulfilled'
                ? activitySettled.value.balanceCents
                : (prior?.balanceCents ?? '0');
            const ledger =
              activitySettled.status === 'fulfilled'
                ? activitySettled.value.ledger
                : (prior?.ledger ?? []);
            return { balanceCents, ledger, positions } satisfies DeskSlice;
          },
          { onUpdate: applyDesk },
        );
        if (!cancelled) setDesk(result.data);
      } catch {
        // keep stale cache if present
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    void (async () => {
      try {
        const hubRes = await loadMarketHub(
          { companyId: props.companyId },
          () =>
            api<MarketHubResponse>(`/api/companies/${props.companyId}/market-hub`, {
              signal: AbortSignal.timeout(45_000),
            }),
          { onUpdate: (d) => { if (!cancelled) setHub(d); } },
        );
        if (!cancelled) setHub(hubRes.data);
      } catch {
        // keep stale hub if present
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.active, props.companyId]);

  const positions = desk?.positions ?? [];
  const ledger = desk?.ledger ?? [];
  const balance = desk?.balanceCents ?? null;
  const realized = positions.reduce((acc, p) => acc + BigInt(p.realizedPnlCents), 0n);
  const unrealized = positions.reduce((acc, p) => acc + BigInt(p.unrealizedPnlCents), 0n);
  const openPositions = positions.filter((p) => BigInt(p.qty) !== 0n);

  const selected = openPositions.find((p) => p.symbol === selectedSymbol) ?? openPositions[0] ?? null;
  const selectedQty = selected ? Number(selected.qty) : null;
  const selectedMark = selected ? Number(selected.markCents) : null;

  const equityLabel =
    hub?.equity.equityCents != null
      ? dollars(hub.equity.equityCents)
      : balance
        ? dollars(balance)
        : '—';

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">{props.companyName}</h2>
        <p className="text-[11px] text-[var(--color-ink-faint)]">
          Seed {dollars(props.seedCreditsCents)} · opened{' '}
          {new Date(props.createdAt).toLocaleDateString()} · {openPositions.length} open position
          {openPositions.length === 1 ? '' : 's'}
          {loading ? ' · refreshing…' : ''}
        </p>
      </header>

      <div className="flex flex-wrap gap-6">
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

      <MarketPostureEquityChart
        series={hub?.equity.series ?? []}
        selectedQty={Number.isFinite(selectedQty) ? selectedQty : null}
        selectedMarkCents={Number.isFinite(selectedMark) ? selectedMark : null}
        selectedSymbol={selected?.symbol ?? null}
        equityLabel={equityLabel}
        {...(hub?.equity.status ? { equityStatus: hub.equity.status } : {})}
        asOfIso={hub?.equity.asOfIso ?? null}
        {...(hub?.equity.version != null ? { version: hub.equity.version } : {})}
        heightPx={200}
      />

      {hub ? (
        <section className="grid gap-3 sm:grid-cols-2">
          <MarketPosturePieChart
            title="Allocation by symbol"
            slices={hub.charts.allocation}
            size={112}
            empty="No open position notionals"
          />
          <MarketPostureMetricBars
            title="Trend strength"
            slices={hub.charts.trendStrength}
            empty="No trend candidates"
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Positions
          </h3>
          {openPositions.length > 0 ? (
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-ink-faint)]">
              Chart focus
              <select
                value={selected?.symbol ?? ''}
                onChange={(e) => setSelectedSymbol(e.target.value || null)}
                className="rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink)] outline-none"
              >
                {openPositions.map((p) => (
                  <option key={p.id} value={p.symbol}>
                    {p.symbol}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <table className="w-full text-left text-xs">
          <thead className="text-[var(--color-ink-faint)]">
            <tr>
              <th className="pb-1.5 font-normal">Symbol</th>
              <th className="pb-1.5 font-normal">Qty</th>
              <th className="pb-1.5 font-normal">Avg</th>
              <th className="pb-1.5 font-normal">Mark</th>
              <th className="pb-1.5 font-normal">uPnL</th>
              <th className="pb-1.5 font-normal">rPnL</th>
            </tr>
          </thead>
          <tbody className="text-[var(--color-ink-dim)]">
            {positions.map((p) => {
              const u = BigInt(p.unrealizedPnlCents);
              return (
                <tr key={p.id} className="border-t border-[var(--color-line)]">
                  <td className="py-1.5 pr-2 font-mono text-[var(--color-ink)]">{p.symbol}</td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums">{p.qty}</td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums">{dollars(p.avgCostCents)}</td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums">{dollars(p.markCents)}</td>
                  <td
                    className={`py-1.5 pr-2 font-mono tabular-nums ${
                      u >= 0n ? 'text-[var(--color-ok)]' : 'text-[var(--color-block)]'
                    }`}
                  >
                    {dollars(p.unrealizedPnlCents)}
                  </td>
                  <td className="py-1.5 font-mono tabular-nums">{dollars(p.realizedPnlCents)}</td>
                </tr>
              );
            })}
            {positions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-[var(--color-ink-faint)]">
                  No positions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Ledger
        </h3>
        <table className="w-full text-left text-xs">
          <thead className="text-[var(--color-ink-faint)]">
            <tr>
              <th className="pb-1.5 font-normal">Entry</th>
              <th className="pb-1.5 font-normal">Kind</th>
              <th className="pb-1.5 font-normal">Amount</th>
              <th className="pb-1.5 font-normal">Balance after</th>
              <th className="pb-1.5 font-normal">Time</th>
            </tr>
          </thead>
          <tbody className="text-[var(--color-ink-dim)]">
            {ledger.map((l) => (
              <tr key={l.id} className="border-t border-[var(--color-line)]">
                <td className="max-w-48 truncate py-1.5 pr-2">{l.description}</td>
                <td className="py-1.5 pr-2 font-mono text-[10px] uppercase text-[var(--color-ink-faint)]">
                  {l.kind}
                </td>
                <td className="py-1.5 pr-2 font-mono tabular-nums">{dollars(l.amountCents)}</td>
                <td className="py-1.5 pr-2 font-mono tabular-nums">
                  {dollars(l.balanceAfterCents)}
                </td>
                <td className="py-1.5 text-[var(--color-ink-faint)]">
                  {new Date(l.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {ledger.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-[var(--color-ink-faint)]">
                  No ledger entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

interface LlmPolicyResponse {
  policy: CompanyLlmPolicy;
  brokerConnectionId: string | null;
  userAnthropicZdrAttested: boolean;
}

interface LlmCallRow {
  id: string;
  provider: string;
  model: string;
  tier: string;
  tokens: { in: number; out: number };
  costCents: number;
  latencyMs: number;
  schemaValid: boolean;
  leakLintPassed: boolean;
  failure: string | null;
  requestId: string | null;
  retentionClass: string | null;
  createdAt: string;
}

const TIER_LABELS: Record<(typeof LlmTier.options)[number], string> = {
  strategic: 'Strategic',
  tactical: 'Tactical',
  execution: 'Execution',
  assistant: 'Assistant',
};

const PROFILE_OPTIONS = [
  { id: 'privacy_cost', label: 'Privacy / cost' },
  { id: 'strict_compile', label: 'Strict compile' },
  { id: 'premium_quality', label: 'Premium quality' },
  { id: 'custom', label: 'Custom' },
] as const;

function retentionLabel(rc: RetentionClass): string {
  return rc.replace(/_/g, ' ');
}

function modelMetaLabel(model: ModelCapability): string {
  const inPerM = (model.inputCostCentsPerMTok / 100).toFixed(2);
  const outPerM = (model.outputCostCentsPerMTok / 100).toFixed(2);
  return `~$${inPerM}/$${outPerM} per 1M tok · ${retentionLabel(model.retentionClass)}`;
}

function truncateRequestId(id: string | null): string {
  if (!id) return '—';
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-3)}`;
}

type OperatingSlice = {
  policy: LlmPolicyResponse;
  calls: LlmCallRow[];
  evidence: {
    sampleSize: number;
    schemaPassRate: number | null;
    leakPassRate: number | null;
    allLeakClean: boolean;
    allSchemaValid: boolean;
  } | null;
  leakAudit: {
    ok: boolean;
    sampleSize: number;
    leakCleanCount: number;
    leakFailCount: number;
    scanMode: string;
    note?: string;
  };
  brokers: BrokerConnectionSummary[];
  brokerStatus: CompanyBrokerStatus;
};

function OperatingTab(props: {
  companyId: string;
  budgets: LlmBudgetSummary[];
  active: boolean;
}) {
  const cached = peekDrawerSlice<OperatingSlice>(props.companyId, 'operating');
  const [policyData, setPolicyData] = useState<LlmPolicyResponse | null>(cached?.policy ?? null);
  const [calls, setCalls] = useState<LlmCallRow[]>(cached?.calls ?? []);
  const [llmEvidence, setLlmEvidence] = useState<{
    sampleSize: number;
    schemaPassRate: number | null;
    leakPassRate: number | null;
    allLeakClean: boolean;
    allSchemaValid: boolean;
  } | null>(cached?.evidence ?? null);
  const [leakAudit, setLeakAudit] = useState<{
    ok: boolean;
    sampleSize: number;
    leakCleanCount: number;
    leakFailCount: number;
    scanMode: string;
    note?: string;
  } | null>(cached?.leakAudit ?? null);
  const [brokers, setBrokers] = useState<BrokerConnectionSummary[]>(cached?.brokers ?? []);
  const [brokerStatus, setBrokerStatus] = useState<CompanyBrokerStatus | null>(
    cached?.brokerStatus ?? null,
  );
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [brokerMessage, setBrokerMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyOperating = useCallback((slice: OperatingSlice) => {
    setPolicyData(slice.policy);
    setCalls(slice.calls);
    setLlmEvidence(slice.evidence);
    setLeakAudit(slice.leakAudit);
    setBrokers(slice.brokers);
    setBrokerStatus(slice.brokerStatus);
  }, []);

  const loadExtras = useCallback(
    async (opts?: { force?: boolean }) => {
      const base = `/api/companies/${props.companyId}`;
      try {
        const result = await loadDrawerSlice(
          props.companyId,
          'operating',
          async () => {
            const [policyRes, callsRes, auditRes, brokersRes, brokerRes] = await Promise.all([
              api<LlmPolicyResponse>(`${base}/llm-policy`),
              api<{
                calls: LlmCallRow[];
                evidence?: OperatingSlice['evidence'];
              }>(`${base}/llm-calls?limit=20`),
              api<{
                ok: boolean;
                sampleSize: number;
                leakCleanCount: number;
                leakFailCount: number;
                schemaValidCount: number;
                scanMode: string;
                note?: string;
              }>(`${base}/llm-calls/audit?limit=50`),
              api<{ connections: BrokerConnectionSummary[] }>('/api/settings/brokers'),
              api<CompanyBrokerStatus>(`${base}/broker`),
            ]);
            return {
              policy: policyRes,
              calls: callsRes.calls,
              evidence: callsRes.evidence ?? null,
              leakAudit: auditRes,
              brokers: brokersRes.connections,
              brokerStatus: brokerRes,
            } satisfies OperatingSlice;
          },
          {
            ...(opts?.force ? { force: true as const } : {}),
            onUpdate: applyOperating,
          },
        );
        applyOperating(result.data);
      } catch {
        // keep stale cache if present
      }
    },
    [props.companyId, applyOperating],
  );

  useEffect(() => {
    if (!props.active) return;
    void loadExtras();
  }, [props.active, loadExtras]);

  async function savePolicy(patch: Partial<CompanyLlmPolicy>) {
    if (!policyData) return;
    setBusy(true);
    try {
      const merged: CompanyLlmPolicy = {
        ...policyData.policy,
        ...patch,
        tierModels: { ...policyData.policy.tierModels, ...(patch.tierModels ?? {}) },
      };
      const res = await api<LlmPolicyResponse>(`/api/companies/${props.companyId}/llm-policy`, {
        method: 'PATCH',
        body: merged,
      });
      setPolicyData(res);
      invalidateDrawerSlice(props.companyId, 'operating');
      setPolicyMessage('LLM policy saved.');
    } catch {
      setPolicyMessage('Policy save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function bindBroker(connectionId: string | null) {
    setBusy(true);
    try {
      await api(`/api/companies/${props.companyId}/broker`, {
        method: 'PATCH',
        body: { brokerConnectionId: connectionId },
      });
      invalidateDrawerSlice(props.companyId, 'operating');
      await loadExtras({ force: true });
      setBrokerMessage(connectionId ? 'Broker bound.' : 'Broker unbound.');
    } catch {
      setBrokerMessage('Broker bind failed.');
    } finally {
      setBusy(false);
    }
  }

  const policy = policyData?.policy;
  const boundId = policyData?.brokerConnectionId ?? null;
  const boundConnection = brokers.find((b) => b.id === boundId) ?? null;
  const paperBrokers = brokers.filter((b) => b.mode === 'paper' && b.status !== 'revoked');

  return (
    <div className="space-y-6">
      {brokerStatus ? (
        <CapitalCapsSection status={brokerStatus} />
      ) : (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-medium text-[var(--color-ink)]">Trading capital caps</h3>
            <p className="text-[11px] text-[var(--color-ink-faint)]">Loading capital caps…</p>
          </div>
        </section>
      )}

      <OperatingBudgets budgets={props.budgets} calls={calls} />

      {policy && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--color-ink)]">LLM privacy & models</h3>
            <p className="text-[11px] text-[var(--color-ink-faint)]">
              Tier model picks must pass retention policy. Anthropic ZDR attestation is set in user
              settings.
            </p>
          </div>
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--color-ink-dim)]">Privacy mode</span>
              <select
                value={policy.privacyMode}
                disabled={busy}
                onChange={(e) =>
                  void savePolicy({
                    privacyMode: e.target.value as CompanyLlmPolicy['privacyMode'],
                  })
                }
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
              >
                <option value="strict_zdr">Strict ZDR</option>
                <option value="standard">Standard</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--color-ink-dim)]">Profile</span>
              <select
                value={policy.profileId}
                disabled={busy}
                onChange={(e) =>
                  void savePolicy({
                    profileId: e.target.value as CompanyLlmPolicy['profileId'],
                  })
                }
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
              >
                {PROFILE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[10px] text-[var(--color-ink-faint)]">
            User Anthropic ZDR attested:{' '}
            <span className="text-[var(--color-ink-dim)]">
              {policyData.userAnthropicZdrAttested ? 'yes' : 'no'}
            </span>
            {' · '}
            Company policy flag:{' '}
            <span className="text-[var(--color-ink-dim)]">
              {policy.anthropicZdrAttested ? 'yes' : 'no'}
            </span>
          </p>
          <label className="flex items-center gap-2 text-[11px] text-[var(--color-ink-dim)]">
            <input
              type="checkbox"
              checked={policy.anthropicZdrAttested}
              disabled={busy}
              onChange={(e) => void savePolicy({ anthropicZdrAttested: e.target.checked })}
            />
            Company Anthropic ZDR attested (policy)
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {LlmTier.options.map((tier) => {
              const eligible = modelsForTier(tier).filter((m) => admitsRetention(m, policy));
              const current = policy.tierModels[tier] ?? '';
              const selected = eligible.find((m) => m.modelId === current) ?? null;
              return (
                <label key={tier} className="block space-y-1">
                  <span className="text-[11px] text-[var(--color-ink-dim)]">
                    {TIER_LABELS[tier]}
                  </span>
                  <select
                    value={current}
                    disabled={busy}
                    onChange={(e) => {
                      const modelId = e.target.value || null;
                      void savePolicy({
                        tierModels: { ...policy.tierModels, [tier]: modelId },
                      });
                    }}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                  >
                    <option value="">Default</option>
                    {eligible.map((m) => (
                      <option key={`${m.provider}:${m.modelId}`} value={m.modelId}>
                        {m.displayName} ({m.provider}) — {modelMetaLabel(m)}
                      </option>
                    ))}
                  </select>
                  {selected && (
                    <p className="text-[9px] text-[var(--color-ink-faint)]">
                      {modelMetaLabel(selected)}
                    </p>
                  )}
                </label>
              );
            })}
          </div>
          {policyMessage && (
            <p className="text-[10px] text-[var(--color-ink-faint)]">{policyMessage}</p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-[var(--color-ink)]">Broker connection</h3>
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            Bind one verified paper connection per company. Configure credentials in user settings.
          </p>
        </div>
        {boundConnection ? (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--color-ink)]">
                {boundConnection.venue} · {boundConnection.mode}
              </span>
              <span
                className={
                  boundConnection.status === 'connected'
                    ? 'text-[var(--color-ok)]'
                    : 'text-[var(--color-ink-faint)]'
                }
              >
                {boundConnection.status}
              </span>
            </div>
            {brokerStatus?.feedEntitlementLabel && (
              <p className="mt-1 text-[var(--color-ink-dim)]">
                Feed: {brokerStatus.feedEntitlementLabel}
              </p>
            )}
            {boundConnection.capabilities && (
              <p className="mt-1 text-[var(--color-ink-dim)]">
                Assets: {boundConnection.capabilities.assets.join(', ')} · Order types:{' '}
                {boundConnection.capabilities.orderTypes.join(', ')} · Paper:{' '}
                {boundConnection.capabilities.supportsPaper ? 'yes' : 'no'}
              </p>
            )}
            <button
              onClick={() => void bindBroker(null)}
              disabled={busy}
              className="mt-2 text-[10px] text-[var(--color-block)] hover:underline disabled:opacity-50"
            >
              Unbind
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-[var(--color-ink-faint)]">No broker bound — paper sim.</p>
        )}
        {paperBrokers.length > 0 && (
          <label className="block max-w-sm space-y-1">
            <span className="text-[11px] text-[var(--color-ink-dim)]">Bind connection</span>
            <select
              value={boundId ?? ''}
              disabled={busy}
              onChange={(e) => void bindBroker(e.target.value || null)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Paper sim (none)</option>
              {paperBrokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.venue} · {b.status} ····{b.keyHint}
                </option>
              ))}
            </select>
          </label>
        )}
        {brokerMessage && (
          <p className="text-[10px] text-[var(--color-ink-faint)]">{brokerMessage}</p>
        )}
      </section>

      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-medium text-[var(--color-ink)]">Recent LLM calls</h3>
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            Metadata only — prompts and outputs are never returned.
          </p>
          {llmEvidence && llmEvidence.sampleSize > 0 && (
            <p
              className="mt-1 text-[10px] text-[var(--color-ink-dim)]"
              data-testid="llm-ledger-evidence"
              aria-label="LLM ledger soak evidence"
            >
              Window {llmEvidence.sampleSize}: schema{' '}
              {llmEvidence.schemaPassRate === null
                ? '—'
                : `${Math.round(llmEvidence.schemaPassRate * 100)}%`}
              {' · '}
              leak{' '}
              {llmEvidence.leakPassRate === null
                ? '—'
                : `${Math.round(llmEvidence.leakPassRate * 100)}%`}
              {llmEvidence.allLeakClean ? ' · all leak-clean' : ''}
              {llmEvidence.allSchemaValid ? ' · all schema-valid' : ''}
            </p>
          )}
          {leakAudit && (
            <p
              className={`mt-1 text-[10px] ${
                leakAudit.sampleSize === 0
                  ? 'text-[var(--color-ink-faint)]'
                  : leakAudit.ok
                    ? 'text-[var(--color-ok)]'
                    : 'text-[var(--color-block)]'
              }`}
              data-testid="llm-leak-audit"
              aria-label="LLM leak audit aggregate"
              title={leakAudit.note}
            >
              leak audit:{' '}
              {leakAudit.sampleSize === 0
                ? 'no samples'
                : leakAudit.ok
                  ? `clean · ${leakAudit.sampleSize}`
                  : `FAIL · ${leakAudit.sampleSize}`}
              {leakAudit.sampleSize > 0 && leakAudit.scanMode !== 'artifacts'
                ? ` · ${leakAudit.scanMode}`
                : ''}
            </p>
          )}
        </div>
        <table className="w-full text-left text-[10px]">
          <thead className="text-[var(--color-ink-faint)]">
            <tr>
              <th className="pb-1 font-normal">Time</th>
              <th className="pb-1 font-normal">Tier</th>
              <th className="pb-1 font-normal">Model</th>
              <th className="pb-1 font-normal">Cost</th>
              <th className="pb-1 font-normal">Req</th>
              <th className="pb-1 font-normal">Retention</th>
              <th className="pb-1 font-normal">Checks</th>
            </tr>
          </thead>
          <tbody className="text-[var(--color-ink-dim)]">
            {calls.map((c) => (
              <tr key={c.id} className="border-t border-[var(--color-line)]">
                <td className="py-1 pr-2">{new Date(c.createdAt).toLocaleString()}</td>
                <td className="py-1 pr-2">{c.tier}</td>
                <td className="max-w-32 truncate py-1 pr-2" title={c.model}>
                  {c.provider}/{c.model}
                </td>
                <td className="py-1 pr-2 font-mono">{dollars(c.costCents)}</td>
                <td
                  className="max-w-16 truncate py-1 pr-2 font-mono text-[var(--color-ink-faint)]"
                  title={c.requestId ?? undefined}
                >
                  {truncateRequestId(c.requestId)}
                </td>
                <td className="py-1 pr-2 text-[var(--color-ink-faint)]">
                  {c.retentionClass ? retentionLabel(c.retentionClass as RetentionClass) : '—'}
                </td>
                <td className="py-1">
                  <ValidationChips
                    schemaValid={c.schemaValid}
                    leakLintPassed={c.leakLintPassed}
                    failure={c.failure}
                  />
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr>
                <td colSpan={7} className="py-2 text-[var(--color-ink-faint)]">
                  No LLM calls recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ValidationChips(props: {
  schemaValid: boolean;
  leakLintPassed: boolean;
  failure: string | null;
}) {
  if (props.failure) {
    return <span className="text-[var(--color-block)]">{props.failure}</span>;
  }
  return (
    <span className="flex gap-1">
      <span className={props.schemaValid ? 'text-[var(--color-ok)]' : 'text-[var(--color-block)]'}>
        schema:{props.schemaValid ? 'ok' : 'fail'}
      </span>
      <span
        className={props.leakLintPassed ? 'text-[var(--color-ok)]' : 'text-[var(--color-block)]'}
      >
        leak:{props.leakLintPassed ? 'ok' : 'fail'}
      </span>
    </span>
  );
}

function CapitalCapsSection(props: { status: CompanyBrokerStatus }) {
  const virtual = dollars(props.status.virtualBalanceCents);
  const effective = dollars(props.status.effectiveCapCents);
  const brokerBp = props.status.brokerSnapshot
    ? dollars(props.status.brokerSnapshot.buyingPowerCents)
    : null;

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-ink)]">Trading capital caps</h3>
        <p className="text-[11px] text-[var(--color-ink-faint)]">
          Effective admission uses min(virtual allocation, broker buying power) when a broker is
          bound; otherwise paper sim uses virtual balance only.
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        <Metric label="Virtual cap" value={virtual} />
        {props.status.bound && brokerBp !== null ? (
          <>
            <Metric label="Broker buying power" value={brokerBp} />
            <Metric label="Effective cap" value={effective} />
          </>
        ) : (
          <Metric label="Mode" value="paper sim" />
        )}
      </div>
      <p className="text-[10px] text-[var(--color-ink-faint)]">
        Venue: {props.status.venue}
        {props.status.feedEntitlementLabel ? ` · Feed: ${props.status.feedEntitlementLabel}` : ''}
        {props.status.liveGateBlocked ? ' · Live gate blocked' : ''}
      </p>
    </section>
  );
}

function OperatingBudgets(props: { budgets: LlmBudgetSummary[]; calls: LlmCallRow[] }) {
  const lastFailureByProvider = new Map<string, string>();
  for (const call of props.calls) {
    if (call.failure && !lastFailureByProvider.has(call.provider)) {
      lastFailureByProvider.set(call.provider, call.failure);
    }
  }

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
      <ProviderHealthStrip budgets={props.budgets} lastFailureByProvider={lastFailureByProvider} />
    </div>
  );
}

function ProviderHealthStrip(props: {
  budgets: LlmBudgetSummary[];
  lastFailureByProvider: Map<string, string>;
}) {
  const connection = useOptionalLlmConnectionStatus();
  const rows =
    props.budgets.length > 0
      ? props.budgets
      : (connection?.providers.map((p) => ({
          provider: p.provider,
          credentialSource:
            p.status === 'configured' ? ('user_key' as const) : ('unconfigured' as const),
          maxCalls: null,
          consumedCalls: 0,
          maxCostCents: null,
          consumedCostCents: 0,
          windowMinutes: null,
          windowStartedAt: null,
        })) ?? []);

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3">
      <h4 className="text-[11px] font-medium text-[var(--color-ink)]">Provider health</h4>
      <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
        From shell LLM connection status (not re-fetched per panel).
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="LLM provider health">
        {rows.map((budget) => {
          const configured = budget.credentialSource === 'user_key';
          const lastFailure = props.lastFailureByProvider.get(budget.provider);
          return (
            <li key={budget.provider}>
              <span
                className={`status-chip text-[10px] uppercase tracking-wider ${
                  configured ? 'text-[var(--color-ok)]' : 'text-[var(--color-ink-faint)]'
                }`}
                title={
                  lastFailure
                    ? `${budget.provider}: last failure ${lastFailure}`
                    : configured
                      ? `${budget.provider}: credential configured`
                      : `${budget.provider}: unconfigured`
                }
              >
                {budget.provider}:{configured ? 'ok' : 'off'}
                {lastFailure ? '!' : ''}
              </span>
            </li>
          );
        })}
      </ul>
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
  active: boolean;
}) {
  const [text, setText] = useState(props.philosophy);
  const [profile, setProfile] = useState<PhilosophyProfile>(() =>
    normalizePhilosophyProfile(props.philosophyProfile ?? DEFAULT_PHILOSOPHY_PROFILE),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [directiveBody, setDirectiveBody] = useState('');
  type DirectiveRow = { id: string; body: string; createdAt: string };
  const cachedDirectives = peekDrawerSlice<DirectiveRow[]>(
    props.companyId,
    'philosophy_directives',
  );
  const [directives, setDirectives] = useState<DirectiveRow[]>(cachedDirectives ?? []);
  const [directiveMessage, setDirectiveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!props.active) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadDrawerSlice(
          props.companyId,
          'philosophy_directives',
          async () => {
            const data = await api<{ directives: DirectiveRow[] }>(
              `/api/companies/${props.companyId}/philosophy-directives`,
            );
            return data.directives;
          },
          {
            onUpdate: (rows) => {
              if (!cancelled) setDirectives(rows);
            },
          },
        );
        if (!cancelled) setDirectives(result.data);
      } catch {
        // keep prior directives / empty initial
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.active, props.companyId]);

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

  async function appendDirective() {
    const trimmed = directiveBody.trim();
    if (!trimmed) return;
    setDirectiveMessage(null);
    try {
      const created = await api<{ id: string; body: string; createdAt: string }>(
        `/api/companies/${props.companyId}/philosophy-directives`,
        { method: 'POST', body: { body: trimmed } },
      );
      setDirectives((prev) => [created, ...prev]);
      invalidateDrawerSlice(props.companyId, 'philosophy_directives');
      setDirectiveBody('');
      setDirectiveMessage('Directive appended — immutable; agents cannot edit or remove it.');
    } catch {
      setDirectiveMessage('Could not append directive.');
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

      <section
        data-testid="operator-philosophy-directives"
        className="space-y-2 border-t border-[var(--color-line)] pt-4"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Operator directives (immutable)
        </h3>
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          Append-only constraints folded into research context. Agents cannot edit or delete these
          rows.
        </p>
        <textarea
          value={directiveBody}
          onChange={(e) => setDirectiveBody(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Add a standing directive…"
          aria-label="New operator philosophy directive"
          className="w-full resize-none rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="button"
          onClick={() => void appendDirective()}
          disabled={!directiveBody.trim()}
          className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          Append directive
        </button>
        {directiveMessage && (
          <p className="text-xs text-[var(--color-ink-dim)]">{directiveMessage}</p>
        )}
        {directives.length > 0 && (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {directives.map((d) => (
              <li
                key={d.id}
                className="rounded border border-[var(--color-line)] px-2 py-1.5 text-[11px] text-[var(--color-ink)]"
              >
                <p>{d.body}</p>
                <p className="mt-0.5 text-[9px] text-[var(--color-ink-faint)]">
                  {new Date(d.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
