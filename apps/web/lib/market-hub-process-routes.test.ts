import { describe, expect, it } from 'vitest';
import type { MarketHubModelLiveSource } from '@hftr/contracts';
import {
  buildLiveProcessingFlows,
  buildProcessStepsFromFlows,
  primaryFeedStage,
} from './market-hub-process-routes';

function src(
  partial: Partial<MarketHubModelLiveSource> & Pick<MarketHubModelLiveSource, 'kind' | 'status'>,
): MarketHubModelLiveSource {
  return {
    label: partial.kind,
    domain: 'market',
    sourceClass: 'stream',
    authMode: 'research_key',
    canvasBoundCount: 0,
    contributed: false,
    operation: 'idle',
    amount: '0',
    ...partial,
  };
}

describe('market-hub-process-routes (D-169)', () => {
  it('assigns processFunction per step and kind-prefixed labels', () => {
    const flows = buildLiveProcessingFlows([
      src({ kind: 'gdelt_news', status: 'ready', domain: 'news' }),
    ]);
    const steps = buildProcessStepsFromFlows(flows);
    expect(steps.map((s) => s.processFunction)).toEqual([
      'fetch',
      'normalize',
      'extract',
      'corroborate',
    ]);
    expect(steps[0]?.label.toLowerCase()).toContain('gdelt');
  });

  it('provisions dual entitle+ohlc chains for twelve_data and marketstack', () => {
    const flows = buildLiveProcessingFlows([
      src({ kind: 'twelve_data', status: 'ready' }),
      src({ kind: 'marketstack', status: 'ready' }),
    ]);
    expect(flows.map((f) => f.id).sort()).toEqual([
      'marketstack:entitle',
      'marketstack:ohlc',
      'twelve_data:entitle',
      'twelve_data:ohlc',
    ]);
  });

  it('primaryFeedStage collapses multi-stage fan-out to one milestone', () => {
    const [newsFlow] = buildLiveProcessingFlows([
      src({ kind: 'gdelt_news', status: 'ready' }),
    ]);
    expect(primaryFeedStage(newsFlow!)).toBe('gather');

    const ohlc = buildLiveProcessingFlows([src({ kind: 'alpaca_bars', status: 'ready' })]).find(
      (f) => f.route === 'bars_ohlc',
    );
    expect(primaryFeedStage(ohlc!)).toBe('rs');
  });
});
