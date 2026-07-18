/**
 * Static React Flow graph for Market posture baseline algorithm (D-111).
 * Documents gather → tactical LLM thresholds → compound rank → seal → hub viz.
 */

export type PostureAlgoNodeData = {
  label: string;
  detail: string;
  kind: 'data' | 'llm' | 'deterministic' | 'output';
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

const STAGES: Array<{
  id: string;
  label: string;
  detail: string;
  kind: PostureAlgoNodeData['kind'];
  x: number;
  y: number;
}> = [
  {
    id: 'providers',
    label: 'Provider surfaces',
    detail: 'Credential-ready / public lanes (D-103)',
    kind: 'data',
    x: 0,
    y: 80,
  },
  {
    id: 'gather',
    label: 'Gather evidence',
    detail: 'News · bars · macro · web · library corpus',
    kind: 'data',
    x: 200,
    y: 80,
  },
  {
    id: 'thresholds',
    label: 'Threshold profile',
    detail: 'Tactical LLM presets → resolved ints (Analyze)',
    kind: 'llm',
    x: 400,
    y: 0,
  },
  {
    id: 'defaults',
    label: 'Typical defaults',
    detail: 'Fail-closed when LLM unavailable',
    kind: 'deterministic',
    x: 400,
    y: 160,
  },
  {
    id: 'universe',
    label: 'Universe build',
    detail: 'Evidence + trends + book + liquid fallback',
    kind: 'deterministic',
    x: 600,
    y: 80,
  },
  {
    id: 'rs',
    label: 'Rel-strength / volume',
    detail: 'Model-free bars vs SPY · synthetic marks',
    kind: 'deterministic',
    x: 800,
    y: 80,
  },
  {
    id: 'compound',
    label: 'Compound score',
    detail: 'Leadership · fit · corroboration bands',
    kind: 'deterministic',
    x: 1000,
    y: 80,
  },
  {
    id: 'verify',
    label: 'Verify gates',
    detail: 'Suggestion verify → watchlist promote',
    kind: 'deterministic',
    x: 1200,
    y: 80,
  },
  {
    id: 'seal',
    label: 'Seal movers board',
    detail: 'Verified normalize · report concept',
    kind: 'deterministic',
    x: 1400,
    y: 80,
  },
  {
    id: 'hub',
    label: 'Market hub / ticker',
    detail: 'SymbolTicker · charts · auto Sync GET',
    kind: 'output',
    x: 1600,
    y: 80,
  },
];

export function buildMarketPostureAlgorithmGraph(): PostureAlgoGraph {
  const nodes = STAGES.map((s) => ({
    id: s.id,
    type: 'postureAlgo' as const,
    position: { x: s.x, y: s.y },
    data: { label: s.label, detail: s.detail, kind: s.kind },
  }));

  const edges = [
    { id: 'e-prov-gather', source: 'providers', target: 'gather' },
    { id: 'e-gather-llm', source: 'gather', target: 'thresholds', label: 'lane presence' },
    { id: 'e-gather-def', source: 'gather', target: 'defaults' },
    { id: 'e-llm-uni', source: 'thresholds', target: 'universe' },
    { id: 'e-def-uni', source: 'defaults', target: 'universe' },
    { id: 'e-uni-rs', source: 'universe', target: 'rs' },
    { id: 'e-rs-cmp', source: 'rs', target: 'compound' },
    { id: 'e-cmp-ver', source: 'compound', target: 'verify' },
    { id: 'e-ver-seal', source: 'verify', target: 'seal' },
    { id: 'e-seal-hub', source: 'seal', target: 'hub' },
  ];

  return { nodes, edges };
}
