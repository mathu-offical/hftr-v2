/**
 * Stage node → number traces (D-186).
 * Shows how Model-group nodes transform into operator-facing numeric readouts —
 * not status/operation tapes.
 */

import type { MarketHubResponse } from '@hftr/contracts';
import {
  resolveStageScreenId,
  type MarketPostureStageScreenId,
} from './market-posture-stage-screens';
import { buildRootUserCapitalView } from './market-posture-root-capital';

export type StageNodeNumberStep = {
  id: string;
  /** Model / hydration node id when known. */
  nodeId: string;
  nodeLabel: string;
  /** How the node becomes a number. */
  transform: string;
  /** Actual numeric readout (dollars, counts, bps). */
  valueLabel: string;
  /** Optional formula orientation. */
  formula: string | null;
};

const MAX_STEPS = 40;

function dollars(cents: number | string | null | undefined): string {
  if (cents == null) return '—';
  const n = typeof cents === 'string' ? Number(cents) : cents;
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 100).toFixed(2)}`;
}

function parseCents(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Live lane is active when credential-ready and contributing or canvas-bound. */
export function isActiveLiveLane(
  lane: { status: string; contributed: boolean; kind: string },
  live: { kind: string; canvasBoundCount: number; status: string } | undefined,
): boolean {
  if (lane.status !== 'ready') return false;
  if (live && live.status !== 'ready' && live.status !== 'public') return false;
  const bound = live?.canvasBoundCount ?? 0;
  return lane.contributed || bound > 0;
}

/** Adapter / process flow is active when ready/public or contributed. */
export function isActivePipelineStatus(
  status: string,
  contributed?: boolean,
): boolean {
  if (contributed) return true;
  return status === 'ready' || status === 'public';
}

function push(
  steps: StageNodeNumberStep[],
  step: StageNodeNumberStep,
): void {
  if (steps.length >= MAX_STEPS) return;
  steps.push(step);
}

/**
 * Build node→number traces for a stage screen from hub hydration.
 * When `graphNodes` is provided (strip Model), every content node on this
 * screen gets an emission if hub traces did not already cover its id.
 */
export function buildStageNodeNumberFlow(
  screenId: MarketPostureStageScreenId,
  hub: MarketHubResponse,
  graphNodes?: ReadonlyArray<{
    id: string;
    data: {
      label: string;
      operation: string;
      amount: string;
      nodeRole: string;
      stageScreenId?: string | null;
      stageId?: string | null;
      panelSurfaceId?: string | null;
    };
  }>,
): StageNodeNumberStep[] {
  const steps: StageNodeNumberStep[] = [];
  const hydration = hub.modelHydration ?? null;

  switch (screenId) {
    case 'capital': {
      const view = buildRootUserCapitalView(hub);
      if (view.companyPool) {
        const cents =
          parseCents(view.companyPool.allocationCents) ??
          parseCents(view.companyPool.ledgerBalanceCents);
        push(steps, {
          id: 'pool',
          nodeId: `capital:${view.companyPool.id}`,
          nodeLabel: view.companyPool.name,
          transform: 'resolve pool allocation',
          valueLabel: dollars(cents),
          formula: 'company_pool.allocationCents',
        });
      }
      for (const f of view.rootHoldingFunds) {
        const cents =
          parseCents(f.allocationCents) ?? parseCents(f.ledgerBalanceCents);
        push(steps, {
          id: `hold:${f.id}`,
          nodeId: `capital:${f.id}`,
          nodeLabel: f.name,
          transform: 'holding ledger → dollars',
          valueLabel: dollars(cents),
          formula:
            f.allocationShareBps != null
              ? `share ${(f.allocationShareBps / 100).toFixed(1)}% of pool`
              : 'ledgerBalanceCents',
        });
      }
      for (const g of view.engineGroups) {
        push(steps, {
          id: `eng:${g.key}`,
          nodeId: `capital:engine:${g.key}`,
          nodeLabel: g.label,
          transform: 'sum desk allocations',
          valueLabel: dollars(g.allocationCentsTotal),
          formula: `${g.desks.length} desk(s)`,
        });
        for (const d of g.desks.slice(0, 4)) {
          push(steps, {
            id: `desk:${d.id}`,
            nodeId: `capital:${d.id}`,
            nodeLabel: d.name,
            transform: 'engine desk split',
            valueLabel: dollars(d.allocationCents ?? d.ledgerBalanceCents),
            formula: g.label,
          });
        }
      }
      let book = 0;
      for (const p of hub.positions) {
        const qty = Number(p.qty);
        const mark = parseCents(p.markCents) ?? 0;
        const notional =
          Number.isFinite(qty) && mark ? Math.round(Math.abs(qty) * mark) : 0;
        book += notional;
        push(steps, {
          id: `pos:${p.id}`,
          nodeId: `capital:pos:${p.symbol}`,
          nodeLabel: p.symbol,
          transform: 'qty × mark',
          valueLabel: dollars(notional),
          formula: `${p.qty} × ${dollars(p.markCents)}`,
        });
      }
      if (hub.positions.length > 0) {
        push(steps, {
          id: 'book-total',
          nodeId: 'capital:book',
          nodeLabel: 'Open book',
          transform: 'Σ position notionals',
          valueLabel: dollars(book),
          formula: `${hub.positions.length} positions`,
        });
      }
      push(steps, {
        id: 'equity',
        nodeId: 'capital:equity',
        nodeLabel: 'Master equity',
        transform: 'ledger balance-after',
        valueLabel: dollars(hub.equity.equityCents),
        formula: hub.equity.series.length
          ? `${hub.equity.series.length} path pts`
          : null,
      });
      break;
    }
    case 'library': {
      if (hub.sectorFocuses.length > 0) {
        push(steps, {
          id: 'lib-sectors',
          nodeId: 'lib:sectors',
          nodeLabel: 'Sector constants',
          transform: 'seed sector lenses',
          valueLabel: String(hub.sectorFocuses.length),
          formula: hub.sectorFocuses.slice(0, 4).join(' · '),
        });
      }
      if (hub.universeExcludes.length > 0) {
        push(steps, {
          id: 'lib-excludes',
          nodeId: 'lib:excludes',
          nodeLabel: 'Universe excludes',
          transform: 'filter universe symbols',
          valueLabel: String(hub.universeExcludes.length),
          formula: hub.universeExcludes.slice(0, 6).join(', '),
        });
      }
      for (const lib of hydration?.librarySources ?? []) {
        push(steps, {
          id: `lib:${lib.id}`,
          nodeId: `lib:${lib.id}`,
          nodeLabel: lib.name,
          transform: 'admit corpus → ranges',
          valueLabel: `${lib.admittedCount} / ${lib.conceptCount}`,
          formula: `${lib.shelf} · ${((lib.admittedCount / Math.max(lib.conceptCount, 1)) * 100).toFixed(0)}% admitted · ${lib.topicScope}`,
        });
      }
      for (const p of hub.positions) {
        const qty = Number(p.qty);
        const mark = parseCents(p.markCents) ?? 0;
        const cost = parseCents(p.avgCostCents) ?? 0;
        const notional =
          Number.isFinite(qty) && mark ? Math.round(Math.abs(qty) * mark) : 0;
        const costBasis =
          Number.isFinite(qty) && cost ? Math.round(Math.abs(qty) * cost) : 0;
        push(steps, {
          id: `libpos:${p.id}`,
          nodeId: `lib:pos:${p.symbol}`,
          nodeLabel: p.symbol,
          transform: 'held mark / cost → positioning',
          valueLabel: `${dollars(notional)} / ${dollars(costBasis)}`,
          formula: `uPnL ${dollars(p.unrealizedPnlCents)} · vsCost ${p.viz?.heldVsCost ?? '—'}`,
        });
      }
      break;
    }
    case 'live': {
      const liveSources = hydration?.liveSources ?? [];
      for (const lane of hub.sources.lanes) {
        const live = liveSources.find((s) => s.kind === lane.kind);
        if (!isActiveLiveLane(lane, live)) continue;
        const bound = live?.canvasBoundCount ?? 0;
        push(steps, {
          id: `lane:${lane.kind}`,
          nodeId: `live:${lane.kind}`,
          nodeLabel: lane.label,
          transform: 'query/filter → entitle',
          valueLabel: live?.amount ?? (lane.contributed ? '1 contrib' : `${bound} bound`),
          formula: `${lane.domain} · ${live?.operation ?? lane.authMode} · ${bound} canvas`,
        });
      }
      for (const f of hydration?.processingFlows ?? []) {
        if (!isActivePipelineStatus(f.status, f.contributed)) continue;
        push(steps, {
          id: `flow:${f.id}`,
          nodeId: `adapter:${f.id}`,
          nodeLabel: f.adapterLabel,
          transform: 'API → normalize route',
          valueLabel: f.amount,
          formula: f.route
            ? `${f.route} · vars ${f.analysisRoles.join(',') || '—'}`
            : f.analysisRoles.join(',') || null,
        });
      }
      const normalizeSteps = (hydration?.processSteps ?? []).filter(
        (s) =>
          isActivePipelineStatus(s.status) &&
          (s.processFunction === 'normalize' ||
            s.processFunction === 'extract' ||
            s.processFunction === 'fetch'),
      );
      for (const s of normalizeSteps.slice(0, 6)) {
        push(steps, {
          id: `norm:${s.id}`,
          nodeId: `process:${s.id}`,
          nodeLabel: s.label,
          transform: `${s.processFunction} → system var`,
          valueLabel: s.amount,
          formula: `${s.route} · ${s.analysisRole ?? s.operation}`,
        });
      }
      const activeLanes = hub.sources.lanes.filter((l) =>
        isActiveLiveLane(
          l,
          liveSources.find((s) => s.kind === l.kind),
        ),
      );
      const roleSet = new Set<string>();
      for (const f of hydration?.processingFlows ?? []) {
        if (!isActivePipelineStatus(f.status, f.contributed)) continue;
        for (const r of f.analysisRoles) roleSet.add(r);
      }
      if (activeLanes.length > 0 || roleSet.size > 0) {
        push(steps, {
          id: 'live-roll',
          nodeId: 'live:rollup',
          nodeLabel: 'System variables',
          transform: 'roles from active normalize',
          valueLabel: `${roleSet.size} vars · ${activeLanes.length} sources`,
          formula: [...roleSet].slice(0, 6).join(',') || `mark ${hub.sources.markFeedClass}`,
        });
      }
      break;
    }
    case 'process': {
      for (const s of (hydration?.processSteps ?? []).slice(0, 12)) {
        if (!isActivePipelineStatus(s.status)) continue;
        push(steps, {
          id: `step:${s.id}`,
          nodeId: `process:${s.id}`,
          nodeLabel: s.label,
          transform: `${s.processFunction}(${s.route})`,
          valueLabel: s.amount,
          formula: s.operation,
        });
      }
      const aw = hub.awarenessAnalysis;
      if (aw) {
        push(steps, {
          id: 'links-count',
          nodeId: 'process:links',
          nodeLabel: 'Market↔news↔library links',
          transform: 'count projected edges',
          valueLabel: String(aw.links.length),
          formula: `${aw.evidence.length} evidence · ${aw.trends.length} tagged trends`,
        });
        for (const link of aw.links.slice(0, 4)) {
          push(steps, {
            id: `lnk:${link.id}`,
            nodeId: `process:link:${link.id}`,
            nodeLabel: `${link.fromLabel} → ${link.toId}`,
            transform: `${link.fromKind}→${link.toKind} strength`,
            valueLabel: link.strengthBand,
            formula: null,
          });
        }
        for (const t of aw.trends.slice(0, 4)) {
          push(steps, {
            id: `tr:${t.id}`,
            nodeId: `process:trend:${t.id}`,
            nodeLabel: `$${t.symbol}`,
            transform: 'emit tagged trend',
            valueLabel: t.linkStrengthBand ?? t.status,
            formula: t.label ?? null,
          });
        }
      }
      for (const op of (hydration?.stageOps ?? []).filter(
        (s) => s.stageId === 'thresholds' || s.stageId === 'defaults',
      )) {
        push(steps, {
          id: `limit:${op.stageId}`,
          nodeId: `process:${op.stageId}`,
          nodeLabel: op.stageId,
          transform: 'limit / default band',
          valueLabel: op.amount,
          formula: op.operation,
        });
      }
      for (const p of hub.positions.slice(0, 6)) {
        const qty = Number(p.qty);
        const cost = parseCents(p.avgCostCents) ?? 0;
        const basis =
          Number.isFinite(qty) && cost ? Math.round(Math.abs(qty) * cost) : 0;
        push(steps, {
          id: `cost:${p.id}`,
          nodeId: `process:cost:${p.symbol}`,
          nodeLabel: p.symbol,
          transform: 'qty × avgCost',
          valueLabel: dollars(basis),
          formula: `mark ${dollars(p.markCents)} · uPnL ${dollars(p.unrealizedPnlCents)}`,
        });
      }
      break;
    }
    case 'outlook': {
      const watched = hub.watchlists.filter(
        (w) =>
          w.status === 'watching' ||
          w.status === 'suggested_verified' ||
          w.status === 'suggested_search',
      );
      push(steps, {
        id: 'watch-n',
        nodeId: 'outlook:watch',
        nodeLabel: 'Watched symbols',
        transform: 'count watch + suggested',
        valueLabel: String(watched.length),
        formula: `${hub.movers.items.length} sealed movers · ${hub.news.items.length} news`,
      });
      for (const w of watched.slice(0, 6)) {
        push(steps, {
          id: `w:${w.id}`,
          nodeId: `outlook:w:${w.symbol}`,
          nodeLabel: `$${w.symbol}`,
          transform: 'mark / heldVsCost outlook',
          valueLabel: w.viz?.heldVsCost ?? w.status,
          formula: [
            w.bias,
            w.viz?.direction,
            w.viz?.spark?.feedClass,
          ]
            .filter(Boolean)
            .join(' · '),
        });
      }
      const bandCounts = new Map<string, number>();
      for (const item of hub.movers.items) {
        const d = item.directionBand ?? 'unset';
        bandCounts.set(d, (bandCounts.get(d) ?? 0) + 1);
      }
      push(steps, {
        id: 'movers-dir',
        nodeId: 'outlook:movers:dirs',
        nodeLabel: 'Sealed direction bands',
        transform: 'tally sealed directions',
        valueLabel:
          [...bandCounts.entries()]
            .map(([k, v]) => `${k}:${v}`)
            .join(' ') || '0',
        formula: hub.movers.corroborationBand
          ? `corroboration ${hub.movers.corroborationBand}`
          : null,
      });
      push(steps, {
        id: 'reports-n',
        nodeId: 'outlook:reports',
        nodeLabel: 'Phase reports',
        transform: 'count sealed reports',
        valueLabel: String(hub.reports.length),
        formula: null,
      });
      break;
    }
    case 'day': {
      const actionN = hub.watchlists.filter(
        (w) =>
          w.status === 'suggested_search' ||
          w.status === 'suggested_verified' ||
          w.status === 'watching',
      ).length;
      push(steps, {
        id: 'day-topics',
        nodeId: 'day:topics',
        nodeLabel: 'Research topics',
        transform: 'sector lenses + report kinds',
        valueLabel: `${hub.sectorFocuses.length} sectors · ${hub.reports.length} reports`,
        formula: hub.sectorFocuses.slice(0, 3).join(' · ') || null,
      });
      push(steps, {
        id: 'day-move',
        nodeId: 'day:movements',
        nodeLabel: 'Movements',
        transform: 'sealed mover count',
        valueLabel: String(hub.movers.items.length),
        formula: null,
      });
      push(steps, {
        id: 'day-act',
        nodeId: 'day:actions',
        nodeLabel: 'Day actions',
        transform: 'suggested + watching + plans',
        valueLabel: `${actionN} watch · ${hub.pipeline.length} plans`,
        formula: null,
      });
      push(steps, {
        id: 'day-tr',
        nodeId: 'day:trends',
        nodeLabel: 'Daily trends',
        transform: 'candidate count',
        valueLabel: String(hub.trendCandidates.length),
        formula: null,
      });
      const strength = { weak: 0, moderate: 0, strong: 0 };
      for (const t of hub.trendCandidates) {
        if (t.strengthBand === 'weak' || t.strengthBand === 'moderate' || t.strengthBand === 'strong') {
          strength[t.strengthBand] += 1;
        }
      }
      push(steps, {
        id: 'day-tr-str',
        nodeId: 'day:trends:strength',
        nodeLabel: 'Trend strength mix',
        transform: 'tally strength bands',
        valueLabel: `w${strength.weak} m${strength.moderate} s${strength.strong}`,
        formula: null,
      });
      break;
    }
    default: {
      const _exhaustive: never = screenId;
      return _exhaustive;
    }
  }

  if (graphNodes && graphNodes.length > 0) {
    const covered = new Set(steps.map((s) => s.nodeId));
    for (const n of graphNodes) {
      if (n.data.nodeRole === 'screen_group' || n.data.nodeRole === 'lane_label') {
        continue;
      }
      const sid =
        (n.data.stageScreenId as MarketPostureStageScreenId | null | undefined) ??
        resolveStageScreenId({
          nodeId: n.id,
          nodeRole: n.data.nodeRole,
          stageId: n.data.stageId ?? null,
          panelSurfaceId: n.data.panelSurfaceId ?? null,
        });
      if (sid !== screenId) continue;
      if (covered.has(n.id)) continue;
      covered.add(n.id);
      push(steps, {
        id: `graph:${n.id}`,
        nodeId: n.id,
        nodeLabel: n.data.label,
        transform: `${n.data.nodeRole.replace(/_/g, ' ')} → emission`,
        valueLabel: n.data.amount,
        formula: n.data.operation || null,
      });
    }
  }

  return steps;
}
