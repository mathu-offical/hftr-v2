import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGE_SCREEN_ID,
  MARKET_POSTURE_STAGE_SCREENS,
  resolveStageScreenId,
} from './market-posture-stage-screens';

describe('resolveStageScreenId (D-186)', () => {
  it('maps capital / live / library prefixes in pipeline order', () => {
    expect(resolveStageScreenId({ nodeId: 'capital:pool-1' })).toBe('capital');
    expect(resolveStageScreenId({ nodeId: 'live:alpaca_bars' })).toBe('live');
    expect(resolveStageScreenId({ nodeId: 'lib:movers' })).toBe('library');
  });

  it('maps adapters onto live ingest and process nodes onto process', () => {
    expect(resolveStageScreenId({ nodeId: 'adapter:flow-1' })).toBe('live');
    expect(resolveStageScreenId({ nodeRole: 'adapter' })).toBe('live');
    expect(resolveStageScreenId({ nodeId: 'process:step-rs' })).toBe('live');
    expect(resolveStageScreenId({ nodeId: 'analyze:alpaca_bars:score' })).toBe('live');
    expect(resolveStageScreenId({ nodeId: 'process:shared:rank' })).toBe('process');
    expect(resolveStageScreenId({ nodeId: 'process:library:abc:load' })).toBe('library');
  });

  it('maps stage milestones onto outlook / day / process', () => {
    expect(resolveStageScreenId({ stageId: 'seal_movers' })).toBe('outlook');
    expect(resolveStageScreenId({ nodeId: 'narrative' })).toBe('outlook');
    expect(resolveStageScreenId({ stageId: 'hub_ready' })).toBe('day');
    expect(resolveStageScreenId({ stageId: 'rank' })).toBe('process');
    expect(resolveStageScreenId({ stageId: 'providers' })).toBe('process');
  });

  it('maps panel surfaces', () => {
    expect(resolveStageScreenId({ panelSurfaceId: 'equity' })).toBe('capital');
    expect(resolveStageScreenId({ nodeId: 'panel:movers' })).toBe('outlook');
    expect(resolveStageScreenId({ nodeId: 'panel:charts' })).toBe('day');
    expect(resolveStageScreenId({ panelSurfaceId: 'awareness_links' })).toBe('process');
    expect(resolveStageScreenId({ panelSurfaceId: 'watchlists' })).toBe('outlook');
    expect(resolveStageScreenId({ panelSurfaceId: 'positions' })).toBe('outlook');
    expect(resolveStageScreenId({ nodeId: 'lib-adapter:x' })).toBe('library');
  });

  it('exposes ordered registry and default (live before library)', () => {
    expect(MARKET_POSTURE_STAGE_SCREENS.map((s) => s.id)).toEqual([
      'capital',
      'live',
      'library',
      'process',
      'outlook',
      'day',
    ]);
    expect(DEFAULT_STAGE_SCREEN_ID).toBe('capital');
  });
});
