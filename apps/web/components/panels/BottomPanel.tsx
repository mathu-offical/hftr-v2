'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, RequestError } from '@/lib/client';
import { ACTIVITY_REFRESH_EVENT } from '../canvas/PaperTradeForm';
import { dollars, GATE_KEYS, gateLabel, gateTone, toneFor } from './format';
import { Justification } from './Justification';
import { TraceTimeline } from './TraceTimeline';

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

interface GateRow {
  gate: string;
  result: 'pass' | 'fail' | 'suppressed';
  evidence: string;
}

interface LeadRow {
  id: string;
  moduleId: string;
  targetModuleId: string | null;
  trendId: string;
  symbol: string;
  direction: 'up' | 'down' | 'flat';
  strategyFamily: string;
  status: 'pending' | 'admitted' | 'rejected' | 'decomposed' | 'expired';
  gates: GateRow[];
  createdAt: string;
}

interface TreeRow {
  id: string;
  leadId: string;
  moduleId: string;
  symbol: string;
  status: 'draft' | 'compile_ready' | 'compile_blocked' | 'dispatched' | 'invalidated';
  branches: unknown[];
  recoveryLadder: unknown;
  sourceClass: string;
  createdAt: string;
}

/**
 * Bottom panel (ui-ux spec): tabbed views over trends (with candidate
 * promotion), the scenario engine (lead → gate strip → tree decomposition),
 * watch lists, and decision traces with per-row trace timelines — each
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
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [trees, setTrees] = useState<TreeRow[]>([]);
  const [openTraceId, setOpenTraceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const base = `/api/companies/${props.companyId}`;
    const results = await Promise.allSettled([
      api<{ trends: TrendRow[] }>(`${base}/trends`),
      api<{ executions: ExecutionRow[] }>(`${base}/executions`),
      api<{ verifications: VerificationRow[] }>(`${base}/verifications`),
      api<{ items: WatchlistRow[] }>(`${base}/watchlists`),
      api<{ leads: LeadRow[] }>(`${base}/leads`),
      api<{ trees: TreeRow[] }>(`${base}/trees`),
    ]);
    if (results[0].status === 'fulfilled') setTrends(results[0].value.trends);
    if (results[1].status === 'fulfilled') setExecutions(results[1].value.executions);
    if (results[2].status === 'fulfilled') setVerifications(results[2].value.verifications);
    if (results[3].status === 'fulfilled') setWatchlists(results[3].value.items);
    if (results[4].status === 'fulfilled') setLeads(results[4].value.leads);
    if (results[5].status === 'fulfilled') setTrees(results[5].value.trees);
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
        aria-label="Expand bottom panel"
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
          <TrendsView
            companyId={props.companyId}
            trends={byModule(trends)}
            modules={props.modules}
            moduleName={moduleName}
            onRefetch={load}
          />
        )}

        {tab === 'scenarios' && (
          <ScenarioView
            leads={byModule(leads)}
            trees={trees}
            executions={executions}
            moduleName={moduleName}
          />
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
              const openTrace = () => setOpenTraceId(e.id);
              const outcomeLines = [
                `Execution outcome: ${e.outcome}.`,
                e.failureCode
                  ? `Failure code: ${e.failureCode}.`
                  : e.description ?? `${e.venue} · ${e.mode} mode.`,
                v
                  ? `Verification: ${v.result}${v.failureCode ? ` (${v.failureCode})` : ''}.`
                  : 'No verification record linked to this trace yet.',
              ];
              return [
                <Justification
                  key="o"
                  sourceClass="deterministic_placeholder"
                  lines={outcomeLines}
                >
                  <button
                    onClick={openTrace}
                    aria-label={`Open decision trace for execution ${e.id}`}
                    className="capitalize underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
                    style={{ color: toneFor(e.outcome) }}
                  >
                    {e.outcome}
                  </button>
                </Justification>,
                <button
                  key="d"
                  onClick={openTrace}
                  aria-label={`Open decision trace for execution ${e.id}`}
                  className="block max-w-72 truncate text-left hover:text-[var(--color-ink)]"
                >
                  {e.description ?? e.failureCode ?? `${e.venue} · ${e.mode}`}
                </button>,
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

      {openTraceId && (
        <TraceTimeline
          companyId={props.companyId}
          traceId={openTraceId}
          onClose={() => setOpenTraceId(null)}
        />
      )}
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

/** Trends table with per-row promotion of candidate trends into leads. */
function TrendsView(props: {
  companyId: string;
  trends: TrendRow[];
  modules: ModuleOption[];
  moduleName: (id: string) => string;
  onRefetch: () => Promise<void>;
}) {
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<Record<string, string>>({});
  const trendModules = props.modules.filter((m) => m.type === 'trend');

  async function promote(trend: TrendRow) {
    setPromotingId(trend.id);
    try {
      await api(`/api/companies/${props.companyId}/modules/${trend.moduleId}/promote`, {
        method: 'POST',
        body: { trendId: trend.id },
      });
      setPromoted((prev) => ({ ...prev, [trend.id]: 'promoted' }));
      window.dispatchEvent(new Event(ACTIVITY_REFRESH_EVENT));
      await props.onRefetch();
    } catch (err) {
      setPromoted((prev) => ({
        ...prev,
        [trend.id]:
          err instanceof RequestError && err.status === 404
            ? 'promotion unavailable'
            : 'promotion failed',
      }));
    } finally {
      setPromotingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <AddCandidateForm
        companyId={props.companyId}
        trendModules={trendModules}
        onCreated={props.onRefetch}
      />
      <Table
        head={['Symbol', 'Direction', 'Strength', 'Source', 'Module', 'Scanned', 'Action']}
        rows={props.trends.map((t) => [
          <span key="s" className="font-mono">
            {t.symbol}
          </span>,
          <Justification
            key="d"
            sourceClass={t.sourceClass}
            lines={[
              `Direction "${t.direction}" and strength "${t.strengthBand}" derive from quote drift over the scan lookback window.`,
              `Scanned ${new Date(t.scannedAt).toLocaleString()} by ${props.moduleName(t.moduleId)}.`,
              'The drift value is recorded as an auditable ValueRef (right panel → Values).',
            ]}
          >
            <span className="capitalize" style={{ color: toneFor(t.direction) }}>
              {t.direction}
            </span>
          </Justification>,
          t.strengthBand,
          t.sourceClass === 'deterministic_scan' ? 'scan' : 'model',
          props.moduleName(t.moduleId),
          new Date(t.scannedAt).toLocaleTimeString(),
          promoted[t.id] ? (
            <span
              key="p"
              style={{
                color: promoted[t.id] === 'promoted' ? 'var(--color-ok)' : 'var(--color-warn)',
              }}
            >
              {promoted[t.id]}
            </span>
          ) : t.status === 'candidate' ? (
            <button
              key="p"
              onClick={() => promote(t)}
              disabled={promotingId !== null}
              aria-label={`Promote trend ${t.symbol} to a lead`}
              className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
            >
              {promotingId === t.id ? 'Promoting…' : 'Promote'}
            </button>
          ) : (
            <span key="p" className="text-[var(--color-ink-faint)]">
              {t.status}
            </span>
          ),
        ])}
        empty="No trend candidates. Run a scan from a trend module, or add one above."
      />
    </div>
  );
}

function AddCandidateForm(props: {
  companyId: string;
  trendModules: ModuleOption[];
  onCreated: () => Promise<void>;
}) {
  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState<'up' | 'down' | 'flat'>('up');
  const [strengthBand, setStrengthBand] = useState<'weak' | 'moderate' | 'strong'>('moderate');
  const [moduleId, setModuleId] = useState(props.trendModules[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleId && props.trendModules[0]) setModuleId(props.trendModules[0].id);
  }, [props.trendModules, moduleId]);

  if (props.trendModules.length === 0) {
    return (
      <div
        className="rounded-lg border border-[var(--color-line)] p-2.5 opacity-60"
        aria-label="Add trend candidate (disabled — no trend module)"
      >
        <p className="text-[11px] text-[var(--color-ink-faint)]">
          Manual trend entry requires a trend module — add one on the canvas or use Scan from a
          trend module inspector.
        </p>
      </div>
    );
  }

  async function create() {
    const sym = symbol.trim().toUpperCase();
    if (!sym || !moduleId) {
      setMessage('Symbol and trend module are required.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/trends`, {
        method: 'POST',
        body: { moduleId, symbol: sym, direction, strengthBand },
      });
      setSymbol('');
      setMessage(`${sym} added.`);
      window.dispatchEvent(new Event(ACTIVITY_REFRESH_EVENT));
      await props.onCreated();
    } catch (err) {
      setMessage(
        err instanceof RequestError
          ? `Add failed (${err.status}).`
          : 'Could not add candidate.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-line)] p-2.5"
      aria-label="Add trend candidate"
    >
      <label className="space-y-0.5">
        <span className="block text-[10px] text-[var(--color-ink-faint)]">Symbol</span>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          maxLength={12}
          aria-label="Candidate symbol"
          className="w-24 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-xs uppercase outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      <label className="space-y-0.5">
        <span className="block text-[10px] text-[var(--color-ink-faint)]">Direction</span>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as typeof direction)}
          aria-label="Candidate direction"
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-xs outline-none"
        >
          <option value="up">up</option>
          <option value="down">down</option>
          <option value="flat">flat</option>
        </select>
      </label>
      <label className="space-y-0.5">
        <span className="block text-[10px] text-[var(--color-ink-faint)]">Strength</span>
        <select
          value={strengthBand}
          onChange={(e) => setStrengthBand(e.target.value as typeof strengthBand)}
          aria-label="Candidate strength"
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-xs outline-none"
        >
          <option value="weak">weak</option>
          <option value="moderate">moderate</option>
          <option value="strong">strong</option>
        </select>
      </label>
      <label className="space-y-0.5">
        <span className="block text-[10px] text-[var(--color-ink-faint)]">Trend module</span>
        <select
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          aria-label="Owning trend module"
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-xs outline-none"
        >
          {props.trendModules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy || !symbol.trim()}
        aria-label="Add trend candidate"
        className="rounded-md border border-[var(--color-accent)] px-2.5 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add candidate'}
      </button>
      {message && <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>}
    </form>
  );
}

