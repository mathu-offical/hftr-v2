import { describe, expect, it } from 'vitest';
import {
  defaultExecutionProcessStages,
  placeProcessStageRail,
  PROCESS_STAGE_SPINE,
  seedEngineProcessStageSnapshot,
  shouldSeedProcessStages,
} from './process-stages';

describe('process stages (D-232 / D-237)', () => {
  it('seeds fail-closed spine order', () => {
    const stages = defaultExecutionProcessStages('trading-id', 'trend-id');
    expect(stages.map((stage) => stage.kind)).toEqual([...PROCESS_STAGE_SPINE]);
    expect(stages[0]?.ownerModuleId).toBe('trend-id');
    expect(stages[2]?.ownerModuleId).toBe('trading-id');
  });

  it('only seeds execution/sim engines with a trading desk', () => {
    expect(
      shouldSeedProcessStages('execution', [{ type: 'trend' }, { type: 'trading' }]),
    ).toBe(true);
    expect(shouldSeedProcessStages('simulation', [{ type: 'simulator' }])).toBe(false);
    expect(shouldSeedProcessStages('research', [{ type: 'trading' }])).toBe(false);
  });

  it('places the rail below trend and trading columns', () => {
    const stages = defaultExecutionProcessStages(null, null);
    const placed = placeProcessStageRail(stages, [
      { id: 't1', type: 'trend', position: { x: 120, y: 80 } },
      { id: 'x1', type: 'trading', position: { x: 420, y: 80 } },
    ]);
    expect(placed[0]?.position?.x).toBe(120);
    expect(placed[0]?.position?.y).toBeGreaterThan(80);
    expect(placed[1]?.position?.x).toBeGreaterThan(placed[0]?.position?.x ?? 0);
  });

  it('returns null when template section cannot seed process stages', () => {
    expect(
      seedEngineProcessStageSnapshot({
        templateId: 'research-pack-equities',
        members: [{ id: 'r1', type: 'research' }],
      }),
    ).toBeNull();
  });
});
