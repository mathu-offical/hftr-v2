'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, RequestError } from '@/lib/client';
import {
  executionCapitalChip,
  fundTransfersHeadline,
  normalizeCapitalMode,
  type CapitalMode,
} from '@/lib/capital-mode-label';
import { simHonestyChips } from '@/lib/sim-honesty-label';
import { ACTIVITY_REFRESH_EVENT } from '../canvas/PaperTradeForm';
import { dollars, GATE_KEYS, gateLabel, gateTone, toneFor } from './format';
import { Justification } from './Justification';
import { TraceTimeline } from './TraceTimeline';
import { LlmAvailabilityChips } from '@/components/shell/LlmConnectionStatus';
import { PanelTabs } from './PanelTabs';
import {
  WatchlistTierFilterChips,
  watchlistMatchesTierFilter,
  type WatchlistTierFilter,
} from './WatchlistTierFilters';
import { invalidateMarketHub } from '@/lib/market-hub-cache';
import { InlineLoadingStrip } from '@/components/shell/LoadingChrome';

type Tab =
  | 'trends'
  | 'scenarios'
  | 'watchlists'
  | 'policies'
  | 'decisions'
  | 'lineage'
  | 'approvals'
  | 'dead';
const TABS: { id: Tab; label: string; rail: string }[] = [
  { id: 'trends', label: 'Trends', rail: 'Trends' },
  { id: 'scenarios', label: 'Scenario engine', rail: 'Scenarios' },
  { id: 'watchlists', label: 'Watch lists', rail: 'Watch' },
  { id: 'policies', label: 'Policies', rail: 'Policies' },
  { id: 'decisions', label: 'Decisions + traces', rail: 'Decisions' },
  { id: 'lineage', label: 'Lineage', rail: 'Lineage' },
  { id: 'approvals', label: 'Approvals', rail: 'Approvals' },
  { id: 'dead', label: 'Dead letters', rail: 'Dead' },
];
const BOTTOM_TABS: Tab[] = TABS.map((t) => t.id);
const DEFAULT_OPEN_TABS: Tab[] = ['trends'];
/** Max rows rendered inside a condensed multi-pane column. */
const CONDENSED_LIST_CAP = 48;

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

function isBottomTab(v: unknown): v is Tab {
  return typeof v === 'string' && BOTTOM_TABS.includes(v as Tab);
}

function parseOpenTabs(raw: unknown, legacyTab: unknown): Tab[] {
  if (Array.isArray(raw)) {
    const tabs = raw.filter(isBottomTab);
    if (tabs.length > 0) return tabs;
  }
  if (isBottomTab(legacyTab)) return [legacyTab];
  return [...DEFAULT_OPEN_TABS];
}

function parseCollapsedPanes(raw: unknown): Tab[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isBottomTab);
}

interface ModuleOption {
  id: string;
  name: string;
  type: string;
  engineInstanceId: string | null;
  status?: string;
  /** Trend modules only — from TrendModuleConfig (default 10). */
  maxActiveTrends?: number;
  /** Policy modules — from PolicyModuleConfig. */
  policyEnvelopeRef?: string;
  policyNotes?: string;
}

