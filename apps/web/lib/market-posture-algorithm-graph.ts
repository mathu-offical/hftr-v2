/**
 * Market posture algorithm / hydration graph for live synthesis hub (D-120 / D-147).
 * Includes all live data sources + library shelves feeding gather, plus pipeline stages.
 * Every node carries operation + amount (counts/status — never LLM dollars).
 */

import type {
  MarketHubModelHydration,
  MarketHubSynthesisStage,
  MarketHubSynthesisStageId,
  MarketHubSynthesisStageKind,
} from '@hftr/contracts';
import { MARKET_HUB_SYNTHESIS_STAGE_META } from '@hftr/contracts';

export type PostureAlgoNodeRole = 'live_source' | 'library_source' | 'stage';

export type PostureAlgoNodeData = {
  label: string;
  detail: string;
  kind: MarketHubSynthesisStageKind;
  nodeRole: PostureAlgoNodeRole;
  /** Present for pipeline stage nodes (matches synthesis stageId). */
  stageId?: MarketHubSynthesisStageId;
  /** Operator-visible op (hydrate, rank, seal, …). */
  operation: string;
  /** Count / status amount for the node. */
  amount: string;
};

export type PostureAlgoGraph = {
  nodes: Array<{
    id: string;
    type: 'postureAlgo';
    position: { x: number; y: number };
    data: PostureAlgoNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
};

const STAGE_LAYOUT: Array<{ id: MarketHubSynthesisStageId; x: number; y: number }> = [
  { id: 'providers', x: 320, y: 200 },
  { id: 'gather', x: 500, y: 200 },
  { id: 'thresholds', x: 680, y: 80 },
  { id: 'defaults', x: 680, y: 320 },
  { id: 'universe', x: 860, y: 200 },
  { id: 'rs', x: 1040, y: 200 },
  { id: 'rank', x: 1220, y: 200 },
  { id: 'verify', x: 1400, y: 200 },
  { id: 'seal_movers', x: 1580, y: 120 },
  { id: 'sector', x: 1580, y: 280 },
  { id: 'daily', x: 1760, y: 200 },
  { id: 'narrative', x: 1940, y: 200 },
  { id: 'hub_ready', x: 2120, y: 200 },
];

const STAGE_EDGES: PostureAlgoGraph['edges'] = [
  { id: 'e-prov-gather', source: 'providers', target: 'gather' },
  { id: 'e-gather-llm', source: 'gather', target: 'thresholds', label: 'lane presence' },
  { id: 'e-gather-def', source: 'gather', target: 'defaults' },
  { id: 'e-llm-uni', source: 'thresholds', target: 'universe' },
  { id: 'e-def-uni', source: 'defaults', target: 'universe' },
  { id: 'e-uni-rs', source: 'universe', target: 'rs' },
  { id: 'e-rs-rank', source: 'rs', target: 'rank' },
  { id: 'e-rank-ver', source: 'rank', target: 'verify' },
  { id: 'e-ver-seal', source: 'verify', target: 'seal_movers' },
  { id: 'e-seal-sector', source: 'seal_movers', target: 'sector', label: '∥' },
  { id: 'e-seal-daily', source: 'seal_movers', target: 'daily', label: '∥' },
  { id: 'e-sector-narr', source: 'sector', target: 'narrative' },
  { id: 'e-daily-narr', source: 'daily', target: 'narrative' },
  { id: 'e-narr-hub', source: 'narrative', target: 'hub_ready' },
];

function parseStageAmountFromSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  // Prefer first "N word" count pattern from handler prose.
  const m = summary.match(/(\d+)\s+([a-zA-Z][\w-]*)/);
  if (!m) return null;
  return `${m[1]} ${m[2]}`.slice(0, 40);
}

function stageOpFromHydration(
  hydration: MarketHubModelHydration | null | undefined,
  stageId: MarketHubSynthesisStageId,
): { operation: string; amount: string } | null {
  const row = hydration?.stageOps.find((s) => s.stageId === stageId);
  if (!row) return null;
  return { operation: row.operation, amount: row.amount };
}

/**
 * Build Model graph: live sources + libraries → providers/gather → pipeline.
 */
export function buildMarketPostureAlgorithmGraph(opts?: {
  hydration?: MarketHubModelHydration | null;
  stages?: MarketHubSynthesisStage[] | null;
}): PostureAlgoGraph {
  const hydration = opts?.hydration ?? null;
  const byStage = new Map<string, MarketHubSynthesisStage>();
  for (const s of opts?.stages ?? []) byStage.set(s.stageId, s);

  const nodes: PostureAlgoGraph['nodes'] = [];
  const edges: PostureAlgoGraph['edges'] = [...STAGE_EDGES];

  const liveSources = hydration?.liveSources ?? [];
  const librarySources = hydration?.librarySources ?? [];

  const liveColX = 0;
  const liveStartY = 0;
  const liveGap = 58;
  liveSources.forEach((src, i) => {
    const id = `live:${src.kind}`;
    nodes.push({
      id,
      type: 'postureAlgo',
      position: { x: liveColX, y: liveStartY + i * liveGap },
      data: {
        label: src.label,
        detail: `${src.domain} · ${src.status}`,
        kind: 'data',
        nodeRole: 'live_source',
        operation: src.operation,
        amount: src.amount,
      },
    });
    edges.push({
      id: `e-${id}-providers`,
      source: id,
      target: 'providers',
      ...(src.contributed ? { label: 'sealed' } : {}),
    });
  });

  const libColX = 0;
  const libStartY =
    liveSources.length > 0 ? liveStartY + liveSources.length * liveGap + 24 : 0;
  librarySources.forEach((lib, i) => {
    const id = `lib:${lib.id}`;
    nodes.push({
      id,
      type: 'postureAlgo',
      position: { x: libColX + 160, y: libStartY + i * liveGap },
      data: {
        label: lib.name,
        detail: `${lib.shelf} · ${lib.topicScope || 'untagged'}`,
        kind: 'data',
        nodeRole: 'library_source',
        operation: lib.operation,
        amount: lib.amount,
      },
    });
    edges.push({
      id: `e-${id}-gather`,
      source: id,
      target: 'gather',
      ...(lib.admittedCount > 0 ? { label: 'corpus' } : {}),
    });
  });

  for (const s of STAGE_LAYOUT) {
    const meta = MARKET_HUB_SYNTHESIS_STAGE_META[s.id];
    const stageRow = byStage.get(s.id);
    const baseline = stageOpFromHydration(hydration, s.id);
    const fromSummary = parseStageAmountFromSummary(stageRow?.summary);
    const operation =
      stageRow?.status === 'running'
        ? 'running'
        : stageRow?.status === 'succeeded'
          ? baseline?.operation ?? 'done'
          : baseline?.operation ?? meta.label.toLowerCase();
    const amount =
      fromSummary ??
      baseline?.amount ??
      (hydration
        ? '—'
        : 'pending');

    nodes.push({
      id: s.id,
      type: 'postureAlgo',
      position: { x: s.x, y: s.y },
      data: {
        label: meta.label,
        detail: stageRow?.summary?.slice(0, 120) ?? `${meta.kind} stage`,
        kind: meta.kind,
        nodeRole: 'stage',
        stageId: s.id,
        operation,
        amount,
      },
    });
  }

  // When no hydration yet, still show empty baseline labels on stage nodes only.
  if (liveSources.length === 0 && librarySources.length === 0 && !hydration) {
    // keep stages only — already added
  }

  return { nodes, edges };
}
