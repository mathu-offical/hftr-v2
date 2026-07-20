import { describe, expect, it } from 'vitest';
import {
  layoutStepsByMatrix,
  resolveStripLayoutMode,
  stripLaneKey,
  applyStripPlacementOverride,
  staggerStripCell,
  STRIP_NODE_PLACEMENT_OVERRIDES,
  STRIP_STAGGER,
} from './market-posture-strip-placement';
import type { PostureAlgoGraphNode } from './market-posture-algorithm-graph';

function step(
  id: string,
  role: PostureAlgoGraphNode['data']['nodeRole'],
  processFunction?: string,
): PostureAlgoGraphNode {
  return {
    id,
    type: 'postureAlgo',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      detail: '',
      kind: 'data',
      nodeRole: role,
      operation: 'op',
      amount: '1',
      layer: 'pipeline',
      track: 'compound',
      activation: 'idle',
      status: 'idle',
      updatedAt: null,
      processRoute: 'news_headline',
      ...(processFunction ? { processFunction } : {}),
    },
  };
}

describe('market-posture-strip-placement', () => {
  it('resolves news_headline to matrix when multiple lanes share functions', () => {
    const steps = [
      step('process:alpaca_news:fetch', 'process', 'fetch'),
      step('process:finnhub_news:fetch', 'process', 'fetch'),
      step('process:alpaca_news:normalize', 'process', 'normalize'),
      step('process:finnhub_news:normalize', 'process', 'normalize'),
    ];
    expect(resolveStripLayoutMode('news_headline', steps)).toBe('matrix');
  });

  it('packs matrix as lanes × functions (not a 12-hop mash)', () => {
    const steps = [
      step('process:alpaca_news:fetch', 'process', 'fetch'),
      step('process:finnhub_news:fetch', 'process', 'fetch'),
      step('process:gdelt_news:fetch', 'process', 'fetch'),
      step('process:alpaca_news:normalize', 'process', 'normalize'),
      step('process:finnhub_news:normalize', 'process', 'normalize'),
      step('process:gdelt_news:normalize', 'process', 'normalize'),
      step('process:alpaca_news:tickers', 'process', 'extract'),
      step('process:finnhub_news:tickers', 'process', 'extract'),
      step('process:gdelt_news:tickers', 'process', 'extract'),
      step('process:alpaca_news:corroborate', 'process', 'corroborate'),
      step('process:finnhub_news:corroborate', 'process', 'corroborate'),
      step('process:gdelt_news:corroborate', 'process', 'corroborate'),
    ];
    const layout = layoutStepsByMatrix(steps, {
      nodeW: 118,
      nodeH: 40,
      gapX: 22,
      gapY: 14,
    });
    const fetch = layout.positions.get('process:alpaca_news:fetch')!;
    const norm = layout.positions.get('process:alpaca_news:normalize')!;
    const finFetch = layout.positions.get('process:finnhub_news:fetch')!;
    // 4 function columns L→R; brick stagger opens ortho channels.
    expect(norm.x).toBeGreaterThan(fetch.x);
    expect(norm.y).not.toBe(fetch.y);
    expect(finFetch.y).toBeGreaterThan(fetch.y);
    expect(finFetch.x).not.toBe(fetch.x);
    expect(layout.hops.get('process:alpaca_news:fetch')).toBe(1);
    expect(layout.hops.get('process:alpaca_news:corroborate')).toBe(4);
    expect(stripLaneKey(steps[0]!)).toBe('alpaca_news');
  });

  it('staggerStripCell bricks odd columns and rows', () => {
    const a = staggerStripCell({ col: 0, row: 0, baseX: 0, baseY: 0 });
    const b = staggerStripCell({ col: 1, row: 0, baseX: 100, baseY: 0 });
    const c = staggerStripCell({ col: 0, row: 1, baseX: 0, baseY: 50 });
    expect(a).toEqual({ x: 0, y: 0 });
    expect(b.y).toBe(STRIP_STAGGER.y);
    expect(c.x).toBe(STRIP_STAGGER.x);
  });

  it('applies placement overrides', () => {
    const prev = STRIP_NODE_PLACEMENT_OVERRIDES['panel:positions'];
    expect(applyStripPlacementOverride('panel:positions', { x: 0, y: 0 })).toEqual({
      x: prev?.dx ?? 0,
      y: prev?.dy ?? 0,
    });
    expect(applyStripPlacementOverride('unknown', { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
    });
  });
});