interface EngineOption {
  id: string;
  label: string;
  templateId: string;
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
  leadId: string | null;
  treeId: string | null;
  simulatorGapTags?: string[];
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

interface DeadJobRow {
  id: string;
  kind: string;
  queueClass: string;
  moduleId: string | null;
  lastError: string | null;
  attempts: number;
  updatedAt: string;
}

interface PendingJobRow {
  id: string;
  kind: string;
  queueClass: string;
  moduleId: string | null;
  status: 'pending' | 'active';
  attempts: number;
  runAfter: string;
  updatedAt: string;
}

interface AssistantProposalRow {
  id: string;
  tool: string;
  status: string;
  createdAt: string;
  proposal: { tool: string; [key: string]: unknown };
}

interface LiveGateStatusRow {
  overallPass: boolean;
  liveArmedAt: string | null;
  evidenceFresh: boolean;
  checklist: { gateId: string; pass: boolean; evidence: string }[];
}

interface FundTransferRow {
  id: string;
  fromKind: string;
  fromModuleId: string | null;
  toKind: string;
  toModuleId: string | null;
  amountCents: string;
  status: string;
  requestedBy: string;
  createdAt: string;
}

/**
 * Bottom panel (ui-spec §4 / D-097 / D-114): multi-open tab panes + execution-
 * engine scope switcher. Ribbon toggles which panes are visible; each open pane
 * can collapse in-place. Expanded body is a horizontally scrollable row of
 * condensed lists. Panel show/hide and tab/pane state persist per company.
 */
export function BottomPanel(props: {
  companyId: string;
  companyMode?: string;
  modules: ModuleOption[];
  engines: EngineOption[];
}) {
  const companyMode = normalizeCapitalMode(props.companyMode);
  const storageKey = props.companyId ? `hftr:${props.companyId}:panel:bottom` : null;

  const [open, setOpen] = useState(false);
  const [openTabs, setOpenTabs] = useState<Tab[]>([...DEFAULT_OPEN_TABS]);
  const [collapsedPanes, setCollapsedPanes] = useState<Tab[]>([]);
  const [engineFilter, setEngineFilter] = useState<string>('all');
  const [persistReady, setPersistReady] = useState(false);
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [watchlists, setWatchlists] = useState<WatchlistRow[]>([]);
  const [watchlistTierFilter, setWatchlistTierFilter] = useState<WatchlistTierFilter>('default');
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [trees, setTrees] = useState<TreeRow[]>([]);
  const [transfers, setTransfers] = useState<FundTransferRow[]>([]);
  const [deadJobs, setDeadJobs] = useState<DeadJobRow[]>([]);
  const [pendingJobs, setPendingJobs] = useState<PendingJobRow[]>([]);
  const [proposals, setProposals] = useState<AssistantProposalRow[]>([]);
  const [liveGate, setLiveGate] = useState<LiveGateStatusRow | null>(null);
  const [openTraceId, setOpenTraceId] = useState<string | null>(null);
  const [selectedLineageKey, setSelectedLineageKey] = useState<string | null>(null);
  const [dataLoadState, setDataLoadState] = useState<'idle' | 'loading' | 'ready'>('idle');

  useEffect(() => {
    if (!storageKey) {
      setPersistReady(true);
      return;
    }
    const stored = readPanelState<{
      open?: unknown;
      tab?: unknown;
      openTabs?: unknown;
      collapsedPanes?: unknown;
      engineFilter?: unknown;
      /** Legacy D-022 key — ignored after D-097 engine scope. */
      moduleFilter?: unknown;
    }>(storageKey);
    if (stored) {
      if (typeof stored.open === 'boolean') setOpen(stored.open);
      setOpenTabs(parseOpenTabs(stored.openTabs, stored.tab));
      setCollapsedPanes(parseCollapsedPanes(stored.collapsedPanes));
      if (typeof stored.engineFilter === 'string') {
        const ok =
          stored.engineFilter === 'all' || props.engines.some((e) => e.id === stored.engineFilter);
        if (ok) setEngineFilter(stored.engineFilter);
      }
    }
    setPersistReady(true);
  }, [storageKey, props.engines]);

  useEffect(() => {
    if (!storageKey || !persistReady) return;
    writePanelState(storageKey, { open, openTabs, collapsedPanes, engineFilter });
  }, [storageKey, open, openTabs, collapsedPanes, engineFilter, persistReady]);

  /** No open panes → panel content stays collapsed (ribbon only). */
  useEffect(() => {
    if (open && openTabs.length === 0) setOpen(false);
  }, [open, openTabs]);

  const setPanelOpen = useCallback(
    (next: boolean) => {
      if (next && openTabs.length === 0) return;
      setOpen(next);
    },
    [openTabs.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' && !isEditableTarget(e)) {
        e.preventDefault();
        setPanelOpen(!open);
        return;
      }
      // TraceTimeline closes itself on Escape; only collapse panel when modal is absent.
      if (e.key === 'Escape' && open && !openTraceId && !isEditableTarget(e)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, openTraceId, setPanelOpen]);

  const load = useCallback(async () => {
    const base = `/api/companies/${props.companyId}`;
    setDataLoadState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    // D-200: each pane slice settles independently so open tabs stay interactive.
    await Promise.allSettled([
      api<{ trends: TrendRow[] }>(`${base}/trends`)
        .then((v) => setTrends(v.trends))
        .catch(() => undefined),
      api<{ executions: ExecutionRow[] }>(`${base}/executions`)
        .then((v) => setExecutions(v.executions))
        .catch(() => undefined),
      api<{ verifications: VerificationRow[] }>(`${base}/verifications`)
        .then((v) => setVerifications(v.verifications))
        .catch(() => undefined),
      api<{ items: WatchlistRow[] }>(`${base}/watchlists`)
        .then((v) => setWatchlists(v.items))
        .catch(() => undefined),
      api<{ leads: LeadRow[] }>(`${base}/leads`)
        .then((v) => setLeads(v.leads))
        .catch(() => undefined),
      api<{ trees: TreeRow[] }>(`${base}/trees`)
        .then((v) => setTrees(v.trees))
        .catch(() => undefined),
      api<{ transfers: FundTransferRow[] }>(`${base}/fund-transfers`)
        .then((v) => setTransfers(v.transfers))
        .catch(() => undefined),
      api<{ jobs: DeadJobRow[] }>(`${base}/jobs/dead`)
        .then((v) => setDeadJobs(v.jobs))
        .catch(() => undefined),
      api<{ jobs: PendingJobRow[] }>(`${base}/jobs/pending`)
        .then((v) => setPendingJobs(v.jobs))
        .catch(() => undefined),
      api<{ proposals: AssistantProposalRow[] }>(`${base}/assistant/proposals`)
        .then((v) => setProposals(v.proposals))
        .catch(() => undefined),
      api<LiveGateStatusRow>(`${base}/live-gates/status`)
        .then((v) => setLiveGate(v))
        .catch(() => undefined),
    ]);
    setDataLoadState('ready');
  }, [props.companyId]);

  useEffect(() => {
    if (!open) return;
    setDataLoadState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    void load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [open, load]);

  const moduleName = useCallback(
    (id: string) => props.modules.find((m) => m.id === id)?.name ?? 'unknown',
    [props.modules],
  );

  const moduleIdsInScope = useCallback((): Set<string> | null => {
    if (engineFilter === 'all') return null;
    return new Set(
      props.modules.filter((m) => m.engineInstanceId === engineFilter).map((m) => m.id),
    );
  }, [engineFilter, props.modules]);

  const byEngine = useCallback(
    <T extends { moduleId: string }>(rows: T[]) => {
      const ids = moduleIdsInScope();
      if (!ids) return rows;
      return rows.filter((r) => ids.has(r.moduleId));
    },
    [moduleIdsInScope],
  );

  const byEngineOptionalModule = useCallback(
    <T extends { moduleId: string | null }>(rows: T[]) => {
      const ids = moduleIdsInScope();
      if (!ids) return rows;
      return rows.filter((r) => r.moduleId != null && ids.has(r.moduleId));
    },
    [moduleIdsInScope],
  );

  const scopedTransfers = useCallback(() => {
    const ids = moduleIdsInScope();
    if (!ids) return transfers;
    return transfers.filter((t) => {
      const fromHit = t.fromModuleId != null && ids.has(t.fromModuleId);
      const toHit = t.toModuleId != null && ids.has(t.toModuleId);
      return fromHit || toHit;
    });
  }, [moduleIdsInScope, transfers]);

  const scopedModules = useCallback(() => {
    const ids = moduleIdsInScope();
    if (!ids) return props.modules;
    return props.modules.filter((m) => ids.has(m.id));
  }, [moduleIdsInScope, props.modules]);

  const confirmWatchlist = useCallback(
    async (itemId: string) => {
      await api(`/api/companies/${props.companyId}/watchlists/${itemId}`, {
        method: 'PATCH',
        body: { status: 'watching' },
      });
      invalidateMarketHub({ companyId: props.companyId });
      await load();
    },
    [props.companyId, load],
  );

  const toggleTab = useCallback((id: Tab) => {
    setOpenTabs((prev) => {
      if (prev.includes(id)) {
        setCollapsedPanes((c) => c.filter((t) => t !== id));
        const next = prev.filter((t) => t !== id);
        if (next.length === 0) setOpen(false);
        return next;
      }
      setOpen(true);
      return [...prev, id];
    });
  }, []);

  const hideTab = useCallback((id: Tab) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t !== id);
      if (next.length === 0) setOpen(false);
      return next;
    });
    setCollapsedPanes((prev) => prev.filter((t) => t !== id));
  }, []);

  const togglePaneCollapse = useCallback((id: Tab) => {
    setCollapsedPanes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }, []);

  const policyModules = scopedModules()
    .filter((m) => m.type === 'policy')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const scopedWatchlists = byEngine(watchlists).filter((w) =>
    watchlistMatchesTierFilter(w.status, watchlistTierFilter),
  );
  const scopedLeads = byEngine(leads);
  const scopedTrees = byEngine(trees);
  const scopedExecutions = byEngine(executions);
  const scopedDead = byEngineOptionalModule(deadJobs);
  const scopedPending = byEngineOptionalModule(pendingJobs);
  const scopedTrends = byEngine(trends);
  const pendingApprovals =
    scopedTransfers().filter((t) => t.status === 'requested').length +
    proposals.length +
    (liveGate != null && (!liveGate.overallPass || !liveGate.evidenceFresh || !liveGate.liveArmedAt)
      ? 1
      : 0);

  const trendCandidateCount = scopedTrends.filter(
    (t) => t.status === 'candidate' || t.status === 'promoted',
  ).length;

  const paneCount = (id: Tab): number => {
    switch (id) {
      case 'trends':
        return trendCandidateCount;
      case 'scenarios':
        return scopedLeads.length;
      case 'watchlists':
        return scopedWatchlists.length;
      case 'policies':
        return policyModules.length;
      case 'decisions':
        return scopedExecutions.length;
      case 'lineage':
        return (
          scopedTrends.length +
          scopedLeads.length +
          scopedTrees.length +
          scopedExecutions.length +
          scopedPending.length +
          scopedDead.length
        );
      case 'approvals':
        return pendingApprovals;
      case 'dead':
        return scopedDead.length;
      default: {
        const _exhaustive: never = id;
        return _exhaustive;
      }
    }
  };

  const edgeToggle = (
    <button
      type="button"
      onClick={() => setPanelOpen(!open)}
      className={
        open
          ? 'w-full py-1 text-center text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40'
          : 'px-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40'
      }
      disabled={!open && openTabs.length === 0}
      aria-expanded={open}
      aria-label={
        open
          ? 'Collapse bottom panel (keyboard shortcut backtick or Escape)'
          : openTabs.length === 0
            ? 'Open a ribbon tab to expand the bottom panel'
            : 'Expand bottom panel (keyboard shortcut backtick)'
      }
      title={
        open ? 'Collapse (` or Esc)' : openTabs.length === 0 ? 'Open a tab first' : 'Expand (`)'
      }
    >
      {open ? '▼' : '▲'}
    </button>
  );

  const tabRibbon = (
    <div
      className={`flex w-full items-stretch gap-2 bg-[var(--color-surface-1)] ${
        open
          ? 'border-b border-[var(--color-line)]'
          : 'border-t border-[var(--color-line)]'
      }`}
    >
      <PanelTabs
        aria-label="Bottom panel sections"
        className="min-w-0 flex-1"
        values={openTabs}
        onToggle={toggleTab}
        tabs={TABS.map((t) => {
          const count = paneCount(t.id);
          return {
            id: t.id,
            label: t.rail,
            meta: count > 0 ? String(count) : undefined,
            title: `${t.label}${openTabs.includes(t.id) ? ' (open — click to hide)' : ' (click to open)'}`,
          };
        })}
      />
      <div className="flex shrink-0 items-center gap-2 px-2">
        <select
          value={engineFilter}
          onChange={(e) => setEngineFilter(e.target.value)}
          aria-label="Execution engine"
          title="Execution engine being viewed"
          className="max-w-[12rem] border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 font-mono text-[10px] text-[var(--color-ink-dim)] outline-none"
        >
          <option value="all">All engines</option>
          {props.engines.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        {!open ? edgeToggle : null}
      </div>
    </div>
  );

  if (!open) {
    return <section className="shrink-0">{tabRibbon}</section>;
  }

  const orderedOpenTabs = TABS.map((t) => t.id).filter((id) => openTabs.includes(id));
  const expandedPaneCount = orderedOpenTabs.filter((id) => !collapsedPanes.includes(id)).length;

  return (
    <section className="flex shrink-0 flex-col bg-[var(--color-surface-1)]">
      {tabRibbon}
      {dataLoadState === 'loading' ? (
        <div
          className="border-b border-[var(--color-line)] px-3 py-1"
          data-testid="bottom-panel-loading"
        >
          <InlineLoadingStrip label="Bottom" detail="syncing" bar={false} />
        </div>
      ) : null}
      <div className="flex h-[min(calc(70vh-1.75rem),calc(48rem-1.75rem))] min-h-[14.25rem] gap-2 overflow-x-auto overflow-y-hidden px-3 py-2 text-sm">
        {orderedOpenTabs.map((id) => {
          const meta = TABS.find((t) => t.id === id)!;
          const collapsed = collapsedPanes.includes(id);
          const soleExpanded = !collapsed && expandedPaneCount === 1;
          return (
            <PaneShell
              key={id}
              title={meta.label}
              rail={meta.rail}
              count={paneCount(id)}
              collapsed={collapsed}
              soleExpanded={soleExpanded}
              onToggleCollapse={() => togglePaneCollapse(id)}
              onHide={() => hideTab(id)}
            >
              {id === 'trends' ? (
                <TrendsView
                  companyId={props.companyId}
                  trends={scopedTrends}
                  modules={scopedModules()}
                  engines={props.engines}
                  onRefetch={load}
                  condensed
                />
              ) : null}
              {id === 'scenarios' ? (
                <ScenarioView
                  leads={scopedLeads}
                  trees={scopedTrees}
                  executions={scopedExecutions}
                  moduleName={moduleName}
                  condensed
                />
              ) : null}
              {id === 'watchlists' ? (
                <div className="space-y-1.5">
                  <WatchlistTierFilterChips
                    value={watchlistTierFilter}
                    onChange={setWatchlistTierFilter}
                  />
                  <CondensedWatchlistList
                    rows={scopedWatchlists}
                    onConfirm={(itemId) => void confirmWatchlist(itemId)}
                  />
                </div>
              ) : null}
              {id === 'policies' ? <CondensedPoliciesList modules={policyModules} /> : null}
              {id === 'lineage' ? (
                <LineageView
                  trends={scopedTrends}
                  leads={scopedLeads}
                  trees={scopedTrees}
                  executions={scopedExecutions}
                  verifications={verifications}
                  pendingJobs={scopedPending}
                  deadJobs={scopedDead}
                  moduleName={moduleName}
                  selectedKey={selectedLineageKey}
                  onSelectKey={setSelectedLineageKey}
                  condensed
                />
              ) : null}
              {id === 'decisions' ? (
                <CondensedDecisionsList
                  executions={scopedExecutions}
                  verifications={verifications}
                  moduleName={moduleName}
                  onOpenTrace={setOpenTraceId}
                />
              ) : null}
              {id === 'approvals' ? (
                <ApprovalsView
                  companyId={props.companyId}
                  companyMode={companyMode}
                  transfers={scopedTransfers()}
                  proposals={proposals}
                  liveGate={liveGate}
                  moduleName={moduleName}
                  onRefetch={load}
                  condensed
                />
              ) : null}
              {id === 'dead' ? (
                <DeadLettersView
                  companyId={props.companyId}
                  jobs={scopedDead}
                  moduleName={moduleName}
                  onRefetch={load}
                  condensed
                />
              ) : null}
            </PaneShell>
          );
        })}
      </div>

      {/* D-118: hide/show control stays on the viewport bottom edge while tabs stay on top. */}
      <div className="shrink-0 border-t border-[var(--color-line)] bg-[var(--color-surface-1)]">
        {edgeToggle}
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

function PaneShell(props: {
  title: string;
  rail: string;
  count: number;
  collapsed: boolean;
  soleExpanded?: boolean;
  onToggleCollapse: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const widthClass = props.collapsed
    ? 'w-[9.5rem]'
    : props.soleExpanded
      ? 'min-w-[18rem] flex-1'
      : 'w-[min(22rem,80vw)] min-w-[15rem]';
  return (
    <section
      className={`flex shrink-0 flex-col overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] ${widthClass}`}
      aria-label={`${props.title} pane`}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-[var(--color-line)] px-2 py-1.5">
        <h3 className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink)]">
          {props.rail}
        </h3>
        <span
          className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]"
          aria-label={`${props.count} items`}
        >
          {props.count}
        </span>
        <button
          type="button"
          onClick={props.onToggleCollapse}
          className="shrink-0 px-1 font-mono text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-expanded={!props.collapsed}
          aria-label={
            props.collapsed ? `Expand ${props.title} pane` : `Collapse ${props.title} pane`
          }
          title={props.collapsed ? 'Expand pane' : 'Collapse pane'}
        >
          {props.collapsed ? '▸' : '▾'}
        </button>
        <button
          type="button"
          onClick={props.onHide}
          className="shrink-0 px-1 font-mono text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-label={`Hide ${props.title} pane`}
          title="Hide pane"
        >
          ×
        </button>
      </header>
      {props.collapsed ? (
        <p className="px-2 py-2 text-[10px] text-[var(--color-ink-faint)]">
          {props.title}
          {props.count > 0 ? ` · ${props.count}` : ''}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{props.children}</div>
      )}
    </section>
  );
}

