/**
 * Market posture synthesis Model graph (D-120 / D-147 / D-156).
 * Per-service adapter flows feed specific analysis stages — not a single
 * dump of all APIs into providers→gather.
 */

import type {
  MarketHubModelHydration,
  MarketHubModelProcessingFlow,
  MarketHubSynthesisStage,
  MarketHubSynthesisStageId,
  MarketHubSynthesisStageKind,
} from '@hftr/contracts';
import { MARKET_HUB_SYNTHESIS_STAGE_META } from '@hftr/contracts';

export type PostureAlgoNodeRole =
  | 'live_source'
  | 'adapter'
  | 'library_source'
  | 'stage';

export type PostureAlgoNodeData = {
  label: string;
  detail: string;
  kind: MarketHubSynthesisStageKind;
  nodeRole: PostureAlgoNodeRole;
  stageId?: MarketHubSynthesisStageId;
  operation: string;
  amount: string;
  /** Analysis roles for adapter nodes (D-156). */
  analysisRoles?: string[];
  pipelines?: Array<'movers' | 'sector'>;
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
  { id: 'providers', x: 520, y: 40 },
  { id: 'gather', x: 700, y: 200 },
  { id: 'thresholds', x: 880, y: 80 },
  { id: 'defaults', x: 880, y: 320 },
  { id: 'universe', x: 1060, y: 200 },
  { id: 'rs', x: 1240, y: 200 },
  { id: 'rank', x: 1420, y: 200 },
  { id: 'verify', x: 1600, y: 200 },
  { id: 'seal_movers', x: 1780, y: 120 },
  { id: 'sector', x: 1780, y: 280 },
  { id: 'daily', x: 1960, y: 200 },
  { id: 'narrative', x: 2140, y: 200 },
  { id: 'hub_ready', x: 2320, y: 200 },
];

