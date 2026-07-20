import { describe, expect, it } from 'vitest';
import { buildEntryOnlyCompositionPlan } from './order-composition';

describe('buildEntryOnlyCompositionPlan (D-244)', () => {
  const base = {
    leadRef: '00000000-0000-4000-8000-000000000001',
    decisionTreeRef: '00000000-0000-4000-8000-000000000002',
    tradingModuleId: '00000000-0000-4000-8000-000000000003',
  };

  it('builds a single primary_entry leg for entry_only', () => {
    const plan = buildEntryOnlyCompositionPlan(base);
    expect(plan.compositionMode).toBe('entry_only');
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]?.role).toBe('primary_entry');
  });

  it('fail-closes unsupported composition modes', () => {
    expect(() =>
      buildEntryOnlyCompositionPlan({ ...base, compositionMode: 'entry_plus_exits' }),
    ).toThrow(/composition_mode_entry_plus_exits_not_supported/);
    expect(() =>
      buildEntryOnlyCompositionPlan({ ...base, compositionMode: 'bracket' }),
    ).toThrow(/composition_mode_bracket_not_supported/);
  });
});