function CondensedSection(props: { label: string; count: number }) {
  return (
    <p className="sticky top-0 z-[1] bg-[var(--color-surface-0)] pb-1 pt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] first:pt-0">
      {props.label}
      <span className="ml-1 tabular-nums">{props.count}</span>
    </p>
  );
}

function CondensedMore(props: { shown: number; total: number }) {
  if (props.total <= props.shown) return null;
  return (
    <p className="pt-1.5 text-[10px] text-[var(--color-ink-faint)]">
      Showing {props.shown} of {props.total}
    </p>
  );
}

function takeCondensed<T>(rows: T[]): { shown: T[]; total: number } {
  return { shown: rows.slice(0, CONDENSED_LIST_CAP), total: rows.length };
}

function CondensedRow(props: {
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `w-full border-b border-[var(--color-line)] py-1.5 text-left last:border-b-0 ${
    props.active ? 'bg-[var(--color-accent)]/10' : ''
  }`;
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-[var(--color-ink)]">{props.primary}</span>
        {props.meta != null ? (
          <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-faint)]">
            {props.meta}
          </span>
        ) : null}
      </div>
      {props.secondary != null ? (
        <div className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">{props.secondary}</div>
      ) : null}
    </>
  );
  if (props.onClick) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        aria-pressed={props.active}
        className={`${className} hover:bg-[var(--color-surface-1)]`}
      >
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function CondensedEmpty(props: { children: string }) {
  return <p className="py-2 text-[10px] text-[var(--color-ink-faint)]">{props.children}</p>;
}

function CondensedPoliciesList(props: { modules: ModuleOption[] }) {
  if (props.modules.length === 0) {
    return <CondensedEmpty>No policy modules in this engine scope.</CondensedEmpty>;
  }
  const { shown, total } = takeCondensed(props.modules);
  return (
    <div>
      {shown.map((m) => (
        <CondensedRow
          key={m.id}
          primary={m.name}
          secondary={
            [m.policyEnvelopeRef, m.policyNotes].filter(Boolean).join(' · ') || 'No envelope ref'
          }
          meta={m.status ?? '—'}
        />
      ))}
      <CondensedMore shown={shown.length} total={total} />
    </div>
  );
}

function CondensedWatchlistList(props: { rows: WatchlistRow[]; onConfirm: (id: string) => void }) {
  if (props.rows.length === 0) {
    return <CondensedEmpty>No watched symbols for this tier filter.</CondensedEmpty>;
  }
  const { shown, total } = takeCondensed(props.rows);
  return (
    <div>
      {shown.map((w) => (
        <div key={w.id} className="border-b border-[var(--color-line)] py-1.5 last:border-b-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs text-[var(--color-ink)]">
              {w.symbol} · {w.bias}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">{w.status}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-[var(--color-ink-dim)]">
            {w.moduleName}
            {w.note ? ` · ${w.note}` : ''}
          </p>
          {w.status === 'suggested_search' || w.status === 'suggested_verified' ? (
            <button
              type="button"
              className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
              onClick={() => props.onConfirm(w.id)}
            >
              Confirm
            </button>
          ) : null}
        </div>
      ))}
      <CondensedMore shown={shown.length} total={total} />
    </div>
  );
}