/** Shared pipeline edges (stages only — adapters wire in separately). */
const STAGE_EDGES: PostureAlgoGraph['edges'] = [
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
 * Diagram edges: keep distinctive analysis uses visible without fanning every
 * corroboration stage (full targetStages remain on the flow payload).
 */
function diagramTargetStages(flow: MarketHubModelProcessingFlow): MarketHubSynthesisStageId[] {
  const roles = new Set(flow.analysisRoles);
  const out = new Set<MarketHubSynthesisStageId>();
  const first = flow.targetStages[0];
  if (first) out.add(first);

  if (roles.has('relative_strength') || roles.has('volume_expansion')) {
    for (const s of ['rs', 'rank'] as const) {
      if (flow.targetStages.includes(s)) out.add(s);
    }
  }
  if (roles.has('news_corpus') || roles.has('web_corpus') || roles.has('filings_corpus')) {
    if (flow.targetStages.includes('gather')) out.add('gather');
    if (flow.targetStages.includes('universe')) out.add('universe');
    if (flow.targetStages.includes('sector') && flow.pipelines.includes('sector')) {
      out.add('sector');
    }
    if (flow.targetStages.includes('seal_movers') && flow.pipelines.includes('movers')) {
      out.add('seal_movers');
    }
  }
  if (roles.has('macro_context') || roles.has('bars_entitlement')) {
    if (flow.targetStages.includes('gather')) out.add('gather');
    if (flow.targetStages.includes('providers')) out.add('providers');
    if (flow.targetStages.includes('verify')) out.add('verify');
  }
  if (roles.has('library_jaccard')) {
    for (const s of flow.targetStages) out.add(s);
  }

  // Entitlement-only adapters also announce into providers.
  if (roles.has('bars_entitlement') && !roles.has('relative_strength')) {
    out.add('providers');
  }

  if (out.size === 0) {
    for (const s of flow.targetStages.slice(0, 3)) out.add(s);
  }
  return [...out];
}

/**
 * Build Model graph with per-service adapters feeding specific stages (D-156).
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
  const flows = hydration?.processingFlows ?? [];

  const liveByKind = new Map(liveSources.map((s) => [s.kind, s]));
  const gap = 72;
  const liveX = 0;
  const adapterX = 240;

  const flowsByKind = new Map<string, MarketHubModelProcessingFlow[]>();
  for (const f of flows) {
    if (f.kind.startsWith('library:')) continue;
    const list = flowsByKind.get(f.kind) ?? [];
    list.push(f);
    flowsByKind.set(f.kind, list);
  }

  let row = 0;
  for (const src of liveSources) {
    const liveId = `live:${src.kind}`;
    const y = row * gap;
    nodes.push({
      id: liveId,
      type: 'postureAlgo',
      position: { x: liveX, y },
      data: {
        label: src.label,
        detail: `${src.domain} · ${src.status}`,
        kind: 'data',
        nodeRole: 'live_source',
        operation: src.operation,
        amount: src.amount,
      },
    });

    const kindFlows = flowsByKind.get(src.kind) ?? [];
    if (kindFlows.length === 0) {
      edges.push({
        id: `e-${liveId}-providers`,
        source: liveId,
        target: 'providers',
        ...(src.contributed ? { label: 'sealed' } : {}),
      });
      row += 1;
      continue;
    }

    kindFlows.forEach((flow, fi) => {
      const adapterId = `adapter:${flow.id}`;
      const ay = y + fi * Math.min(40, gap / Math.max(kindFlows.length, 1));
      nodes.push({
        id: adapterId,
        type: 'postureAlgo',
        position: { x: adapterX, y: ay },
        data: {
          label: flow.adapterLabel,
          detail: flow.analysisRoles.join(' · ') || flow.pipelines.join('+'),
          kind: 'deterministic',
          nodeRole: 'adapter',
          operation: flow.operation,
          amount: flow.amount,
          analysisRoles: [...flow.analysisRoles],
          pipelines: [...flow.pipelines],
        },
      });
      edges.push({
        id: `e-${liveId}-${adapterId}`,
        source: liveId,
        target: adapterId,
      });
      const targets = diagramTargetStages(flow);
      targets.forEach((stageId, si) => {
        const roleHint = flow.analysisRoles[si] ?? flow.pipelines[0];
        edges.push({
          id: `e-${adapterId}-${stageId}`,
          source: adapterId,
          target: stageId,
          ...(roleHint ? { label: roleHint.slice(0, 24) } : {}),
        });
      });
    });
    row += Math.max(1, kindFlows.length);
  }

  const libFlows = flows.filter((f) => f.kind.startsWith('library:'));
  const libStartY = row * gap + 48;
  librarySources.forEach((lib, i) => {
    const liveId = `lib:${lib.id}`;
    const y = libStartY + i * gap;
    nodes.push({
      id: liveId,
      type: 'postureAlgo',
      position: { x: liveX, y },
      data: {
        label: lib.name,
        detail: `${lib.shelf} · ${lib.topicScope || 'untagged'}`,
        kind: 'data',
        nodeRole: 'library_source',
        operation: lib.operation,
        amount: lib.amount,
      },
    });
    const flow = libFlows.find((f) => f.kind === `library:${lib.id}`);
    if (flow) {
      const adapterId = `adapter:${flow.id}`;
      nodes.push({
        id: adapterId,
        type: 'postureAlgo',
        position: { x: adapterX, y },
        data: {
          label: flow.adapterLabel,
          detail: flow.analysisRoles.join(' · '),
          kind: 'deterministic',
          nodeRole: 'adapter',
          operation: flow.operation,
          amount: flow.amount,
          analysisRoles: [...flow.analysisRoles],
          pipelines: [...flow.pipelines],
        },
      });
      edges.push({ id: `e-${liveId}-${adapterId}`, source: liveId, target: adapterId });
      for (const stageId of diagramTargetStages(flow)) {
        edges.push({
          id: `e-${adapterId}-${stageId}`,
          source: adapterId,
          target: stageId,
          label: 'corpus',
        });
      }
    } else {
      edges.push({
        id: `e-${liveId}-gather`,
        source: liveId,
        target: 'gather',
        ...(lib.admittedCount > 0 ? { label: 'corpus' } : {}),
      });
    }
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
          ? (baseline?.operation ?? 'done')
          : (baseline?.operation ?? meta.label.toLowerCase());
    const amount = fromSummary ?? baseline?.amount ?? (hydration ? '—' : 'pending');

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

  edges.push({
    id: 'e-prov-gather',
    source: 'providers',
    target: 'gather',
    label: 'ready lanes',
  });

  return { nodes, edges };
}
