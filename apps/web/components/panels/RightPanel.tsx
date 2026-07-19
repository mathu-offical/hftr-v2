'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import {
  balanceLabel,
  executionCapitalChip,
  normalizeCapitalMode,
  type CapitalMode,
} from '@/lib/capital-mode-label';
import { simHonestyChips } from '@/lib/sim-honesty-label';
import { ACTIVITY_REFRESH_EVENT } from '../canvas/PaperTradeForm';
import { VALUE_LINEAGE_FOCUS_EVENT, type ValueLineageFocusDetail } from '@/lib/value-lineage-focus';
import { dollars, scaled, toneFor } from './format';
import { Justification } from './Justification';
import { PanelTabs } from './PanelTabs';
import { PanelEdgeRail } from './PanelEdgeRail';
import { usePanelShell } from '@/components/panels/PanelShellContext';
import {
  InlineLoadingStrip,
  ShimmerBlock,
} from '@/components/shell/LoadingChrome';
import { PositionsTab } from './PositionsTab';
import { AssistantDock } from '@/components/assistant/AssistantDock';
import {
  Briefcase,
  FlaskConical,
  Hash,
  ListOrdered,
  MessageSquare,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

type Tab = 'verification' | 'executions' | 'positions' | 'ledger' | 'simulation' | 'values';
const TABS: { id: Tab; label: string }[] = [
  { id: 'verification', label: 'Verify' },
  { id: 'executions', label: 'Executions' },
  { id: 'positions', label: 'Positions' },
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
  leadId?: string | null;
  treeId?: string | null;
  simulatorGapTags?: string[];
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
 * Right panel (ui-ux spec): Verification, Executions, Positions (stability /
 * recovery / agent actions), Ledger, Simulation, and the Math value-store
 * audit. Read-only projections over append-only sources.
 */
export function RightPanel(props: { companyId: string; companyMode?: string }) {
  const companyMode = normalizeCapitalMode(props.companyMode);
  const storageKey = props.companyId ? `hftr:${props.companyId}:panel:right` : null;
  const panelShell = usePanelShell();
  const lastCollapseGenRef = useRef(0);
  const prevRightOpenRef = useRef(false);

  const [tab, setTab] = useState<Tab>('executions');
  /** D-200: default collapsed — chrome/rails paint without firing six APIs. */
  const [open, setOpen] = useState(false);
  /** D-146 / D-150: assistant is a layered floating overlay, not a RightPanel tab. */
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [persistReady, setPersistReady] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [values, setValues] = useState<ValueRow[]>([]);
  const [simulations, setSimulations] = useState<SimulationRow[]>([]);
  const [simComparison, setSimComparison] = useState<string | null>(null);
  const [focusedValueRef, setFocusedValueRef] = useState<string | null>(null);
  const [dataLoadState, setDataLoadState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [fieldLoading, setFieldLoading] = useState({
    ledger: false,
    executions: false,
    verifications: false,
    positions: false,
    values: false,
    simulations: false,
  });

  useEffect(() => {
    if (!storageKey) {
      setPersistReady(true);
      return;
    }
    const stored = readPanelState<{ open?: unknown; tab?: unknown; assistantOpen?: unknown }>(
      storageKey,
    );
    if (stored) {
      if (typeof stored.open === 'boolean') setOpen(stored.open);
      if (isRightTab(stored.tab)) setTab(stored.tab);
      if (typeof stored.assistantOpen === 'boolean') setAssistantOpen(stored.assistantOpen);
    }
    setPersistReady(true);
  }, [storageKey]);

  useEffect(() => {
    function onFocus(e: Event) {
      const detail = (e as CustomEvent<ValueLineageFocusDetail>).detail;
      if (!detail || detail.companyId !== props.companyId) return;
      setOpen(true);
      setTab('values');
      setFocusedValueRef(detail.valueRef);
      panelShell.notifyRightOpenedExplicit();
    }
    window.addEventListener(VALUE_LINEAGE_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(VALUE_LINEAGE_FOCUS_EVENT, onFocus);
  }, [props.companyId, panelShell.notifyRightOpenedExplicit]);

  useEffect(() => {
    if (!storageKey || !persistReady) return;
    writePanelState(storageKey, { open, tab, assistantOpen });
  }, [storageKey, open, tab, assistantOpen, persistReady]);

  // D-185: left open/interact requests collapse this panel.
  useEffect(() => {
    if (panelShell.rightCollapseGeneration === lastCollapseGenRef.current) return;
    lastCollapseGenRef.current = panelShell.rightCollapseGeneration;
    if (panelShell.rightCollapseGeneration > 0) setOpen(false);
  }, [panelShell.rightCollapseGeneration]);

  // Explicit open (tab / chevron / lineage) while left is open → layer on top.
  useEffect(() => {
    if (!persistReady) return;
    if (open && !prevRightOpenRef.current) {
      panelShell.notifyRightOpenedExplicit();
    }
    prevRightOpenRef.current = open;
  }, [open, persistReady, panelShell.notifyRightOpenedExplicit]);

  const selectRightTab = useCallback(
    (id: Tab) => {
      // Header tabs: re-click active collapses (rail handled in PanelEdgeRail).
      if (open && tab === id) {
        setOpen(false);
        return;
      }
      setTab(id);
      setOpen(true);
    },
    [open, tab],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ']' && !isEditableTarget(e)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && !isEditableTarget(e)) {
        if (assistantOpen) {
          setAssistantOpen(false);
          return;
        }
        if (open) setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, assistantOpen]);

  const load = useCallback(async () => {
    const base = `/api/companies/${props.companyId}`;
    const timed = <T,>(path: string) =>
      api<T>(path, { signal: AbortSignal.timeout(25_000) });
    setDataLoadState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    setFieldLoading({
      ledger: true,
      executions: true,
      verifications: true,
      positions: true,
      values: true,
      simulations: true,
    });

    // D-200: settle each slice independently so chrome stays up and fields fill in.
    const tasks: Promise<void>[] = [
      timed<{ balanceCents: string; ledger: LedgerRow[] }>(`${base}/activity?view=ledger`)
        .then((v) => {
          setBalance(v.balanceCents);
          setLedger(v.ledger);
        })
        .catch(() => undefined)
        .finally(() => setFieldLoading((f) => ({ ...f, ledger: false }))),
      timed<{ executions: ExecutionRow[] }>(`${base}/executions`)
        .then((v) => setExecutions(v.executions))
        .catch(() => undefined)
        .finally(() => setFieldLoading((f) => ({ ...f, executions: false }))),
      timed<{ verifications: VerificationRow[] }>(`${base}/verifications`)
        .then((v) => setVerifications(v.verifications))
        .catch(() => undefined)
        .finally(() => setFieldLoading((f) => ({ ...f, verifications: false }))),
      timed<{ positions: PositionRow[] }>(`${base}/positions`)
        .then((v) => setPositions(v.positions))
        .catch(() => undefined)
        .finally(() => setFieldLoading((f) => ({ ...f, positions: false }))),
      timed<{ values: ValueRow[] }>(`${base}/values`)
        .then((v) => setValues(v.values))
        .catch(() => undefined)
        .finally(() => setFieldLoading((f) => ({ ...f, values: false }))),
      timed<{ runs: SimulationRow[]; comparison?: { runIds: string[]; deltaSummary: string } }>(
        `${base}/simulations`,
      )
        .then((v) => {
          setSimulations(v.runs);
          setSimComparison(v.comparison?.deltaSummary ?? null);
        })
        .catch(() => undefined)
        .finally(() => setFieldLoading((f) => ({ ...f, simulations: false }))),
    ];

    await Promise.allSettled(tasks);
    setDataLoadState('ready');
  }, [props.companyId]);

  useEffect(() => {
    if (!open) return;
    void load();
    const interval = setInterval(load, 20_000);
    window.addEventListener(ACTIVITY_REFRESH_EVENT, load);
    return () => {
      clearInterval(interval);
      window.removeEventListener(ACTIVITY_REFRESH_EVENT, load);
    };
  }, [open, load]);

  const openPositionCount = positions.filter((p) => String(p.qty) !== '0').length;

  const rightRailMeta = (id: Tab): string | undefined => {
    const count =
      id === 'verification'
        ? verifications.length
        : id === 'executions'
          ? executions.length
          : id === 'positions'
            ? openPositionCount
            : id === 'ledger'
              ? ledger.length
              : id === 'simulation'
                ? simulations.length
                : values.length;
    return count > 0 ? String(count) : undefined;
  };

  // D-118 / D-123 / D-146 / D-150 / D-185: symbol rail + layered AST; right may overlay left.
  const layered = open && panelShell.rightLayered;

  const panelBody = (
    <>
      <div className="flex items-stretch border-b border-[var(--color-line)]">
        <PanelTabs
          aria-label="Info panel sections"
          className="min-w-0 flex-1"
          value={tab}
          onChange={selectRightTab}
          tabs={TABS.map((t) => ({
            id: t.id,
            label: t.label,
            meta: rightRailMeta(t.id),
          }))}
        />
      </div>

      <div
        className="border-b border-[var(--color-line)] px-4 py-2.5"
        data-testid="right-panel-paper-balance"
      >
        <div className="text-xs text-[var(--color-ink-dim)]">{balanceLabel(companyMode)}</div>
        <div className="font-mono text-lg">
          {fieldLoading.ledger && balance === null ? (
            <ShimmerBlock className="mt-1 h-7 w-28" />
          ) : balance ? (
            dollars(balance)
          ) : (
            '—'
          )}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 text-sm"
        aria-busy={dataLoadState === 'loading'}
      >
        {dataLoadState === 'loading' ? (
          <div className="mb-3" data-testid="right-panel-loading">
            <InlineLoadingStrip
              label="Info panel"
              detail="Updating executions, positions, and ledger"
            />
          </div>
        ) : null}
        {tab === 'verification' &&
          (fieldLoading.verifications && verifications.length === 0 ? (
            <InlineLoadingStrip label="Verify" detail="Fetching verification records" />
          ) : (
            <VerificationTab verifications={verifications} executions={executions} />
          ))}
        {tab === 'executions' &&
          (fieldLoading.executions && executions.length === 0 ? (
            <InlineLoadingStrip label="Executions" detail="Fetching recent fills" />
          ) : (
            <ExecutionsTab executions={executions} />
          ))}
        {tab === 'positions' &&
          (fieldLoading.positions && positions.length === 0 ? (
            <InlineLoadingStrip label="Positions" detail="Fetching open holdings" />
          ) : (
            <PositionsTab companyId={props.companyId} executions={executions} />
          ))}
        {tab === 'ledger' &&
          (fieldLoading.ledger && ledger.length === 0 && balance === null ? (
            <InlineLoadingStrip label="Ledger" detail="Fetching balance and entries" />
          ) : (
            <LedgerTab ledger={ledger} companyMode={companyMode} />
          ))}
        {tab === 'simulation' &&
          (fieldLoading.simulations && simulations.length === 0 ? (
            <InlineLoadingStrip label="Sims" detail="Fetching simulation runs" />
          ) : (
            <SimulationTab runs={simulations} comparisonSummary={simComparison} />
          ))}
        {tab === 'values' &&
          (fieldLoading.values && values.length === 0 ? (
            <InlineLoadingStrip label="Values" detail="Fetching value refs" />
          ) : (
            <ValuesTab
              companyId={props.companyId}
              values={values}
              focusedRef={focusedValueRef}
              onFocusedRefConsumed={() => setFocusedValueRef(null)}
            />
          ))}
      </div>
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 shrink-0">
      {open && !layered ? (
        <aside className="flex h-full min-h-0 w-96 shrink-0 flex-col overflow-hidden border-l border-[var(--color-line)] bg-[var(--color-surface-1)]">
          {panelBody}
        </aside>
      ) : null}

      <AssistantDock
        companyId={props.companyId}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
      />

      <PanelEdgeRail
        side="right"
        open={open}
        activeTab={tab}
        aria-label="Info panel sections"
        collapseLabel="Collapse info panel (keyboard shortcut ] or Escape)"
        expandLabel="Expand info panel (keyboard shortcut ])"
        onToggleOpen={() => setOpen((v) => !v)}
        onSelectTab={selectRightTab}
        items={[
          {
            id: 'verification',
            label: 'Verify',
            abbrev: 'VRF',
            icon: ShieldCheck,
            meta: rightRailMeta('verification'),
          },
          {
            id: 'executions',
            label: 'Executions',
            abbrev: 'EXE',
            icon: ListOrdered,
            meta: rightRailMeta('executions'),
          },
          {
            id: 'positions',
            label: 'Positions',
            abbrev: 'POS',
            icon: Briefcase,
            meta: rightRailMeta('positions'),
          },
          {
            id: 'ledger',
            label: 'Ledger',
            abbrev: 'LDG',
            icon: Wallet,
            meta: rightRailMeta('ledger'),
          },
          {
            id: 'simulation',
            label: 'Sims',
            abbrev: 'SIM',
            icon: FlaskConical,
            meta: rightRailMeta('simulation'),
          },
          {
            id: 'values',
            label: 'Values',
            abbrev: 'VAL',
            icon: Hash,
            meta: rightRailMeta('values'),
          },
        ]}
        railActions={[
          {
            id: 'assistant',
            label: 'Open read-only assistant',
            abbrev: 'AST',
            icon: MessageSquare,
            pressed: assistantOpen,
            onClick: () => setAssistantOpen((v) => !v),
          },
        ]}
      />

      {open && layered ? (
        <aside
          data-testid="right-panel-layered"
          className="absolute right-full top-0 z-[45] flex h-full w-96 flex-col overflow-hidden border-l border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-2xl"
          aria-label="Info panel (layered over left)"
        >
          {panelBody}
        </aside>
      ) : null}
    </div>
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
              <Justification
                sourceClass="deterministic_placeholder"
                lines={[
                  'Model-free verification against the immutable guardrail schema — no LLM below compile.',
                  `Result: ${v.result}.`,
                  ...(v.failureCode ? [`Failure code: ${v.failureCode}.`] : []),
                ]}
              >
                <span
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: toneFor(v.result) }}
                >
                  {v.result}
                </span>
              </Justification>
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
      {props.executions.map((e) => {
        const honesty = simHonestyChips(e.simulatorGapTags);
        return (
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
            {honesty.length > 0 && (
              <div
                className="mt-1.5 flex flex-wrap gap-1"
                data-testid="execution-honesty-chips"
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
            {e.amountCents && (
              <div className="mt-1 flex items-center gap-1.5 font-mono text-xs">
                <span
                  className="rounded border border-[var(--color-line)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
                  data-testid="execution-mode-chip"
                >
                  {executionCapitalChip(e.mode, e.venue)}
                </span>
                {dollars(e.amountCents)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LedgerTab(props: { ledger: LedgerRow[]; companyMode: CapitalMode }) {
  if (props.ledger.length === 0) return <Empty text="No ledger entries yet." />;
  const balPrefix = props.companyMode === 'live' ? 'live bal' : 'paper bal';
  return (
    <ul className="space-y-1.5">
      {props.ledger.map((l) => (
        <li key={l.id} className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono">{dollars(l.amountCents)}</span>
            <span className="text-[10px] text-[var(--color-ink-faint)]">
              {balPrefix} {dollars(l.balanceAfterCents)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--color-ink-dim)]">
            {l.description}
          </div>
        </li>
      ))}
    </ul>
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

function ValuesTab(props: {
  companyId: string;
  values: ValueRow[];
  focusedRef?: string | null;
  onFocusedRefConsumed?: () => void;
}) {
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

  useEffect(() => {
    if (!props.focusedRef) return;
    void loadLineage(props.focusedRef);
    props.onFocusedRefConsumed?.();
    // Intentionally only react to focusedRef changes from TraceTimeline deep links.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadLineage is stable enough for focus trigger
  }, [props.focusedRef, props.companyId]);

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
                <Justification
                  sourceClass={v.sourceClass}
                  lines={[
                    `Kind: ${v.kind}.`,
                    `Source id: ${v.sourceId}.`,
                    'Append-only ValueRef — scaled integer stored server-side; UI never invents raw digits.',
                  ]}
                >
                  <span className="font-mono text-xs">
                    {scaled(v.valueInt, v.scale)} {v.unit}
                  </span>
                </Justification>
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
