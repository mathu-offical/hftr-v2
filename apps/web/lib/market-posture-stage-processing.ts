/**
 * Per-stage-screen processing rows — what the column is actually working on (D-186).
 */

import type {
  MarketHubResponse,
  MarketHubSynthesisRun,
} from '@hftr/contracts';
import {
  MARKET_POSTURE_STAGE_SCREENS,
  type MarketPostureStageScreenId,
} from './market-posture-stage-screens';

export type StageProcessingRowKind =
  | 'capital'
  | 'position'
  | 'library'
  | 'live'
  | 'adapter'
  | 'step'
  | 'stage'
  | 'board'
  | 'link'
  | 'panel'
  | 'rec';

export type StageProcessingRow = {
  id: string;
  kind: StageProcessingRowKind;
  label: string;
  /** Operation / verb being applied. */
  operation: string;
  /** Amount / count / band readout (orientation). */
  amount: string;
  status: string;
  detail?: string | undefined;
};

const MAX_ROWS = 14;

function pushCap(
  rows: StageProcessingRow[],
  row: StageProcessingRow,
): void {
  if (rows.length >= MAX_ROWS) return;
  rows.push(row);
}

/**
 * Build operator-visible "what's being processed" rows for a stage screen.
 */
export function buildStageProcessingRows(
  screenId: MarketPostureStageScreenId,
  hub: MarketHubResponse,
  run: MarketHubSynthesisRun | null,
): StageProcessingRow[] {
  const rows: StageProcessingRow[] = [];
  const meta = MARKET_POSTURE_STAGE_SCREENS.find((s) => s.id === screenId);
  const hydration = hub.modelHydration ?? null;
  const stageIds = new Set(meta?.stageIds ?? []);

  if (run) {
    for (const st of run.stages) {
      if (!stageIds.has(st.stageId)) continue;
      if (st.status === 'queued') continue;
      pushCap(rows, {
        id: `stage:${st.stageId}`,
        kind: 'stage',
        label: st.stageId,
        operation: st.kind,
        amount: st.status,
        status: st.status,
        detail: st.summary ?? st.justificationLines[0] ?? undefined,
      });
    }
  }

  switch (screenId) {
    case 'capital': {
      pushCap(rows, {
        id: 'equity',
        kind: 'capital',
        label: 'Master equity',
        operation: 'ledger',
        amount: hub.equity.equityCents != null ? 'tracked' : 'unavailable',
        status: hub.equity.status,
        detail: hub.equity.asOfIso
          ? `asOf ${new Date(hub.equity.asOfIso).toLocaleTimeString()}`
          : undefined,
      });
      const caps =
        hydration?.capitalSources?.length
          ? hydration.capitalSources
          : hub.capitalSources.map((c) => ({
              id: c.id,
              name: c.name,
              amount:
                c.allocationCents != null
                  ? c.allocationCents
                  : c.status,
              operation: c.kind,
              status: c.status,
            }));
      for (const c of caps) {
        pushCap(rows, {
          id: `cap:${c.id}`,
          kind: 'capital',
          label: c.name,
          operation: 'operation' in c ? String(c.operation) : 'allocate',
          amount: String(c.amount),
          status: String(c.status),
        });
      }
      break;
    }
    case 'library': {
      for (const lib of hydration?.librarySources ?? []) {
        pushCap(rows, {
          id: `lib:${lib.id}`,
          kind: 'library',
          label: lib.name,
          operation: lib.operation,
          amount: lib.amount,
          status: `${lib.admittedCount}/${lib.conceptCount}`,
          detail: lib.shelf,
        });
      }
      for (const p of hub.positions.slice(0, 8)) {
        pushCap(rows, {
          id: `pos:${p.id}`,
          kind: 'position',
          label: p.symbol,
          operation: 'mark',
          amount: `qty ${p.qty}`,
          status: p.viz?.heldVsCost ?? 'open',
          detail: p.moduleName,
        });
      }
      break;
    }
    case 'live': {
      for (const lane of hub.sources.lanes.slice(0, 8)) {
        pushCap(rows, {
          id: `lane:${lane.kind}`,
          kind: 'live',
          label: lane.label,
          operation: lane.status === 'ready' ? 'entitle' : 'need_key',
          amount: lane.contributed ? 'contributed' : lane.status,
          status: lane.status,
          detail: lane.domain,
        });
      }
      for (const s of hydration?.liveSources ?? []) {
        if (rows.some((r) => r.id === `lane:${s.kind}`)) continue;
        pushCap(rows, {
          id: `live:${s.kind}`,
          kind: 'live',
          label: s.label,
          operation: s.operation,
          amount: s.amount,
          status: s.status,
          detail: s.domain,
        });
      }
      break;
    }
    case 'adapt': {
      for (const f of hydration?.processingFlows ?? []) {
        pushCap(rows, {
          id: `flow:${f.id}`,
          kind: 'adapter',
          label: f.adapterLabel,
          operation: f.operation,
          amount: f.amount,
          status: f.status,
          detail: f.route ?? f.analysisRoles.join(', '),
        });
      }
      break;
    }
    case 'process': {
      for (const step of (hydration?.processSteps ?? []).slice(0, 10)) {
        pushCap(rows, {
          id: `step:${step.id}`,
          kind: 'step',
          label: step.label,
          operation: step.processFunction,
          amount: step.amount,
          status: step.status ?? step.operation,
          detail: step.route,
        });
      }
      const aw = hub.awarenessAnalysis;
      if (aw) {
        for (const ev of aw.evidence.slice(0, 4)) {
          pushCap(rows, {
            id: `ev:${ev.id}`,
            kind: 'link',
            label: ev.label,
            operation: ev.kind,
            amount: `${ev.linkedSymbolCount} symbols`,
            status: ev.strengthBand,
          });
        }
        for (const link of aw.links.slice(0, 4)) {
          pushCap(rows, {
            id: `lnk:${link.id}`,
            kind: 'link',
            label: `${link.fromLabel} → ${link.toId}`,
            operation: `${link.fromKind}→${link.toKind}`,
            amount: link.strengthBand,
            status: 'linked',
          });
        }
      }
      break;
    }
    case 'seals': {
      for (const item of hub.movers.items.slice(0, 6)) {
        pushCap(rows, {
          id: `mover:${item.symbolOrSector ?? rows.length}`,
          kind: 'board',
          label: item.symbolOrSector ?? item.headline ?? 'mover',
          operation: 'seal_movers',
          amount: [item.directionBand, item.strengthBand].filter(Boolean).join(' · ') || '—',
          status: hub.movers.status,
          detail: item.headline ?? undefined,
        });
      }
      for (const item of hub.news.items.slice(0, 4)) {
        pushCap(rows, {
          id: `news:${item.symbolOrSector ?? rows.length}`,
          kind: 'board',
          label: item.headline ?? item.symbolOrSector ?? 'news',
          operation: 'sector',
          amount: [item.directionBand, item.strengthBand].filter(Boolean).join(' · ') || '—',
          status: hub.news.status,
        });
      }
      for (const r of hub.reports.slice(0, 4)) {
        pushCap(rows, {
          id: `rpt:${r.id}`,
          kind: 'board',
          label: r.title,
          operation: r.kind,
          amount: r.expiresAt ? 'expiring' : 'sealed',
          status: 'ready',
        });
      }
      break;
    }
    case 'compose': {
      for (const surf of hydration?.panelSurfaces ?? []) {
        pushCap(rows, {
          id: `panel:${surf.id}`,
          kind: 'panel',
          label: surf.label,
          operation: surf.operation,
          amount: surf.amount,
          status: surf.status,
          detail: surf.panel,
        });
      }
      for (const w of hub.watchlists.slice(0, 4)) {
        pushCap(rows, {
          id: `wl:${w.id}`,
          kind: 'rec',
          label: w.symbol,
          operation: 'watch',
          amount: w.status,
          status: w.bias,
        });
      }
      for (const t of hub.trendCandidates.slice(0, 4)) {
        pushCap(rows, {
          id: `tr:${t.id}`,
          kind: 'rec',
          label: t.symbol,
          operation: 'trend',
          amount: t.strengthBand,
          status: t.status,
        });
      }
      break;
    }
    default: {
      const _exhaustive: never = screenId;
      return _exhaustive;
    }
  }

  return rows;
}
