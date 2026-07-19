import { describe, expect, it } from 'vitest';
import {
  missingChildDependenciesForExecution,
  presentChildDependenciesForExecution,
  presentChildTemplateIdsForExecution,
  requiredChildDependenciesForExecution,
} from './engine-dependencies';

describe('engine child dependencies', () => {
  it('day_trading missing both research packs when present empty', () => {
    const missing = missingChildDependenciesForExecution('engine_day_trading', new Set());
    const research = missing.filter((dep) => dep.kind === 'research');
    expect(research.map((dep) => dep.templateId).sort()).toEqual([
      'research_desk_aligned',
      'research_market_regime_lab',
    ]);
    expect(missing.filter((dep) => dep.kind === 'simulation')).toHaveLength(2);
  });

  it('day_trading missing nothing when both research + both sims present', () => {
    const present = new Set([
      'research_market_regime_lab',
      'research_desk_aligned',
      'sim_gate_strategy_spread',
      'sim_train_policy_replay',
    ]);
    expect(missingChildDependenciesForExecution('engine_day_trading', present)).toEqual([]);
  });

  it('hft required list includes microstructure lab + 2 sims', () => {
    const required = requiredChildDependenciesForExecution('engine_hft');
    expect(required.map((dep) => dep.templateId)).toEqual([
      'research_microstructure_lab',
      'sim_gate_strategy_spread',
      'sim_train_policy_replay',
    ]);
    expect(required.find((dep) => dep.templateId === 'research_microstructure_lab')?.kind).toBe(
      'research',
    );
    expect(
      required.find((dep) => dep.templateId === 'sim_gate_strategy_spread'),
    ).toMatchObject({ kind: 'simulation', placement: 'pre', role: 'gate' });
    expect(
      required.find((dep) => dep.templateId === 'sim_train_policy_replay'),
    ).toMatchObject({ kind: 'simulation', placement: 'post', role: 'training' });
  });

  it('present children are scoped to the parent execution, not canvas-wide', () => {
    const execA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const execB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const presentForA = presentChildTemplateIdsForExecution(execA, [
      { id: execA, templateId: 'engine_day_trading' },
      { id: execB, templateId: 'engine_day_trading' },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        templateId: 'research_market_regime_lab',
        researchLibraryBinding: {
          mode: 'attach_execution',
          engineInstanceId: execB,
        },
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        templateId: 'sim_gate_strategy_spread',
        simulationBinding: {
          role: 'gate',
          placement: 'pre',
          parentExecutionEngineId: execB,
          mimicParent: true,
        },
      },
    ]);
    expect([...presentForA]).toEqual([]);
    expect(
      missingChildDependenciesForExecution('engine_day_trading', presentForA).map(
        (dep) => dep.templateId,
      ),
    ).toContain('research_market_regime_lab');
  });

  it('presentChildDependenciesForExecution lists attached required children', () => {
    const present = new Set([
      'research_market_regime_lab',
      'research_desk_aligned',
      'sim_gate_strategy_spread',
    ]);
    const attached = presentChildDependenciesForExecution('engine_day_trading', present);
    expect(attached.map((dep) => dep.templateId).sort()).toEqual([
      'research_desk_aligned',
      'research_market_regime_lab',
      'sim_gate_strategy_spread',
    ]);
    expect(attached.every((dep) => dep.label.length > 0)).toBe(true);
  });
});
