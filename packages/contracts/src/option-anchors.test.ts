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

  it('research engines yield subtype / curiosity / librarian / library trees (D-178)', () => {
    const anchors = anchorsFor('research_web_fabric', [
      {
        id: 'mod-research-1',
        type: 'research',
        config: {
          researchSubtype: 'external_web',
          curiosity: 'exploratory',
          cadenceMinutes: 60,
          admissionMode: 'auto_admit_validated',
        },
      },
      {
        id: 'mod-librarian-1',
        type: 'librarian',
        config: { librarianSubtype: 'librarian_relevance', cadenceMinutes: 120 },
      },
      {
        id: 'mod-library-1',
        type: 'library',
        config: { libraryClass: 'topic_runtime' },
      },
      {
        id: 'mod-analyzer-1',
        type: 'analyzer',
        config: { emitMode: 'to_desk_stream' },
      },
    ]);

    const kinds = kindsPresent(anchors);
    expect(kinds.has('template_input')).toBe(true);
    expect(kinds.has('research_subtype')).toBe(true);
    expect(kinds.has('curiosity_band')).toBe(true);
    expect(kinds.has('admission_mode')).toBe(true);
    expect(kinds.has('cadence_band')).toBe(true);
    expect(kinds.has('librarian_subtype')).toBe(true);
    expect(kinds.has('library_class')).toBe(true);
    expect(kinds.has('emit_mode')).toBe(true);
    expect(kinds.has('philosophy_axis')).toBe(true);
    expect(kinds.has('strategy_family')).toBe(false);

    const subtype = anchors.find((anchor) => anchor.kind === 'research_subtype');
    expect(subtype?.ownerModuleId).toBe('mod-research-1');
    expect(subtype?.catalogRef).toContain('external_web');

    const discover = anchors.find(
      (anchor) =>
        anchor.kind === 'branch_role' && anchor.catalogRef.endsWith('/discover'),
    );
    expect(discover?.parentAnchorId).toBe(subtype?.id);

    const visible = canvasVisibleOptionAnchors(anchors);
    expect(visible.some((anchor) => anchor.kind === 'research_subtype')).toBe(true);
    expect(visible.some((anchor) => anchor.kind === 'lever_band')).toBe(false);
  });

  it('trend research engine attaches trend_posture under the trend member', () => {
    const anchors = anchorsFor('engine_trend_research', [
      {
        id: 'mod-research-t',
        type: 'research',
        config: { researchSubtype: 'specialty_desk', curiosity: 'balanced' },
      },
      {
        id: 'mod-trend-t',
        type: 'trend',
        config: { trendPosture: 'research_only', cadenceMinutes: 90 },
      },
    ]);
    const posture = anchors.find((anchor) => anchor.kind === 'trend_posture');
    expect(posture?.ownerModuleId).toBe('mod-trend-t');
    expect(posture?.catalogRef).toContain('research_only');
  });

  it('focus template_input owns to trend via target.moduleIndex (D-191)', () => {
    const members = [
      { id: 'r1', type: 'research', config: { researchSubtype: 'specialty_desk' } },
      { id: 'libn1', type: 'librarian', config: {} },
      { id: 'lib1', type: 'library', config: { libraryClass: 'topic_runtime' } },
      { id: 'live1', type: 'live_api', config: {} },
      { id: 'trend1', type: 'trend', config: { trendPosture: 'session_intraday' } },
      { id: 'trade1', type: 'trading', config: { strategyFamilies: ['strat-001'] } },
      { id: 'fund1', type: 'holding_fund', config: {} },
      { id: 'router1', type: 'fund_router', config: {} },
      { id: 'an1', type: 'analyzer', config: {} },
      { id: 'pol1', type: 'policy', config: {} },
    ];
    const anchors = anchorsFor('engine_day_trading', members);
    const focus = anchors.find(
      (a) => a.kind === 'template_input' && a.catalogRef === 'focus',
    );
    expect(focus?.ownerModuleId).toBe('trend1');
    const topic = anchors.find(
      (a) => a.kind === 'template_input' && a.catalogRef === 'topicScope',
    );
    expect(topic?.ownerModuleId).toBe('r1');
    expect(
      anchors.some((a) => a.kind === 'template_input' && a.catalogRef === 'philosophy'),
    ).toBe(false);
  });

  it('sim_gate focus owns to trend; philosophy axes are slim', () => {
    const members = [
      { id: 'live', type: 'live_api', config: {} },
      { id: 'trend', type: 'trend', config: {} },
      { id: 'trade', type: 'trading', config: { strategyFamilies: ['strat-001'] } },
      { id: 'fund', type: 'holding_fund', config: {} },
      { id: 'router', type: 'fund_router', config: {} },
      { id: 'an', type: 'analyzer', config: {} },
      { id: 'pol', type: 'policy', config: {} },
    ];
    const anchors = anchorsFor('sim_gate_strategy_spread', members);
    const focus = anchors.find(
      (a) => a.kind === 'template_input' && a.catalogRef === 'focus',
    );
    expect(focus?.ownerModuleId).toBe('trend');
    const axes = anchors.filter((a) => a.kind === 'philosophy_axis');
    expect(axes.length).toBe(3);
    expect(
      anchors.some(
        (a) =>
          a.kind === 'lever_band' &&
          (a.catalogRef === 'run_paper_training_replay' ||
            a.catalogRef === 'apply_control_snapshot_delta'),
      ),
    ).toBe(true);
  });
});
