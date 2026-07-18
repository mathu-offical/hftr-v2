/**
 * Market posture algorithm graph for live synthesis hub (D-111 / D-120).
 * Node ids match MarketHubSynthesisStageId.
 */

import type { MarketHubSynthesisStageId, MarketHubSynthesisStageKind } from '@hftr/contracts';
import { MARKET_HUB_SYNTHESIS_STAGE_META } from '@hftr/contracts';

export type PostureAlgoNodeData = {
  label: string;
  detail: string;
  kind: MarketHubSynthesisStageKind;
  stageId: MarketHubSynthesisStageId;
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

const LAYOUT: Array<{ id: MarketHubSynthesisStageId; x: number; y: number; detail: string }> = [
  { id: 'providers', x: 0, y: 100, detail: 'Credential-ready / public lanes (D-103)' },
  { id: 'gather', x: 180, y: 100, detail: 'News · bars · macro · web · library corpus' },
  { id: 'thresholds', x: 360, y: 20, detail: 'Tactical LLM presets → resolved ints' },
  { id: 'defaults', x: 360, y: 180, detail: 'Fail-closed when LLM unavailable' },
  { id: 'universe', x: 540, y: 100, detail: 'Evidence + trends + book + liquid fallback' },
  { id: 'rs', x: 720, y: 100, detail: 'Model-free bars vs SPY · synthetic marks' },
  { id: 'rank', x: 900, y: 100, detail: 'Leadership · fit · corroboration bands' },
  { id: 'verify', x: 1080, y: 100, detail: 'Suggestion verify → watchlist promote' },
  { id: 'seal_movers', x: 1260, y: 100, detail: 'Verified normalize · report concept' },
  { id: 'sector', x: 1260, y: 220, detail: 'Sector bulletin seal' },
  { id: 'daily', x: 1440, y: 160, detail: 'Calendar-phase daily summary seal' },
  { id: 'narrative', x: 1620, y: 100, detail: 'Seal-grounded posture narrative' },
  { id: 'hub_ready', x: 1800, y: 100, detail: 'Hub projection ready' },
];

export function buildMarketPostureAlgorithmGraph(): PostureAlgoGraph {
  const nodes = LAYOUT.map((s) => {
    const meta = MARKET_HUB_SYNTHESIS_STAGE_META[s.id];
    return {
      id: s.id,
      type: 'postureAlgo' as const,
      position: { x: s.x, y: s.y },
      data: {
        label: meta.label,
        detail: s.detail,
        kind: meta.kind,
        stageId: s.id,
      },
    };
  });

  const edges = [
    { id: 'e-prov-gather', source: 'providers', target: 'gather' },
    { id: 'e-gather-llm', source: 'gather', target: 'thresholds', label: 'lane presence' },
    { id: 'e-gather-def', source: 'gather', target: 'defaults' },
    { id: 'e-llm-uni', source: 'thresholds', target: 'universe' },
    { id: 'e-def-uni', source: 'defaults', target: 'universe' },
    { id: 'e-uni-rs', source: 'universe', target: 'rs' },
    { id: 'e-rs-rank', source: 'rs', target: 'rank' },
    { id: 'e-rank-ver', source: 'rank', target: 'verify' },
    { id: 'e-ver-seal', source: 'verify', target: 'seal_movers' },
    { id: 'e-seal-sector', source: 'seal_movers', target: 'sector' },
    { id: 'e-sector-daily', source: 'sector', target: 'daily' },
    { id: 'e-daily-narr', source: 'daily', target: 'narrative' },
    { id: 'e-narr-hub', source: 'narrative', target: 'hub_ready' },
  ];

  return { nodes, edges };
}
