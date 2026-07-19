import { describe, expect, it } from 'vitest';
import {
  buildOptionAnchorId,
  buildOptionAnchorsForEngine,
  canvasVisibleOptionAnchors,
  optionAnchorCatalogSlice,
  OptionAnchorKind,
  slugCatalogRef,
} from './option-anchors';

const ENGINE_ID = 'eng-test-001';

function anchorsFor(templateId: string, members: Array<{ id: string; type: string; config?: Record<string, unknown> }>) {
  return buildOptionAnchorsForEngine({
    engineId: ENGINE_ID,
    templateId,
    members,
  });
}

function kindsPresent(anchors: ReturnType<typeof buildOptionAnchorsForEngine>): Set<string> {
  return new Set(anchors.map((anchor) => anchor.kind));
}

describe('option-anchors', () => {
  it('builds stable slugged ids without raw indices', () => {
    expect(slugCatalogRef('strat-001')).toBe('strat-001');
    expect(buildOptionAnchorId(ENGINE_ID, 'strategy_family', 'mod/strat-001')).toBe(
      `${ENGINE_ID}:strategy_family:mod-strat-001`,
    );
  });

  it('exposes catalog slice for UI consumers', () => {
    const slice = optionAnchorCatalogSlice();
    expect(slice.branchTypes?.length).toBeGreaterThan(0);
    expect(slice.leverToolsByScope?.tactical?.length).toBeGreaterThan(0);
    expect(slice.recoveryLadderTemplates?.length).toBeGreaterThan(0);
  });

  it('engine_day_trading yields template, family, branch, and lever anchors', () => {
    const anchors = anchorsFor('engine_day_trading', [
      {
        id: 'mod-trading-1',
        type: 'trading',
        config: { strategyFamilies: ['strat-001'] },
      },
    ]);

    expect(anchors.length).toBeGreaterThan(0);
    const kinds = kindsPresent(anchors);
    expect(kinds.has('template_input')).toBe(true);
    expect(kinds.has('strategy_family')).toBe(true);
    expect(kinds.has('branch_role')).toBe(true);
    expect(kinds.has('lever_band')).toBe(true);
    expect(kinds.has('recovery_phase')).toBe(true);
    expect(kinds.has('philosophy_axis')).toBe(true);

    const family = anchors.find((anchor) => anchor.kind === 'strategy_family');
    expect(family?.ownerModuleId).toBe('mod-trading-1');
    expect(family?.catalogRef).toContain('strat-001');

    const branch = anchors.find((anchor) => anchor.kind === 'branch_role');
    expect(branch?.parentAnchorId).toBe(family?.id);

    const lever = anchors.find(
      (anchor) => anchor.kind === 'lever_band' && anchor.parentAnchorId === branch?.id,
    );
    expect(lever).toBeDefined();

    for (const anchor of anchors) {
      expect(anchor.id).toMatch(new RegExp(`^${ENGINE_ID}:`));
      expect(OptionAnchorKind.safeParse(anchor.kind).success).toBe(true);
    }
  });

  it('engine_hft yields a non-empty anchor graph', () => {
    const anchors = anchorsFor('engine_hft', [
      {
        id: 'mod-hft-trading',
        type: 'trading',
        config: { strategyFamilies: ['strat-007'] },
      },
    ]);

    expect(anchors.length).toBeGreaterThan(0);
    const kinds = kindsPresent(anchors);
    expect(kinds.has('template_input')).toBe(true);
    expect(kinds.has('strategy_family')).toBe(true);
    expect(kinds.has('branch_role')).toBe(true);
    expect(kinds.has('lever_band')).toBe(true);
  });

  it('canvasVisibleOptionAnchors excludes lever_band', () => {
    const anchors = anchorsFor('engine_day_trading', [
      {
        id: 'mod-trading-1',
        type: 'trading',
        config: { strategyFamilies: ['strat-001'] },
      },
    ]);
    const visible = canvasVisibleOptionAnchors(anchors);
    expect(visible.some((anchor) => anchor.kind === 'lever_band')).toBe(false);
    expect(visible.some((anchor) => anchor.kind === 'strategy_family')).toBe(true);
    expect(visible.some((anchor) => anchor.kind === 'branch_role')).toBe(true);
  });
});
