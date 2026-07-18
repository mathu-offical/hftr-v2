import { describe, expect, it } from 'vitest';
import {
  buildEngineSeedHierarchy,
  buildTemplatePreviewGraph,
} from './build-template-preview-graph';

describe('buildEngineSeedHierarchy', () => {
  it('nests research deps under execution and keeps standalone orphans', () => {
    const engines = [
      {
        key: 'dep-regime',
        templateId: 'research_market_regime_lab',
        label: 'Market regime lab',
        autoDependency: true,
        cascadedFromKey: 'exec-day',
      },
      {
        key: 'orphan-trend',
        templateId: 'engine_trend_research',
        label: 'Trend research engine',
      },
      {
        key: 'exec-day',
        templateId: 'engine_day_trading',
        label: 'Day trading engine',
      },
      {
        key: 'dep-desk',
        templateId: 'research_desk_aligned',
        label: 'Desk-aligned research',
        autoDependency: true,
        cascadedFromKey: 'exec-day',
      },
    ];

    const { families, orphans } = buildEngineSeedHierarchy(engines);
    expect(families).toHaveLength(1);
    expect(families[0]!.root.key).toBe('exec-day');
    expect(families[0]!.deps.map((d) => d.key).sort()).toEqual(['dep-desk', 'dep-regime']);
    expect(orphans.map((o) => o.key)).toEqual(['orphan-trend']);
  });
});

describe('buildTemplatePreviewGraph', () => {
  it('places research left of execution and wires research→exec bridges', () => {
    const engines = [
      {
        key: 'dep-regime',
        templateId: 'research_market_regime_lab',
        label: 'Market regime lab',
        autoDependency: true,
        cascadedFromKey: 'exec-day',
      },
      {
        key: 'dep-desk',
        templateId: 'research_desk_aligned',
        label: 'Desk-aligned research',
        autoDependency: true,
        cascadedFromKey: 'exec-day',
      },
      {
        key: 'exec-day',
        templateId: 'engine_day_trading',
        label: 'Day trading engine',
      },
    ];

    const { nodes, edges } = buildTemplatePreviewGraph({
      engines,
      selectedEngineKey: 'exec-day',
    });

    const groups = nodes.filter((node) => node.type === 'previewEngine');
    expect(groups).toHaveLength(3);

    const exec = groups.find((node) => node.id === 'eng:exec-day')!;
    const regime = groups.find((node) => node.id === 'eng:dep-regime')!;
    const desk = groups.find((node) => node.id === 'eng:dep-desk')!;
    expect(regime.position.x).toBeLessThan(exec.position.x);
    expect(desk.position.x).toBeLessThan(exec.position.x);
    expect(desk.position.y - (regime.position.y + (regime.style?.height as number))).toBeGreaterThanOrEqual(100);

    const templateLinks = edges.filter((edge) => String(edge.id).startsWith('link:'));
    const bridges = edges.filter((edge) => String(edge.id).startsWith('bridge:'));
    expect(templateLinks.length).toBeGreaterThan(0);
    expect(bridges).toHaveLength(2);
    expect(bridges.every((edge) => String(edge.source).startsWith('mod:dep-'))).toBe(true);
    expect(bridges.every((edge) => String(edge.target).startsWith('mod:exec-day:'))).toBe(true);
    expect(edges.some((edge) => String(edge.id).startsWith('cascade:'))).toBe(false);
    expect(
      edges.every(
        (edge) =>
          typeof edge.sourceHandle === 'string' &&
          edge.sourceHandle.length > 0 &&
          typeof edge.targetHandle === 'string' &&
          edge.targetHandle.length > 0,
      ),
    ).toBe(true);
  });

  it('skips bridges when an engine template has no modules', () => {
    const { edges } = buildTemplatePreviewGraph({
      engines: [
        {
          key: 'dep-empty',
          templateId: 'engine_hft',
          label: 'Empty dep',
          autoDependency: true,
          cascadedFromKey: 'exec-day',
        },
        {
          key: 'exec-day',
          templateId: 'engine_day_trading',
          label: 'Day trading engine',
        },
      ],
      selectedEngineKey: 'exec-day',
    });
    expect(edges.filter((edge) => String(edge.id).startsWith('bridge:'))).toHaveLength(0);
    expect(edges.filter((edge) => String(edge.id).startsWith('cascade:'))).toHaveLength(0);
  });
});
