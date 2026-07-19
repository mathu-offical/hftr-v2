import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGE_SCREEN_ID,
  MARKET_POSTURE_STAGE_SCREENS,
  resolveStageScreenId,
} from './market-posture-stage-screens';

describe('resolveStageScreenId (D-186)', () => {
  it('maps capital / library / live prefixes', () => {
    expect(resolveStageScreenId({ nodeId: 'capital:pool-1' })).toBe('capital');
    expect(resolveStageScreenId({ nodeId: 'lib:movers' })).toBe('library');
    expect(resolveStageScreenId({ nodeId: 'live:alpaca_bars' })).toBe('live');
  });

  it('maps adapters onto live ingest and process nodes onto process', () => {
    expect(resolveStageScreenId({ nodeId: 'adapter:flow-1' })).toBe('live');
    expect(resolveStageScreenId({ nodeRole: 'adapter' })).toBe('live');
    expect(resolveStageScreenId({ nodeId: 'process:step-rs' })).toBe('process');
  });

  it('maps stage milestones onto seals / day / process', () => {
    expect(resolveStageScreenId({ stageId: 'seal_movers' })).toBe('seals');
    expect(resolveStageScreenId({ nodeId: 'narrative' })).toBe('seals');
    expect(resolveStageScreenId({ stageId: 'hub_ready' })).toBe('day');
    expect(resolveStageScreenId({ stageId: 'rank' })).toBe('process');
  });

  it('maps panel surfaces', () => {
    expect(resolveStageScreenId({ panelSurfaceId: 'equity' })).toBe('capital');
    expect(resolveStageScreenId({ nodeId: 'panel:movers' })).toBe('seals');
    expect(resolveStageScreenId({ nodeId: 'panel:charts' })).toBe('day');
    expect(resolveStageScreenId({ panelSurfaceId: 'awareness_links' })).toBe('process');
  });

  it('exposes ordered registry and default', () => {
    expect(MARKET_POSTURE_STAGE_SCREENS.map((s) => s.id)).toEqual([
      'capital',
      'library',
      'live',
      'process',
      'seals',
      'day',
    ]);
    expect(DEFAULT_STAGE_SCREEN_ID).toBe('capital');
  });
});
