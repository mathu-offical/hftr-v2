/**
 * Stage node → number traces (D-186).
 * Shows how Model-group nodes transform into operator-facing numeric readouts —
 * not status/operation tapes.
 */

import type { MarketHubResponse } from '@hftr/contracts';
import type { MarketPostureStageScreenId } from './market-posture-stage-screens';
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

const MAX_STEPS = 18;

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

function push(
  steps: StageNodeNumberStep[],
  step: StageNodeNumberStep,
): void {
  if (steps.length >= MAX_STEPS) return;
  steps.push(step);
}

/**
 * Build node→number traces for a stage screen from hub hydration.
 */
export function buildStageNodeNumberFlow(
  screenId: MarketPostureStageScreenId,
  hub: MarketHubResponse,
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
      for (const lib of hydration?.librarySources ?? []) {
        push(steps, {
          id: `lib:${lib.id}`,
          nodeId: `lib:${lib.id}`,
          nodeLabel: lib.name,
          transform: 'admit corpus',
          valueLabel: `${lib.admittedCount} / ${lib.conceptCount}`,
          formula: `${lib.shelf} · ${((lib.admittedCount / Math.max(lib.conceptCount, 1)) * 100).toFixed(0)}% admitted`,
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
          transform: 'held mark / cost basis',
          valueLabel: `${dollars(notional)} / ${dollars(costBasis)}`,
          formula: `uPnL ${dollars(p.unrealizedPnlCents)}`,
        });
      }
      break;
    }
    case 'live': {
      for (const lane of hub.sources.lanes) {
        const live = (hydration?.liveSources ?? []).find((s) => s.kind === lane.kind);
        const bound = live?.canvasBoundCount ?? 0;
        push(steps, {
          id: `lane:${lane.kind}`,
          nodeId: `live:${lane.kind}`,
          nodeLabel: lane.label,
          transform: lane.contributed
            ? 'filter → seal contribution'
            : 'entitle lane',
          valueLabel: live?.amount ?? (lane.contributed ? '1 seal hit' : '0 seal hits'),
          formula: `${bound} canvas bound · ${lane.domain}`,
        });
      }
      for (const f of hydration?.processingFlows ?? []) {
        push(steps, {
          id: `flow:${f.id}`,
          nodeId: `adapter:${f.id}`,
          nodeLabel: f.adapterLabel,
          transform: `${f.operation} → amount`,
          valueLabel: f.amount,
          formula: f.route
            ? `route ${f.route} · ${f.analysisRoles.join(',') || '—'}`
            : f.analysisRoles.join(',') || null,
        });
      }
      const ready = hub.sources.lanes.filter((l) => l.status === 'ready').length;
      const contrib = hub.sources.contributedKinds.length;
      push(steps, {
        id: 'live-roll',
        nodeId: 'live:rollup',
        nodeLabel: 'Lane rollup',
        transform: 'ready lanes · seal kinds',
        valueLabel: `${ready} ready · ${contrib} contributed`,
        formula: `mark feed ${hub.sources.markFeedClass}`,
      });
      break;
    }
    case 'process': {
      for (const s of (hydration?.processSteps ?? []).slice(0, 10)) {
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
          nodeLabel: 'Awareness links',
          transform: 'count projected edges',
          valueLabel: String(aw.links.length),
          formula: `${aw.evidence.length} evidence pkgs`,
        });
        for (const link of aw.links.slice(0, 6)) {
          push(steps, {
            id: `lnk:${link.id}`,
            nodeId: `process:link:${link.id}`,
            nodeLabel: `${link.fromLabel} → ${link.toId}`,
            transform: `${link.fromKind}→${link.toKind} strength`,
            valueLabel: link.strengthBand,
            formula: null,
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
    case 'seals': {
      push(steps, {
        id: 'movers-n',
        nodeId: 'seal:movers',
        nodeLabel: hub.movers.title ?? 'Stock movers',
        transform: 'count sealed items',
        valueLabel: String(hub.movers.items.length),
        formula: hub.movers.corroborationBand
          ? `corroboration ${hub.movers.corroborationBand}`
          : null,
      });
      const bandCounts = new Map<string, number>();
      for (const item of hub.movers.items) {
        const d = item.directionBand ?? 'unset';
        bandCounts.set(d, (bandCounts.get(d) ?? 0) + 1);
      }
      push(steps, {
        id: 'movers-dir',
        nodeId: 'seal:movers:dirs',
        nodeLabel: 'Mover direction bands',
        transform: 'tally direction bands',
        valueLabel:
          [...bandCounts.entries()]
            .map(([k, v]) => `${k}:${v}`)
            .join(' ') || '0',
        formula: null,
      });
      push(steps, {
        id: 'news-n',
        nodeId: 'seal:news',
        nodeLabel: hub.news.title ?? 'News seal',
        transform: 'count news items',
        valueLabel: String(hub.news.items.length),
        formula: null,
      });
      push(steps, {
        id: 'reports-n',
        nodeId: 'seal:reports',
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
        nodeLabel: 'Actions',
        transform: 'suggested + watching + plans',
        valueLabel: `${actionN} watch · ${hub.pipeline.length} plans`,
        formula: null,
      });
      push(steps, {
        id: 'day-tr',
        nodeId: 'day:trends',
        nodeLabel: 'Trends',
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

  return steps;
}
