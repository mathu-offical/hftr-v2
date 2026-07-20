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
  it('places research left of execution and wires only Data Hub → exec', () => {
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
    expect(
      desk.position.y - (regime.position.y + (regime.style?.height as number)),
    ).toBeGreaterThanOrEqual(100);

    const templateLinks = edges.filter((edge) => String(edge.id).startsWith('link:'));
    const researchBridges = edges.filter(
      (edge) =>
        String(edge.id).startsWith('bridge:') && !String(edge.id).startsWith('bridge:hub:'),
    );
    const hubBridges = edges.filter((edge) => String(edge.id).startsWith('bridge:hub:'));
    expect(templateLinks.length).toBeGreaterThan(0);
    expect(researchBridges).toHaveLength(0);
    expect(hubBridges).toHaveLength(1);
    expect(hubBridges[0]!.source).toBe('hub:exec-day');
    expect(hubBridges[0]!.target).toBe('eng:exec-day');
    expect(nodes.some((node) => node.id === 'hub:exec-day')).toBe(true);
    const hubNode = nodes.find((node) => node.id === 'hub:exec-day')!;
    // Hub biased toward execution (D-168 strategic placement).
    expect(hubNode.position.x).toBeGreaterThan(regime.position.x);
    expect(hubNode.position.x).toBeLessThan(exec.position.x);
    const hubConfig = (hubNode.data as { config?: Record<string, unknown> }).config ?? {};
    expect(Array.isArray(hubConfig.shelves)).toBe(true);
    expect((hubConfig.shelves as unknown[]).length).toBe(12);
    expect(Array.isArray(hubConfig.shelfOutputs)).toBe(true);
    expect(hubConfig.topicFeed).toEqual({ enabled: true });
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

  it('skips eng↔eng bridges when a dependency template is missing but still hubs the exec', () => {
    const { edges, nodes } = buildTemplatePreviewGraph({
      engines: [
        {
          key: 'dep-empty',
          templateId: 'engine_does_not_exist',
          label: 'Missing dep',
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
    expect(
      edges.filter(
        (edge) =>
          String(edge.id).startsWith('bridge:') && !String(edge.id).startsWith('bridge:hub:'),
      ),
    ).toHaveLength(0);
    expect(edges.filter((edge) => String(edge.id).startsWith('bridge:hub:'))).toHaveLength(1);
    expect(nodes.some((node) => node.id === 'hub:exec-day')).toBe(true);
    expect(edges.filter((edge) => String(edge.id).startsWith('cascade:'))).toHaveLength(0);
  });
});