const LEAD_STATUS_TONE: Record<LeadRow['status'], string> = {
  pending: 'var(--color-ink-dim)',
  admitted: 'var(--color-ok)',
  rejected: 'var(--color-block)',
  decomposed: 'var(--color-accent)',
  expired: 'var(--color-ink-faint)',
};

const TREE_STATUS_TONE: Record<TreeRow['status'], string> = {
  draft: 'var(--color-ink-dim)',
  compile_ready: 'var(--color-ok)',
  compile_blocked: 'var(--color-block)',
  dispatched: 'var(--color-accent)',
  invalidated: 'var(--color-ink-faint)',
};

/**
 * Scenario engine: lead-driven decomposition. Each lead shows its six-gate
 * admission strip, the decision tree it produced (matched by leadId), and
 * related executions (description symbol match as fallback linkage).
 */
function ScenarioView(props: {
  leads: LeadRow[];
  trees: TreeRow[];
  executions: ExecutionRow[];
  moduleName: (id: string) => string;
}) {
  const [expandedGate, setExpandedGate] = useState<string | null>(null);

  if (props.leads.length === 0) {
    return (
      <p className="py-3 text-xs text-[var(--color-ink-faint)]">
        No scenarios yet — promote a candidate trend from the Trends tab to create a lead; admitted
        leads decompose into decision trees here.
      </p>
    );
  }

  const sorted = [...props.leads].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <ul className="space-y-2.5">
      {sorted.map((lead) => {
        const tree = props.trees.find((t) => t.leadId === lead.id);
        const related = props.executions.filter((e) => (e.description ?? '').includes(lead.symbol));
        // Order the delivered gates by the canonical six-gate layout.
        const orderedGates = GATE_KEYS.map(
          (key) => lead.gates.find((g) => gateLabel(g.gate) === key) ?? null,
        );
        return (
          <li key={lead.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-medium">{lead.symbol}</span>
              <span className="capitalize" style={{ color: toneFor(lead.direction) }}>
                {lead.direction}
              </span>
              <span className="text-[var(--color-ink-dim)]">{lead.strategyFamily}</span>
              <Justification
                sourceClass="deterministic_placeholder"
                lines={[
                  `Admission status "${lead.status}" is the outcome of the six-gate contract: ${
                    lead.gates.filter((g) => g.result === 'pass').length
                  } of ${lead.gates.length} gates passed.`,
                  'Each gate cell below carries its own evidence text — click a cell to expand it.',
                ]}
              >
                <span
                  className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[10px]"
                  style={{ color: LEAD_STATUS_TONE[lead.status] }}
                >
                  {lead.status}
                </span>
              </Justification>
              <span className="ml-auto text-[10px] text-[var(--color-ink-faint)]">
                {props.moduleName(lead.moduleId)} · {new Date(lead.createdAt).toLocaleTimeString()}
              </span>
            </div>

            <div className="mt-1.5 grid grid-cols-6 gap-1">
              {orderedGates.map((gate, i) => {
                const key = GATE_KEYS[i];
                const cellId = `${lead.id}:${key}`;
                if (!gate) {
                  return (
                    <div
                      key={key}
                      className="rounded border border-[var(--color-line)] px-1 py-0.5 text-center text-[9px] text-[var(--color-ink-faint)]"
                      title={`${key} gate not evaluated`}
                    >
                      {key}
                      <div>—</div>
                    </div>
                  );
                }
                return (
                  <button
                    key={key}
                    onClick={() => setExpandedGate(expandedGate === cellId ? null : cellId)}
                    title={gate.evidence}
                    aria-label={`Gate ${key}: ${gate.result}. Toggle evidence detail`}
                    aria-expanded={expandedGate === cellId}
                    className="rounded border border-[var(--color-line)] px-1 py-0.5 text-center text-[9px] hover:bg-[var(--color-surface-2)]"
                    style={{ color: gateTone(gate.result) }}
                  >
                    {key}
                    <div>{gate.result}</div>
                  </button>
                );
              })}
            </div>
            {expandedGate?.startsWith(`${lead.id}:`) &&
              (() => {
                const key = expandedGate.split(':')[1];
                const gate = lead.gates.find((g) => gateLabel(g.gate) === key);
                return gate ? (
                  <p className="mt-1 rounded bg-[var(--color-surface-0)] px-2 py-1 text-[10px] text-[var(--color-ink-dim)]">
                    <span style={{ color: gateTone(gate.result) }}>
                      {gate.gate} — {gate.result}:
                    </span>{' '}
                    {gate.evidence || 'no evidence recorded'}
                  </p>
                ) : null;
              })()}

            <div className="mt-1.5 text-[11px] text-[var(--color-ink-dim)]">
              {tree ? (
                <>
                  tree{' '}
                  <span style={{ color: TREE_STATUS_TONE[tree.status] }}>
                    {tree.status.replace(/_/g, ' ')}
                  </span>{' '}
                  · {tree.branches.length} {tree.branches.length === 1 ? 'branch' : 'branches'}
                </>
              ) : (
                <span className="text-[var(--color-ink-faint)]">no decision tree yet</span>
              )}
            </div>

            {related.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--color-ink-dim)]">
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
                No executions against this lead yet.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