function CondensedDecisionsList(props: {
  executions: ExecutionRow[];
  verifications: VerificationRow[];
  moduleName: (id: string) => string;
  onOpenTrace: (id: string) => void;
}) {
  if (props.executions.length === 0) {
    return <CondensedEmpty>No decisions traced yet.</CondensedEmpty>;
  }
  const { shown, total } = takeCondensed(props.executions);
  return (
    <div>
      {shown.map((e) => {
        const v = props.verifications.find((x) => x.traceId === e.id);
        const honesty = simHonestyChips(e.simulatorGapTags);
        return (
          <CondensedRow
            key={e.id}
            primary={
              <span style={{ color: toneFor(e.outcome) }} className="capitalize">
                {e.outcome}
              </span>
            }
            secondary={
              <span className="flex flex-col gap-0.5">
                <span>
                  {`${e.description ?? e.failureCode ?? `${e.venue} · ${e.mode}`} · ${props.moduleName(e.moduleId)}${v ? ` · ${v.result}` : ''}`}
                </span>
                {honesty.length > 0 && (
                  <span
                    className="flex flex-wrap gap-1"
                    data-testid="decisions-honesty-chips"
                    aria-label={`Simulation honesty: ${honesty.map((c) => c.label).join(', ')}`}
                  >
                    {honesty.map((chip) => (
                      <span
                        key={chip.kind}
                        className="rounded border border-[var(--color-line)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
                      >
                        {chip.label}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            }
            meta={new Date(e.createdAt).toLocaleTimeString()}
            onClick={() => props.onOpenTrace(e.id)}
          />
        );
      })}
      <CondensedMore shown={shown.length} total={total} />
    </div>
  );
}

function Table(props: { head: string[]; rows: ReactNode[][]; empty: string }) {
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
 * Trends tab (D-104): one list per trend module in the selected engine scope
 * (multiple lists when the engine has multiple trend modules). Rows are the
 * same `trend_candidates` the canvas TrendListChrome shows (candidate +
 * promoted, capped by maxActiveTrends).
 */
function TrendsView(props: {
  companyId: string;
  trends: TrendRow[];
  modules: ModuleOption[];
  engines: EngineOption[];
  onRefetch: () => Promise<void>;
  condensed?: boolean;
}) {
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<Record<string, string>>({});
  const trendModules = props.modules
    .filter((m) => m.type === 'trend')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const engineLabel = useCallback(
    (engineInstanceId: string | null) => {
      if (!engineInstanceId) return 'Unscoped';
      return props.engines.find((e) => e.id === engineInstanceId)?.label ?? 'Unknown engine';
    },
    [props.engines],
  );

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

  function listRowsForModule(moduleId: string, maxActive: number): TrendRow[] {
    return props.trends
      .filter(
        (t) => t.moduleId === moduleId && (t.status === 'candidate' || t.status === 'promoted'),
      )
      .slice()
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
      .slice(0, maxActive);
  }

  if (props.condensed) {
    if (trendModules.length === 0) {
      return <CondensedEmpty>No trend modules in this engine scope.</CondensedEmpty>;
    }
    return (
      <div className="space-y-2">
        {trendModules.map((mod) => {
          const maxActive = mod.maxActiveTrends ?? 10;
          const rows = listRowsForModule(mod.id, maxActive);
          return (
            <div key={mod.id}>
              <CondensedSection label={mod.name} count={rows.length} />
              {rows.length === 0 ? (
                <CondensedEmpty>No candidates.</CondensedEmpty>
              ) : (
                rows.map((t) => (
                  <div
                    key={t.id}
                    className="border-b border-[var(--color-line)] py-1.5 last:border-b-0"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-[var(--color-ink)]">
                        {t.symbol} · {t.direction}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                        {t.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">
                      {t.strengthBand} · {rows.length}/{maxActive}
                    </p>
                    {t.status === 'candidate' ? (
                      <button
                        type="button"
                        disabled={promotingId === t.id}
                        className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-accent)] hover:underline disabled:opacity-40"
                        onClick={() => void promote(t)}
                      >
                        {promotingId === t.id ? 'Promoting…' : (promoted[t.id] ?? 'Promote')}
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          Trend lists from each trend module in the selected engine. Promote uses tactical + compile
          LLM tiers.
        </p>
        <LlmAvailabilityChips tiers={['tactical', 'execution']} />
      </div>
      <AddCandidateForm
        companyId={props.companyId}
        trendModules={trendModules}
        onCreated={props.onRefetch}
      />

      {trendModules.length === 0 ? (
        <p className="py-3 text-xs text-[var(--color-ink-faint)]">
          No trend modules in this engine scope. Add a trend module on the canvas, or select All
          engines.
        </p>
      ) : (
        <div className="space-y-3">
          {trendModules.map((mod) => {
            const maxActive = mod.maxActiveTrends ?? 10;
            const rows = listRowsForModule(mod.id, maxActive);
            return (
              <section
                key={mod.id}
                className="overflow-hidden rounded-lg border border-[var(--color-line)]"
                aria-label={`Trend list ${mod.name}`}
              >
                <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-1.5">
                  <h3 className="text-xs font-medium text-[var(--color-ink)]">{mod.name}</h3>
                  <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                    {engineLabel(mod.engineInstanceId)}
                  </span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--color-ink-dim)]">
                    {rows.length}/{maxActive}
                  </span>
                </header>
                <div className="px-3 py-2">
                  <Table
                    head={[
                      'Symbol',
                      'Direction',
                      'Strength',
                      'Source',
                      'Status',
                      'Scanned',
                      'Action',
                    ]}
                    rows={rows.map((t) => [
                      <span key="s" className="font-mono">
                        {t.symbol}
                      </span>,
                      <Justification
                        key="d"
                        sourceClass={t.sourceClass}
                        lines={[
                          t.sourceClass === 'deterministic_scan'
                            ? `Direction "${t.direction}" and strength "${t.strengthBand}" come from this module's trend list (scan or operator add).`
                            : `Direction "${t.direction}" nominated with strength "${t.strengthBand}".`,
                          `Scanned ${new Date(t.scannedAt).toLocaleString()} by ${mod.name}.`,
                          'The drift value is recorded as an auditable ValueRef (right panel → Values).',
                        ]}
                      >
                        <span className="capitalize" style={{ color: toneFor(t.direction) }}>
                          {t.direction}
                        </span>
                      </Justification>,
                      t.strengthBand,
                      t.sourceClass === 'deterministic_scan' ? 'scan' : 'model',
                      <span key="st" className="font-mono text-[10px]">
                        {t.status}
                      </span>,
                      new Date(t.scannedAt).toLocaleTimeString(),
                      promoted[t.id] ? (
                        <span
                          key="p"
                          style={{
                            color:
                              promoted[t.id] === 'promoted'
                                ? 'var(--color-ok)'
                                : 'var(--color-warn)',
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
                    empty="No trend candidates on this list yet. Run Scan on the module, or add a candidate above."
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
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
        err instanceof RequestError ? `Add failed (${err.status}).` : 'Could not add candidate.',
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
  condensed?: boolean;
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

  if (props.condensed) {
    const { shown, total } = takeCondensed(sorted);
    return (
      <div>
        {shown.map((lead) => {
          const tree = props.trees.find((t) => t.leadId === lead.id);
          return (
            <CondensedRow
              key={lead.id}
              primary={`${lead.symbol} · ${lead.status}`}
              secondary={`Lead · ${lead.strategyFamily} · ${props.moduleName(lead.moduleId)}${tree ? ` · tree ${tree.status}` : ''}`}
              meta={new Date(lead.createdAt).toLocaleTimeString()}
            />
          );
        })}
        <CondensedMore shown={shown.length} total={total} />
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {sorted.map((lead) => {
        const tree = props.trees.find((t) => t.leadId === lead.id);
        const related = props.executions.filter(
          (e) => e.leadId === lead.id || (e.description ?? '').includes(lead.symbol),
        );
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
                sourceClass="deterministic_scan"
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
                  <Justification
                    key={key}
                    sourceClass="deterministic_scan"
                    lines={[
                      `Gate "${key}" result: ${gate.result}.`,
                      gate.evidence || 'No evidence text recorded for this gate.',
                    ]}
                  >
                    <button
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
                  </Justification>
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
                    {e.amountCents && (
                      <span className="flex items-center gap-1 font-mono">
                        <span
                          className="rounded border border-[var(--color-line)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]"
                          data-testid="execution-mode-chip"
                        >
                          {executionCapitalChip(e.mode, e.venue)}
                        </span>
                        {dollars(e.amountCents)}
                      </span>
                    )}
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

function endpointLabel(kind: string, moduleId: string | null, moduleName: (id: string) => string) {
  if (kind === 'module' && moduleId) return moduleName(moduleId);
  return kind.replace(/_/g, ' ');
}

function ApprovalsView(props: {
  companyId: string;
  companyMode: CapitalMode;
  transfers: FundTransferRow[];
  proposals: AssistantProposalRow[];
  liveGate: LiveGateStatusRow | null;
  moduleName: (id: string) => string;
  onRefetch: () => Promise<void>;
  condensed?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = props.transfers.filter((t) => t.status === 'requested');
  const failedGates = (props.liveGate?.checklist ?? []).filter((c) => !c.pass);
  const liveGateActionable =
    props.liveGate != null && (!props.liveGate.overallPass || !props.liveGate.evidenceFresh);
  const liveGateReadyToArm =
    props.liveGate != null &&
    props.liveGate.overallPass &&
    props.liveGate.evidenceFresh &&
    !props.liveGate.liveArmedAt;
  const liveGateNeedsAttention = liveGateActionable || liveGateReadyToArm;

  async function decideTransfer(id: string, decision: 'approve' | 'reject') {
    setBusyId(id);
    try {
      await api(`/api/companies/${props.companyId}/fund-transfers/${id}`, {
        method: 'POST',
        body: { decision },
      });
      window.dispatchEvent(new Event(ACTIVITY_REFRESH_EVENT));
      await props.onRefetch();
    } finally {
      setBusyId(null);
    }
  }

  async function decideProposal(id: string, action: 'confirm' | 'reject') {
    setBusyId(id);
    try {
      await api(`/api/companies/${props.companyId}/assistant/proposals/${id}/${action}`, {
        method: 'POST',
      });
      window.dispatchEvent(new Event(ACTIVITY_REFRESH_EVENT));
      await props.onRefetch();
    } finally {
      setBusyId(null);
    }
  }

  async function reviewLiveGate() {
    setBusyId('live-gate');
    try {
      await api(`/api/companies/${props.companyId}/live-gates/review`, { method: 'POST' });
      await props.onRefetch();
    } finally {
      setBusyId(null);
    }
  }

  const empty = pending.length === 0 && props.proposals.length === 0 && !liveGateNeedsAttention;

  if (empty) {
    return (
      <p className="py-3 text-xs text-[var(--color-ink-faint)]">
        No pending approvals — fund transfers, assistant edit proposals, and live-gate follow-ups
        appear here.
      </p>
    );
  }

  if (props.condensed) {
    return (
      <div>
        {liveGateNeedsAttention && props.liveGate ? (
          <div className="mb-2 border-b border-[var(--color-line)] pb-2">
            <CondensedRow
              primary="Live gate"
              secondary={
                props.liveGate.overallPass
                  ? props.liveGate.evidenceFresh
                    ? 'Ready to arm (top bar)'
                    : 'Evidence stale'
                  : `Blocked · ${failedGates.length} fail(s)`
              }
              meta={props.liveGate.liveArmedAt ? 'armed' : 'disarmed'}
            />
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void reviewLiveGate()}
              className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-accent)] hover:underline disabled:opacity-50"
            >
              {busyId === 'live-gate' ? '…' : 'Save evidence'}
            </button>
          </div>
        ) : null}
        {props.proposals.map((p) => (
          <div key={p.id} className="border-b border-[var(--color-line)] py-1.5 last:border-b-0">
            <CondensedRow
              primary={p.tool}
              secondary={summarizeProposal(p.proposal)}
              meta={new Date(p.createdAt).toLocaleTimeString()}
            />
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void decideProposal(p.id, 'confirm')}
                className="text-[10px] uppercase tracking-wider text-[var(--color-ok)] hover:underline disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void decideProposal(p.id, 'reject')}
                className="text-[10px] uppercase tracking-wider text-[var(--color-block)] hover:underline disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
        {pending.map((t) => (
          <div key={t.id} className="border-b border-[var(--color-line)] py-1.5 last:border-b-0">
            <CondensedRow
              primary={
                <span className="flex items-center gap-1">
                  <span
                    className="rounded border border-[var(--color-line)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]"
                    data-testid="fund-transfers-paper"
                  >
                    {props.companyMode === 'live' ? 'live' : 'paper'}
                  </span>
                  {dollars(t.amountCents)}
                </span>
              }
              secondary={`${endpointLabel(t.fromKind, t.fromModuleId, props.moduleName)} → ${endpointLabel(t.toKind, t.toModuleId, props.moduleName)}`}
              meta={t.status}
            />
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void decideTransfer(t.id, 'approve')}
                className="text-[10px] uppercase tracking-wider text-[var(--color-ok)] hover:underline disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void decideTransfer(t.id, 'reject')}
                className="text-[10px] uppercase tracking-wider text-[var(--color-block)] hover:underline disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {liveGateNeedsAttention && props.liveGate && (
        <div className="rounded-lg border border-[var(--color-line)] p-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono uppercase tracking-wider text-[var(--color-ink-faint)]">
              Live gate
            </span>
            <span
              style={{
                color: props.liveGate.overallPass ? 'var(--color-ok)' : 'var(--color-block)',
              }}
            >
              {props.liveGate.overallPass ? 'checklist pass' : 'checklist blocked'}
            </span>
            <span className="text-[var(--color-ink-dim)]">
              {props.liveGate.liveArmedAt
                ? `armed ${new Date(props.liveGate.liveArmedAt).toLocaleString()}`
                : 'not armed'}
            </span>
            {!props.liveGate.evidenceFresh && (
              <span style={{ color: 'var(--color-warn)' }}>evidence stale</span>
            )}
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void reviewLiveGate()}
              className="ml-auto rounded border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
            >
              {busyId === 'live-gate' ? '…' : 'Save evidence'}
            </button>
          </div>
          {failedGates.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-[var(--color-ink-dim)]">
              {failedGates.slice(0, 6).map((g) => (
                <li key={g.gateId}>
                  <span style={{ color: 'var(--color-block)' }}>fail</span> {g.gateId}
                  {g.evidence ? ` — ${g.evidence}` : ''}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
            Arm / disarm remains on the top-bar mode switch after checklist evidence is fresh.
          </p>
        </div>
      )}

      {props.proposals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Assistant proposals
          </p>
          <Table
            head={['Tool', 'Summary', 'Requested', 'Actions']}
            rows={props.proposals.map((p) => [
              <span key="t" className="font-mono text-[10px]">
                {p.tool}
              </span>,
              <span key="s" className="block max-w-md truncate text-[11px]">
                {summarizeProposal(p.proposal)}
              </span>,
              new Date(p.createdAt).toLocaleTimeString(),
              <span key="act" className="flex gap-1">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void decideProposal(p.id, 'confirm')}
                  className="rounded border border-[var(--color-ok)] px-2 py-0.5 text-[11px] text-[var(--color-ok)] hover:bg-[var(--color-ok)]/10 disabled:opacity-50"
                >
                  {busyId === p.id ? '…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void decideProposal(p.id, 'reject')}
                  className="rounded border border-[var(--color-block)] px-2 py-0.5 text-[11px] text-[var(--color-block)] hover:bg-[var(--color-block)]/10 disabled:opacity-50"
                >
                  Reject
                </button>
              </span>,
            ])}
            empty="No assistant proposals."
          />
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-1.5" data-testid="fund-transfers-paper">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {fundTransfersHeadline(props.companyMode)}
          </p>
          <Table
            head={['From', 'To', 'Amount', 'Requested', 'Actions']}
            rows={pending.map((t) => [
              endpointLabel(t.fromKind, t.fromModuleId, props.moduleName),
              endpointLabel(t.toKind, t.toModuleId, props.moduleName),
              <span key="a" className="font-mono">
                {dollars(t.amountCents)}
              </span>,
              new Date(t.createdAt).toLocaleTimeString(),
              <span key="act" className="flex gap-1">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void decideTransfer(t.id, 'approve')}
                  className="rounded border border-[var(--color-ok)] px-2 py-0.5 text-[11px] text-[var(--color-ok)] hover:bg-[var(--color-ok)]/10 disabled:opacity-50"
                >
                  {busyId === t.id ? '…' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void decideTransfer(t.id, 'reject')}
                  className="rounded border border-[var(--color-block)] px-2 py-0.5 text-[11px] text-[var(--color-block)] hover:bg-[var(--color-block)]/10 disabled:opacity-50"
                >
                  Reject
                </button>
              </span>,
            ])}
            empty="No pending fund transfers."
          />
        </div>
      )}
    </div>
  );
}

function summarizeProposal(proposal: AssistantProposalRow['proposal']): string {
  switch (proposal.tool) {
    case 'create_module':
      return `Create ${String(proposal.type ?? 'module')} “${String(proposal.name ?? '')}”`;
    case 'rename_module':
      return `Rename → “${String(proposal.name ?? '')}”`;
    case 'allocate_funds':
      return 'Allocate funds (confirm to apply)';
    case 'add_watchlist_item':
    case 'create_watchlist':
      return `Watch ${String(proposal.symbol ?? 'symbol')}`;
    case 'link_modules':
      return 'Link modules';
    case 'set_policy':
      return 'Set policy envelope';
    case 'update_module_config':
    case 'patch_module_config':
      return 'Update module config';
    case 'trigger_tier':
      return 'Trigger tier action';
    default:
      return proposal.tool;
  }
}

type LineageLinkReason = 'module' | 'symbol' | 'trend' | 'lead' | 'trace';

interface LineageContext {
  selectedKey: string;
  moduleIds: Set<string>;
  symbols: Set<string>;
  trendIds: Set<string>;
  leadIds: Set<string>;
  traceIds: Set<string>;
  primaryLink: LineageLinkReason;
}

function parseLineageKey(key: string): { kind: string; id: string } | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  return { kind: key.slice(0, i), id: key.slice(i + 1) };
}

function symbolInText(symbol: string, text: string | null | undefined): boolean {
  if (!text || !symbol) return false;
  return text.toUpperCase().includes(symbol.toUpperCase());
}

function extractSymbolFromDescription(
  description: string | null,
  known: Set<string>,
): string | undefined {
  if (!description) return undefined;
  const upper = description.toUpperCase();
  for (const sym of known) {
    if (upper.includes(sym)) return sym;
  }
  return undefined;
}

function buildLineageContext(
  selectedKey: string,
  data: {
    trends: TrendRow[];
    leads: LeadRow[];
    trees: TreeRow[];
    executions: ExecutionRow[];
    deadJobs: DeadJobRow[];
    pendingJobs: PendingJobRow[];
    knownSymbols: Set<string>;
  },
): LineageContext | null {
  const parsed = parseLineageKey(selectedKey);
  if (!parsed) return null;

  const ctx: LineageContext = {
    selectedKey,
    moduleIds: new Set(),
    symbols: new Set(),
    trendIds: new Set(),
    leadIds: new Set(),
    traceIds: new Set(),
    primaryLink: 'module',
  };

  const { kind, id } = parsed;

  if (kind === 'trend') {
    const trend = data.trends.find((t) => t.id === id);
    if (!trend) return null;
    ctx.moduleIds.add(trend.moduleId);
    ctx.symbols.add(trend.symbol.toUpperCase());
    ctx.trendIds.add(trend.id);
    ctx.primaryLink = 'trend';
    for (const lead of data.leads.filter((l) => l.trendId === trend.id)) {
      ctx.leadIds.add(lead.id);
    }
    return ctx;
  }

  if (kind === 'lead') {
    const lead = data.leads.find((l) => l.id === id);
    if (!lead) return null;
    ctx.moduleIds.add(lead.moduleId);
    ctx.symbols.add(lead.symbol.toUpperCase());
    ctx.trendIds.add(lead.trendId);
    ctx.leadIds.add(lead.id);
    ctx.primaryLink = 'lead';
    return ctx;
  }

  if (kind === 'tree') {
    const tree = data.trees.find((t) => t.id === id);
    if (!tree) return null;
    ctx.moduleIds.add(tree.moduleId);
    ctx.symbols.add(tree.symbol.toUpperCase());
    ctx.leadIds.add(tree.leadId);
    const lead = data.leads.find((l) => l.id === tree.leadId);
    if (lead) ctx.trendIds.add(lead.trendId);
    ctx.primaryLink = 'lead';
    return ctx;
  }

  if (kind === 'execution') {
    const exec = data.executions.find((e) => e.id === id);
    if (!exec) return null;
    ctx.moduleIds.add(exec.moduleId);
    ctx.traceIds.add(exec.id);
    if (exec.leadId) {
      ctx.leadIds.add(exec.leadId);
      ctx.primaryLink = 'lead';
      const lead = data.leads.find((l) => l.id === exec.leadId);
      if (lead) {
        ctx.trendIds.add(lead.trendId);
        ctx.symbols.add(lead.symbol.toUpperCase());
      }
    } else {
      const sym = extractSymbolFromDescription(exec.description, data.knownSymbols);
      if (sym) ctx.symbols.add(sym);
      ctx.primaryLink = 'trace';
      for (const lead of data.leads.filter((l) => symbolInText(l.symbol, exec.description))) {
        ctx.leadIds.add(lead.id);
        ctx.trendIds.add(lead.trendId);
        ctx.symbols.add(lead.symbol.toUpperCase());
      }
    }
    return ctx;
  }

  if (kind === 'pending') {
    const job = data.pendingJobs.find((j) => j.id === id);
    if (!job) return null;
    if (job.moduleId) ctx.moduleIds.add(job.moduleId);
    ctx.primaryLink = 'module';
    return ctx;
  }

  if (kind === 'dead') {
    const job = data.deadJobs.find((j) => j.id === id);
    if (!job) return null;
    if (job.moduleId) ctx.moduleIds.add(job.moduleId);
    ctx.primaryLink = 'module';
    return ctx;
  }

  return null;
}

function isLineageLinked(
  ctx: LineageContext,
  row: {
    kind: 'trend' | 'lead' | 'tree' | 'execution' | 'dead' | 'pending';
    id: string;
    moduleId?: string | null;
    symbol?: string;
    trendId?: string;
    leadId?: string | null;
    description?: string | null;
  },
): boolean {
  if (`${row.kind}:${row.id}` === ctx.selectedKey) return true;
  if (row.kind === 'execution' && ctx.traceIds.has(row.id)) return true;
  if (row.leadId && ctx.leadIds.has(row.leadId)) return true;
  if (row.kind === 'lead' && ctx.leadIds.has(row.id)) return true;
  if (row.trendId && ctx.trendIds.has(row.trendId)) return true;
  if (row.kind === 'trend' && ctx.trendIds.has(row.id)) return true;
  if (row.symbol && ctx.symbols.has(row.symbol.toUpperCase())) return true;
  if (
    row.kind === 'execution' &&
    row.description &&
    [...ctx.symbols].some((s) => symbolInText(s, row.description))
  ) {
    return true;
  }
  if (row.moduleId && ctx.moduleIds.has(row.moduleId)) return true;
  return false;
}

function lineageCaption(ctx: LineageContext): string {
  const labels: Record<LineageLinkReason, string> = {
    module: 'module',
    symbol: 'symbol',
    trend: 'trend',
    lead: 'lead / policy',
    trace: 'trace',
  };
  return `Linked by: ${labels[ctx.primaryLink]}`;
}

/**
 * Four-column lineage explorer: Trends → Directives (leads + trees) → Decisions
 * (executions + verification) → Queue (dead letters). Click-to-highlight ancestry.
 */
function LineageView(props: {
  trends: TrendRow[];
  leads: LeadRow[];
  trees: TreeRow[];
  executions: ExecutionRow[];
  verifications: VerificationRow[];
  pendingJobs: PendingJobRow[];
  deadJobs: DeadJobRow[];
  moduleName: (id: string) => string;
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  condensed?: boolean;
}) {
  const known = new Set<string>();
  for (const t of props.trends) known.add(t.symbol.toUpperCase());
  for (const l of props.leads) known.add(l.symbol.toUpperCase());
  for (const tr of props.trees) known.add(tr.symbol.toUpperCase());

  const ctx = props.selectedKey
    ? buildLineageContext(props.selectedKey, {
        trends: props.trends,
        leads: props.leads,
        trees: props.trees,
        executions: props.executions,
        deadJobs: props.deadJobs,
        pendingJobs: props.pendingJobs,
        knownSymbols: known,
      })
    : null;

  function rowClass(key: string, linked: boolean): string {
    const base =
      'w-full rounded px-1.5 py-1 text-left text-[11px] hover:bg-[var(--color-surface-2)]';
    if (props.selectedKey === key) {
      return `${base} bg-[var(--color-accent)]/15 ring-1 ring-[var(--color-accent)]`;
    }
    if (linked) {
      return `${base} bg-[var(--color-surface-2)]/80 ring-1 ring-[var(--color-line)]`;
    }
    return base;
  }

  function toggleKey(key: string) {
    props.onSelectKey(props.selectedKey === key ? null : key);
  }

  const sortedTrends = [...props.trends].sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
  );
  const sortedLeads = [...props.leads].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const sortedTrees = [...props.trees].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const sortedExecutions = [...props.executions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const sortedDead = [...props.deadJobs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const sortedPending = [...props.pendingJobs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  if (props.condensed) {
    type LineageItem = { key: string; primary: string; secondary: string; section: string };
    const sections: { id: string; label: string; items: LineageItem[] }[] = [
      {
        id: 'trends',
        label: 'Trends',
        items: sortedTrends.map((t) => ({
          key: `trend:${t.id}`,
          section: 'trends',
          primary: `${t.symbol} · ${t.direction}`,
          secondary: `${t.status} · ${props.moduleName(t.moduleId)}`,
        })),
      },
      {
        id: 'directives',
        label: 'Leads / trees',
        items: [
          ...sortedLeads.map((l) => ({
            key: `lead:${l.id}`,
            section: 'directives',
            primary: `${l.symbol} · ${l.status}`,
            secondary: `Lead · ${l.strategyFamily} · ${props.moduleName(l.moduleId)}`,
          })),
          ...sortedTrees.map((tr) => ({
            key: `tree:${tr.id}`,
            section: 'directives',
            primary: `${tr.symbol} · ${tr.status}`,
            secondary: `Tree · ${props.moduleName(tr.moduleId)}`,
          })),
        ],
      },
      {
        id: 'exec',
        label: 'Executions',
        items: sortedExecutions.map((e) => ({
          key: `exec:${e.id}`,
          section: 'exec',
          primary: e.outcome,
          secondary: `${e.description ?? e.venue} · ${props.moduleName(e.moduleId)}`,
        })),
      },
      {
        id: 'queue',
        label: 'Queue',
        items: [
          ...sortedPending.map((j) => ({
            key: `pending:${j.id}`,
            section: 'queue',
            primary: `${j.kind} · ${j.status}`,
            secondary: j.moduleId ? props.moduleName(j.moduleId) : 'company scope',
          })),
          ...sortedDead.map((j) => ({
            key: `dead:${j.id}`,
            section: 'queue',
            primary: `Dead · ${j.kind}`,
            secondary: j.lastError ?? (j.moduleId ? props.moduleName(j.moduleId) : 'company scope'),
          })),
        ],
      },
    ];
    const total = sections.reduce((n, s) => n + s.items.length, 0);
    if (total === 0) {
      return <CondensedEmpty>No lineage rows in this engine scope.</CondensedEmpty>;
    }
    let remaining = CONDENSED_LIST_CAP;
    return (
      <div>
        {sections.map((section) => {
          if (section.items.length === 0 || remaining <= 0) return null;
          const take = section.items.slice(0, remaining);
          remaining -= take.length;
          return (
            <div key={section.id} className="mb-2 last:mb-0">
              <CondensedSection label={section.label} count={section.items.length} />
              {take.map((item) => (
                <CondensedRow
                  key={item.key}
                  primary={item.primary}
                  secondary={item.secondary}
                  active={props.selectedKey === item.key}
                  onClick={() => toggleKey(item.key)}
                />
              ))}
            </div>
          );
        })}
        <CondensedMore shown={Math.min(CONDENSED_LIST_CAP, total)} total={total} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      {ctx && (
        <p className="shrink-0 text-[10px] text-[var(--color-ink-faint)]">{lineageCaption(ctx)}</p>
      )}
      <div
        data-testid="bottom-lineage-columns"
        className="grid min-h-0 flex-1 grid-cols-4 gap-2 overflow-x-auto"
      >
        <LineageColumn title="Trends">
          {sortedTrends.length === 0 ? (
            <p className="px-1 py-2 text-[10px] text-[var(--color-ink-faint)]">No trends.</p>
          ) : (
            sortedTrends.map((t) => {
              const key = `trend:${t.id}`;
              const linked = ctx
                ? isLineageLinked(ctx, {
                    kind: 'trend',
                    id: t.id,
                    moduleId: t.moduleId,
                    symbol: t.symbol,
                  })
                : false;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleKey(key)}
                  className={rowClass(key, linked)}
                  aria-pressed={props.selectedKey === key}
                >
                  <span className="font-mono">{t.symbol}</span>{' '}
                  <span className="capitalize" style={{ color: toneFor(t.direction) }}>
                    {t.direction}
                  </span>
                  <div className="text-[10px] text-[var(--color-ink-faint)]">
                    {t.strengthBand} · {props.moduleName(t.moduleId)}
                  </div>
                </button>
              );
            })
          )}
        </LineageColumn>

        <LineageColumn title="Directives (leads + trees)">
          {sortedLeads.length === 0 && sortedTrees.length === 0 ? (
            <p className="px-1 py-2 text-[10px] text-[var(--color-ink-faint)]">
              No leads or trees.
            </p>
          ) : (
            <>
              {sortedLeads.map((l) => {
                const key = `lead:${l.id}`;
                const linked = ctx
                  ? isLineageLinked(ctx, {
                      kind: 'lead',
                      id: l.id,
                      moduleId: l.moduleId,
                      symbol: l.symbol,
                      trendId: l.trendId,
                    })
                  : false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleKey(key)}
                    className={rowClass(key, linked)}
                    aria-pressed={props.selectedKey === key}
                  >
                    <span className="text-[9px] uppercase text-[var(--color-ink-faint)]">lead</span>{' '}
                    <span className="font-mono">{l.symbol}</span>{' '}
                    <span style={{ color: LEAD_STATUS_TONE[l.status] }}>{l.status}</span>
                    <div className="text-[10px] text-[var(--color-ink-faint)]">
                      {l.strategyFamily} · {props.moduleName(l.moduleId)}
                    </div>
                  </button>
                );
              })}
              {sortedTrees.map((tr) => {
                const key = `tree:${tr.id}`;
                const linked = ctx
                  ? isLineageLinked(ctx, {
                      kind: 'tree',
                      id: tr.id,
                      moduleId: tr.moduleId,
                      symbol: tr.symbol,
                      leadId: tr.leadId,
                    })
                  : false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleKey(key)}
                    className={rowClass(key, linked)}
                    aria-pressed={props.selectedKey === key}
                  >
                    <span className="text-[9px] uppercase text-[var(--color-ink-faint)]">tree</span>{' '}
                    <span className="font-mono">{tr.symbol}</span>{' '}
                    <span style={{ color: TREE_STATUS_TONE[tr.status] }}>
                      {tr.status.replace(/_/g, ' ')}
                    </span>
                    <div className="text-[10px] text-[var(--color-ink-faint)]">
                      {tr.branches.length} branches · {props.moduleName(tr.moduleId)}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </LineageColumn>

        <LineageColumn title="Decisions">
          {sortedExecutions.length === 0 ? (
            <p className="px-1 py-2 text-[10px] text-[var(--color-ink-faint)]">
              No executions yet.
            </p>
          ) : (
            sortedExecutions.map((e) => {
              const key = `execution:${e.id}`;
              const v = props.verifications.find((x) => x.traceId === e.id);
              const honesty = simHonestyChips(e.simulatorGapTags);
              const linked = ctx
                ? isLineageLinked(ctx, {
                    kind: 'execution',
                    id: e.id,
                    moduleId: e.moduleId,
                    leadId: e.leadId,
                    description: e.description,
                  })
                : false;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleKey(key)}
                  className={rowClass(key, linked)}
                  aria-pressed={props.selectedKey === key}
                >
                  <span className="capitalize" style={{ color: toneFor(e.outcome) }}>
                    {e.outcome}
                  </span>
                  {v && (
                    <span className="ml-1" style={{ color: toneFor(v.result) }}>
                      · verify {v.result}
                    </span>
                  )}
                  <div className="truncate text-[10px] text-[var(--color-ink-faint)]">
                    {e.description ?? e.failureCode ?? `${e.venue} · ${e.mode}`}
                  </div>
                  <div className="text-[10px] text-[var(--color-ink-faint)]">
                    {props.moduleName(e.moduleId)}
                  </div>
                  {honesty.length > 0 && (
                    <div
                      className="mt-0.5 flex flex-wrap gap-1"
                      data-testid="lineage-honesty-chips"
                      aria-label={`Simulation honesty: ${honesty.map((c) => c.label).join(', ')}`}
                    >
                      {honesty.map((chip) => (
                        <span
                          key={chip.kind}
                          className="rounded border border-[var(--color-line)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
                        >
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </LineageColumn>

        <LineageColumn title="Queue">
          <p className="px-1 pb-1 text-[9px] text-[var(--color-ink-faint)]">
            Pending / active jobs first; dead letters below.
          </p>
          {sortedPending.length === 0 && sortedDead.length === 0 ? (
            <p className="px-1 py-2 text-[10px] text-[var(--color-ink-faint)]">
              No queued or failed instructions.
            </p>
          ) : (
            <>
              {sortedPending.map((j) => {
                const key = `pending:${j.id}`;
                const linked = ctx
                  ? isLineageLinked(ctx, {
                      kind: 'pending',
                      id: j.id,
                      moduleId: j.moduleId,
                    })
                  : false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleKey(key)}
                    className={rowClass(key, linked)}
                    aria-pressed={props.selectedKey === key}
                  >
                    <span className="font-mono text-[10px]">{j.kind}</span>{' '}
                    <span style={{ color: 'var(--color-accent)' }}>{j.status}</span>
                    <div className="truncate text-[10px] text-[var(--color-ink-faint)]">
                      {j.queueClass}
                    </div>
                    <div className="text-[10px] text-[var(--color-ink-faint)]">
                      {j.moduleId ? props.moduleName(j.moduleId) : 'company scope'} · {j.attempts}{' '}
                      attempts
                    </div>
                  </button>
                );
              })}
              {sortedDead.map((j) => {
                const key = `dead:${j.id}`;
                const linked = ctx
                  ? isLineageLinked(ctx, {
                      kind: 'dead',
                      id: j.id,
                      moduleId: j.moduleId,
                    })
                  : false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleKey(key)}
                    className={rowClass(key, linked)}
                    aria-pressed={props.selectedKey === key}
                  >
                    <span className="font-mono text-[10px]">{j.kind}</span>{' '}
                    <span className="text-[var(--color-block)]">failed</span>
                    <div className="truncate text-[10px] text-[var(--color-ink-faint)]">
                      {j.lastError ?? j.queueClass}
                    </div>
                    <div className="text-[10px] text-[var(--color-ink-faint)]">
                      {j.moduleId ? props.moduleName(j.moduleId) : 'company scope'} · {j.attempts}{' '}
                      attempts
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </LineageColumn>
      </div>
    </div>
  );
}

function LineageColumn(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-[9rem] flex-col overflow-hidden rounded border border-[var(--color-line)]">
      <div className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">
        <Justification
          sourceClass="derived"
          block
          lines={[
            'Deterministic join across trends, leads, trees, executions, verifications, and dead letters.',
            'Column groups entities by pipeline stage — no model interpretation.',
          ]}
        >
          {props.title}
        </Justification>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">{props.children}</div>
    </div>
  );
}

function DeadLettersView(props: {
  companyId: string;
  jobs: DeadJobRow[];
  moduleName: (id: string) => string;
  onRefetch: () => Promise<void>;
  condensed?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(props.jobs.map((j) => j.id)) : new Set());
  }

  async function retry(jobId: string) {
    setBusyId(jobId);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/jobs/dead/${jobId}/retry`, {
        method: 'POST',
      });
      await props.onRefetch();
      setMessage('Dead letter re-queued.');
    } finally {
      setBusyId(null);
    }
  }

  async function bulkRetry() {
    const jobIds = [...selected].slice(0, 20);
    if (jobIds.length === 0) return;
    setBulkBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/jobs/dead`, {
        method: 'POST',
        body: { jobIds },
      });
      setSelected(new Set());
      await props.onRefetch();
      setMessage(`Re-queued ${jobIds.length} dead letter${jobIds.length === 1 ? '' : 's'}.`);
    } catch {
      setMessage('Bulk retry failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  if (props.jobs.length === 0) {
    return (
      <p className="py-3 text-xs text-[var(--color-ink-faint)]">
        No dead-letter jobs for this company.
      </p>
    );
  }

  if (props.condensed) {
    const { shown, total } = takeCondensed(props.jobs);
    return (
      <div>
        {message ? (
          <p className="mb-1 text-[10px] text-[var(--color-ink-faint)]">{message}</p>
        ) : null}
        {shown.map((j) => (
          <div key={j.id} className="border-b border-[var(--color-line)] py-1.5 last:border-b-0">
            <CondensedRow
              primary={j.kind}
              secondary={`${j.moduleId ? props.moduleName(j.moduleId) : '—'} · ${j.lastError ?? 'no error text'}`}
              meta={`${j.attempts}×`}
            />
            <button
              type="button"
              disabled={busyId !== null || bulkBusy}
              onClick={() => void retry(j.id)}
              className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-accent)] hover:underline disabled:opacity-50"
            >
              {busyId === j.id ? '…' : 'Retry'}
            </button>
          </div>
        ))}
        <CondensedMore shown={shown.length} total={total} />
      </div>
    );
  }

  const allSelected = selected.size === props.jobs.length && props.jobs.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-dim)]">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => toggleAll(e.target.checked)}
            aria-label="Select all dead letters"
          />
          Select all
        </label>
        <button
          type="button"
          disabled={bulkBusy || selected.size === 0}
          onClick={() => void bulkRetry()}
          className="rounded border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {bulkBusy ? 'Retrying…' : `Retry selected (${selected.size})`}
        </button>
      </div>
      {message && <p className="text-[10px] text-[var(--color-ink-faint)]">{message}</p>}
      <Table
        head={['', 'Kind', 'Module', 'Queue', 'Error', 'Attempts', 'Updated', '']}
        rows={props.jobs.map((j) => [
          <input
            key="c"
            type="checkbox"
            checked={selected.has(j.id)}
            onChange={(e) => toggle(j.id, e.target.checked)}
            aria-label={`Select dead letter ${j.kind}`}
          />,
          <span key="k" className="font-mono text-[10px]">
            {j.kind}
          </span>,
          <span key="m" className="font-mono text-[10px]">
            {j.moduleId ? props.moduleName(j.moduleId) : '—'}
          </span>,
          j.queueClass,
          <span key="e" className="block max-w-xs truncate" title={j.lastError ?? ''}>
            {j.lastError ?? '—'}
          </span>,
          String(j.attempts),
          new Date(j.updatedAt).toLocaleTimeString(),
          <button
            key="r"
            type="button"
            disabled={busyId !== null || bulkBusy}
            onClick={() => void retry(j.id)}
            className="rounded border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
          >
            {busyId === j.id ? '…' : 'Retry'}
          </button>,
        ])}
        empty="No dead-letter jobs for this company."
      />
    </div>
  );
}
