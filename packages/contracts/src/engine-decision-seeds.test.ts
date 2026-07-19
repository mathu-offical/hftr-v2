import { describe, expect, it } from 'vitest';
import {
  CATEGORY_STRATEGY_PALETTE,
  deriveDecisionSeedsFromModules,
  resolveEngineDecisionSeeds,
  resolveStrategyFamiliesForTrader,
} from './engine-decision-seeds';
import { buildOptionAnchorsForEngine, canvasVisibleOptionAnchors } from './option-anchors';
import { ENGINE_TEMPLATES, getEngineTemplateById } from './templates';

describe('engine decision seeds (D-202 refine)', () => {
  it('maps category strategy palettes to catalog families', () => {
    expect(CATEGORY_STRATEGY_PALETTE.day_trading).toEqual([
      'strat-001',
      'strat-002',
      'strat-005',
    ]);
    expect(CATEGORY_STRATEGY_PALETTE.high_frequency).toEqual(['strat-007']);
    expect(CATEGORY_STRATEGY_PALETTE.crypto).toEqual([
      'strat-003',
      'strat-005',
      'strat-008',
    ]);
    expect(CATEGORY_STRATEGY_PALETTE.long_term).toEqual([
      'strat-003',
      'strat-004',
      'strat-009',
    ]);
    expect(CATEGORY_STRATEGY_PALETTE.prediction).toEqual(['strat-005', 'strat-008']);
  });

  it('falls back to category palette when strategyFamilies empty', () => {
    expect(resolveStrategyFamiliesForTrader({}, 'day_trading')).toEqual([
      'strat-001',
      'strat-002',
      'strat-005',
    ]);
    expect(resolveStrategyFamiliesForTrader({ strategyFamilies: [] }, 'prediction')).toEqual([
      'strat-005',
      'strat-008',
    ]);
  });

  it('every ENGINE_TEMPLATE declares or derives decision seeds', () => {
    for (const template of ENGINE_TEMPLATES) {
      const seeds = resolveEngineDecisionSeeds(template);
      expect(seeds.length, template.id).toBeGreaterThan(0);
      if (!template.decisionNodes?.length) {
        const derived = deriveDecisionSeedsFromModules(template);
        expect(derived.length, template.id).toBeGreaterThan(0);
      }
    }
  });

  it('day trading builds strategy + recovery + research pipeline decisions', () => {
    const template = getEngineTemplateById('engine_day_trading')!;
    const members = template.modules.map((mod, i) => ({
      id: `m${i}`,
      type: mod.type,
      config: (mod.config ?? {}) as Record<string, unknown>,
    }));
    const anchors = buildOptionAnchorsForEngine({
      engineId: 'eng-day',
      templateId: 'engine_day_trading',
      members,
    });
    const visible = canvasVisibleOptionAnchors(anchors);
    expect(visible.some((a) => a.kind === 'strategy_family')).toBe(true);
    expect(visible.some((a) => a.kind === 'recovery_phase')).toBe(true);
    expect(visible.some((a) => a.kind === 'research_subtype')).toBe(true);
    const families = visible.filter((a) => a.kind === 'strategy_family');
    expect(families.length).toBe(1);
    expect(families[0]!.options.map((o) => o.id).sort()).toEqual([
      'strat-001',
      'strat-002',
      'strat-005',
    ]);
    expect(visible.some((a) => a.kind === 'branch_role')).toBe(true);
    expect(visible.some((a) => a.kind === 'template_input')).toBe(false);
  });

  it('prediction engine uses interim reversion + pairs palette', () => {
    const template = getEngineTemplateById('engine_prediction')!;
    const members = template.modules.map((mod, i) => ({
      id: `p${i}`,
      type: mod.type,
      config: (mod.config ?? {}) as Record<string, unknown>,
    }));
    const trader = members.find((m) => m.type === 'trading')!;
    expect(resolveStrategyFamiliesForTrader(trader.config, 'prediction')).toEqual([
      'strat-005',
      'strat-008',
    ]);
    const anchors = buildOptionAnchorsForEngine({
      engineId: 'eng-pred',
      templateId: 'engine_prediction',
      members,
    });
    const families = anchors.filter((a) => a.kind === 'strategy_family');
    expect(families).toHaveLength(1);
    expect(families[0]!.options.map((f) => f.id).sort()).toEqual([
      'strat-005',
      'strat-008',
    ]);
  });

  it('HFT seeds one market-making strategy node', () => {
    const template = getEngineTemplateById('engine_hft')!;
    const members = template.modules.map((mod, i) => ({
      id: `h${i}`,
      type: mod.type,
      config: (mod.config ?? {}) as Record<string, unknown>,
    }));
    const anchors = buildOptionAnchorsForEngine({
      engineId: 'eng-hft',
      templateId: 'engine_hft',
      members,
    });
    const families = anchors.filter((a) => a.kind === 'strategy_family');
    expect(families).toHaveLength(1);
    expect(families[0]?.options.map((o) => o.id)).toEqual(['strat-007']);
  });

  it('long-term dual research exposes sibling decision roots per curator', () => {
    const template = getEngineTemplateById('engine_long_term')!;
    const members = template.modules.map((mod, i) => ({
      id: `l${i}`,
      type: mod.type,
      config: (mod.config ?? {}) as Record<string, unknown>,
    }));
    const anchors = buildOptionAnchorsForEngine({
      engineId: 'eng-lt',
      templateId: 'engine_long_term',
      members,
    });
    const subtypes = anchors.filter((a) => a.kind === 'research_subtype');
    expect(subtypes.length).toBeGreaterThanOrEqual(2);
    const families = anchors.filter((a) => a.kind === 'strategy_family');
    expect(families).toHaveLength(1);
    expect(families[0]!.options.map((f) => f.id).sort()).toEqual([
      'strat-003',
      'strat-004',
      'strat-009',
    ]);
  });
});
