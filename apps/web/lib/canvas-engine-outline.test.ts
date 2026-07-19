import { describe, expect, it } from 'vitest';
import {
  buildCanvasEngineOutline,
  canvasEnginesToOutlineItems,
} from './canvas-engine-outline';

describe('buildCanvasEngineOutline', () => {
  it('nests research and sims under execution parent', () => {
    const families = buildCanvasEngineOutline([
      { id: 'exec-1', label: 'Day desk', templateId: 'engine_day_trading' },
      {
        id: 'res-1',
        label: 'Regime lab',
        templateId: 'research_market_regime_lab',
        parentExecutionId: 'exec-1',
        childKind: 'research',
      },
      {
        id: 'sim-gate',
        label: 'Gate sim',
        templateId: 'sim_policy_replay',
        parentExecutionId: 'exec-1',
        childKind: 'simulation',
        simRole: 'gate',
      },
      {
        id: 'sim-train',
        label: 'Train sim',
        templateId: 'sim_policy_replay',
        parentExecutionId: 'exec-1',
        childKind: 'simulation',
        simRole: 'training',
      },
      { id: 'orphan', label: 'Standalone research', templateId: 'research_web_fabric' },
    ]);

    expect(families).toHaveLength(2);
    expect(families[0]?.root.id).toBe('exec-1');
    expect(families[0]?.children.map((c) => c.id)).toEqual(['res-1', 'sim-gate', 'sim-train']);
    expect(families[1]?.root.id).toBe('orphan');
    expect(families[1]?.children).toEqual([]);
  });

  it('keeps children as roots when parent is absent', () => {
    const families = buildCanvasEngineOutline([
      {
        id: 'res-1',
        label: 'Orphan pack',
        templateId: 'research_web_fabric',
        parentExecutionId: 'missing-exec',
        childKind: 'research',
      },
    ]);
    expect(families).toEqual([
      {
        root: expect.objectContaining({ id: 'res-1' }),
        children: [],
      },
    ]);
  });
});

describe('canvasEnginesToOutlineItems', () => {
  it('uses simulationBinding parent and unique research-dep inference', () => {
    const items = canvasEnginesToOutlineItems([
      {
        id: 'exec-1',
        label: 'Day',
        templateId: 'engine_day_trading',
      },
      {
        id: 'res-1',
        label: 'Regime',
        templateId: 'research_market_regime_lab',
        setupSnapshot: null,
      },
      {
        id: 'sim-1',
        label: 'Gate',
        templateId: 'sim_gate_strategy_spread',
        setupSnapshot: {
          simulationBinding: {
            role: 'gate',
            parentExecutionEngineId: 'exec-1',
          },
        },
      },
    ]);
    expect(items.find((i) => i.id === 'res-1')).toMatchObject({
      parentExecutionId: 'exec-1',
      childKind: 'research',
    });
    expect(items.find((i) => i.id === 'sim-1')).toMatchObject({
      parentExecutionId: 'exec-1',
      childKind: 'simulation',
      simRole: 'gate',
    });
  });
});
