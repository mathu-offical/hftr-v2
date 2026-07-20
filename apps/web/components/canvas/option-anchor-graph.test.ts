import { describe, expect, it } from 'vitest';
import {
  ENGINE_GROUP_PADDING,
  CANVAS_LAYOUT,
  buildOptionAnchorsForEngine,
  canvasVisibleOptionAnchors,
  DECISION_HANDLE_DATA_IN,
} from '@hftr/contracts';
import {
  optionAnchorColumnX,
  optionBindEdgesForEngine,
  placeOptionAnchorNodes,
  OPTION_ANCHOR_NODE_HEIGHT,
  OPTION_ANCHOR_COLUMN_WIDTH,
} from './option-anchor-graph';
import type { CanvasEngineGroup, CanvasModule } from './types';

describe('decision-node graph placement (D-192 / D-180 / D-217)', () => {
  const engine: CanvasEngineGroup = {
    id: '11111111-1111-1111-1111-111111111111',
    templateId: 'research_web_fabric',
    label: 'Web fabric',
    masterTopicSectors: [],
    canvasBounds: { x: 40, y: 40, width: 1100, height: 700 },
    memberModuleIds: [],
    setupSnapshot: null,
    templateInputs: {},
  };

  const researcherId = '22222222-2222-2222-2222-222222222222';
  const librarianId = '33333333-3333-3333-3333-333333333333';
  const libraryId = '44444444-4444-4444-4444-444444444444';
  const analyzerId = '55555555-5555-5555-5555-555555555555';

  const modules: CanvasModule[] = [
    {
      id: researcherId,
      type: 'research',
      name: 'Research',
      generatedNameBase: 'Research',
      nameCustomized: false,
      status: 'draft',
      position: { x: 40 + ENGINE_GROUP_PADDING.left, y: 40 + 120 },
      topicSectors: [],
      capitalAllocationRef: null,
      targetExitRef: null,
      missingSetupFields: [],
      engineInstanceId: engine.id,
      toolOwnerModuleId: null,
      topicSectorsOverridden: false,
      config: { researchSubtype: 'external_web', curiosity: 'balanced' },
    },
    {
      id: librarianId,
      type: 'librarian',
      name: 'Librarian',
      generatedNameBase: 'Librarian',
      nameCustomized: false,
      status: 'draft',
      position: { x: 40 + ENGINE_GROUP_PADDING.left, y: 40 + 400 },
      topicSectors: [],
      capitalAllocationRef: null,
      targetExitRef: null,
      missingSetupFields: [],
      engineInstanceId: engine.id,
      toolOwnerModuleId: null,
      topicSectorsOverridden: false,
      config: { librarianSubtype: 'librarian_relevance' },
    },
    {
      id: libraryId,
      type: 'library',
      name: 'Library',
      generatedNameBase: 'Library',
      nameCustomized: false,
      status: 'draft',
      position: {
        x: 40 + ENGINE_GROUP_PADDING.left + CANVAS_LAYOUT.moduleWidth + CANVAS_LAYOUT.horizontalGutter,
        y: 40 + 120,
      },
      topicSectors: [],
      capitalAllocationRef: null,
      targetExitRef: null,
      missingSetupFields: [],
      engineInstanceId: engine.id,
      toolOwnerModuleId: null,
      topicSectorsOverridden: false,
      config: { libraryClass: 'topic_runtime' },
    },
    {
      id: analyzerId,
      type: 'analyzer',
      name: 'Concat',
      generatedNameBase: 'Concat',
      nameCustomized: false,
      status: 'draft',
      position: {
        x:
          40 +
          ENGINE_GROUP_PADDING.left +
          2 * (CANVAS_LAYOUT.moduleWidth + CANVAS_LAYOUT.horizontalGutter),
        y: 40 + 120,
      },
      topicSectors: [],
      capitalAllocationRef: null,
      targetExitRef: null,
      missingSetupFields: [],
      engineInstanceId: engine.id,
      toolOwnerModuleId: null,
      topicSectorsOverridden: false,
      config: { emitMode: 'to_desk_stream', hubFeedClass: 'analyzed' },
    },
  ];

  it('docks owned roots in the reserved right column (D-218)', () => {
    const all = buildOptionAnchorsForEngine({
      engineId: engine.id,
      templateId: engine.templateId,
      members: modules.map((m) => ({
        id: m.id,
        type: m.type,
        ...(m.config ? { config: m.config } : {}),
      })),
    });
    const placed = placeOptionAnchorNodes(engine, engine.canvasBounds!.width, all, modules);
    const pipelineRoot = placed.find(
      (n) => n.data.kind === 'branch_role' && n.data.ownerModuleId === researcherId,
    );
    expect(pipelineRoot).toBeTruthy();
    expect(pipelineRoot!.position.x).toBe(optionAnchorColumnX(engine.canvasBounds!.width));
    expect(pipelineRoot!.position.y).toBe(120);
  });

  it('stacks owners in one right column without mid-lane overlap (D-218)', () => {
    const all = buildOptionAnchorsForEngine({
      engineId: engine.id,
      templateId: engine.templateId,
      members: modules.map((m) => ({
        id: m.id,
        type: m.type,
        ...(m.config ? { config: m.config } : {}),
      })),
    });
    const placed = placeOptionAnchorNodes(engine, engine.canvasBounds!.width, all, modules);
    const pipelineRoot = placed.find(
      (n) => n.data.kind === 'branch_role' && n.data.ownerModuleId === researcherId,
    );
    const emitRoot = placed.find(
      (n) => n.data.kind === 'emit_mode' && n.data.ownerModuleId === analyzerId,
    );
    expect(pipelineRoot).toBeTruthy();
    expect(emitRoot).toBeTruthy();
    const colX = optionAnchorColumnX(engine.canvasBounds!.width);
    expect(pipelineRoot!.position.x).toBe(colX);
    expect(emitRoot!.position.x).toBe(colX);
    // Shared column stacks — later owners clear prior decision bottoms.
    expect(emitRoot!.position.y).toBeGreaterThanOrEqual(pipelineRoot!.position.y);
  });

  it('avoids vertical overlap between owner decision stacks', () => {
    const dualAnalyzers: CanvasModule[] = [
      {
        ...modules[0]!,
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        type: 'analyzer',
        name: 'Analyzed',
        generatedNameBase: 'Analyzed',
        position: { x: 40 + ENGINE_GROUP_PADDING.left, y: 40 + 120 },
        config: { emitMode: 'to_desk_stream', hubFeedClass: 'analyzed' },
      },
      {
        ...modules[0]!,
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        type: 'analyzer',
        name: 'Direct',
        generatedNameBase: 'Direct',
        position: { x: 40 + ENGINE_GROUP_PADDING.left, y: 40 + 400 },
        config: { emitMode: 'to_library', hubFeedClass: 'direct' },
      },
    ];
    const all = buildOptionAnchorsForEngine({
      engineId: engine.id,
      templateId: 'sim_gate_strategy_spread',
      members: dualAnalyzers.map((m) => ({
        id: m.id,
        type: m.type,
        ...(m.config ? { config: m.config } : {}),
      })),
    });
    const placed = placeOptionAnchorNodes(
      engine,
      engine.canvasBounds!.width,
      all,
      dualAnalyzers,
    );
    const topOwned = placed.filter(
      (n) => n.data.ownerModuleId === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
    const bottomOwned = placed.filter(
      (n) => n.data.ownerModuleId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    );
    expect(topOwned.length).toBeGreaterThan(0);
    expect(bottomOwned.length).toBeGreaterThan(0);
    const heightOf = (n: (typeof placed)[number]) =>
      Math.max(OPTION_ANCHOR_NODE_HEIGHT, 36 + (n.data.options?.length ?? 0) * 14);
    const topBottom = Math.max(...topOwned.map((n) => n.position.y + heightOf(n)));
    const bottomTop = Math.min(...bottomOwned.map((n) => n.position.y));
    expect(bottomTop).toBeGreaterThanOrEqual(topBottom);
  });

  it('places decisionNode cards with options config (no child option cards)', () => {
    const all = buildOptionAnchorsForEngine({
      engineId: engine.id,
      templateId: engine.templateId,
      members: modules.map((m) => ({
        id: m.id,
        type: m.type,
        ...(m.config ? { config: m.config } : {}),
      })),
    });
    const curiosity = all.find((a) => a.kind === 'curiosity_band');
    expect(curiosity?.parentAnchorId ?? null).toBeNull();
    expect((curiosity?.options?.length ?? 0)).toBeGreaterThanOrEqual(2);
    const placed = placeOptionAnchorNodes(engine, engine.canvasBounds!.width, all, modules);
    expect(placed.every((n) => n.type === 'decisionNode')).toBe(true);
    expect(placed.some((n) => (n.data.options?.length ?? 0) > 0)).toBe(true);
    // No parent→child option card edges among visible decisions
    expect(placed.every((n) => !n.data.parentAnchorId)).toBe(true);
    // Identity kinds stay off canvas (D-217)
    expect(placed.some((n) => n.data.kind === 'research_subtype')).toBe(false);
    expect(placed.some((n) => n.data.kind === 'library_class')).toBe(false);
  });

  it('centers free column in ENGINE_GROUP_PADDING.right', () => {
    const x = optionAnchorColumnX(900);
    expect(x).toBe(
      900 -
        ENGINE_GROUP_PADDING.right +
        Math.floor((ENGINE_GROUP_PADDING.right - OPTION_ANCHOR_COLUMN_WIDTH) / 2),
    );
  });

  it('wires owner→decision data intake binds (no parent→child option cards)', () => {
    const all = buildOptionAnchorsForEngine({
      engineId: engine.id,
      templateId: engine.templateId,
      members: modules.map((m) => ({
        id: m.id,
        type: m.type,
        ...(m.config ? { config: m.config } : {}),
      })),
    });
    const visible = canvasVisibleOptionAnchors(all);
    const edges = optionBindEdgesForEngine(all);
    const root = visible.find(
      (a) => a.kind === 'emit_mode' && a.ownerModuleId === analyzerId,
    );
    expect(root).toBeTruthy();
    expect(root!.options.map((o) => o.id)).toEqual(['to_desk_stream']);
    const dataEdge = edges.find(
      (e) =>
        e.target === root!.id &&
        e.source === analyzerId &&
        e.targetHandle === DECISION_HANDLE_DATA_IN,
    );
    expect(dataEdge).toBeTruthy();
    expect(visible.some((a) => a.parentAnchorId === root!.id)).toBe(false);
    expect(edges.some((e) => e.source === root!.id && e.target !== root!.id)).toBe(false);
  });

  it('horizontal gutter clears docked decision width (D-217)', () => {
    expect(CANVAS_LAYOUT.horizontalGutter).toBeGreaterThanOrEqual(
      CANVAS_LAYOUT.decisionOwnerGap + CANVAS_LAYOUT.decisionNodeWidth,
    );
    expect(ENGINE_GROUP_PADDING.right).toBeGreaterThanOrEqual(
      CANVAS_LAYOUT.optionAnchorColumnWidth,
    );
  });

  it('docks strategy_family in right column on day-trading-shaped engine (D-218)', () => {
    const execEngine: CanvasEngineGroup = {
      ...engine,
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      templateId: 'engine_day_trading',
      label: 'Day desk',
      canvasBounds: { x: 40, y: 40, width: 1600, height: 900 },
    };
    const trendId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const researchId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const tradeId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const execModules: CanvasModule[] = [
      {
        id: researchId,
        type: 'research',
        name: 'Desk research',
        generatedNameBase: 'Desk research',
        nameCustomized: false,
        status: 'draft',
        position: { x: 40 + ENGINE_GROUP_PADDING.left, y: 40 + 120 },
        topicSectors: [],
        capitalAllocationRef: null,
        targetExitRef: null,
        missingSetupFields: [],
        engineInstanceId: execEngine.id,
        toolOwnerModuleId: null,
        topicSectorsOverridden: false,
        config: { researchSubtype: 'specialty_desk' },
      },
      {
        id: trendId,
        type: 'trend',
        name: 'Trend',
        generatedNameBase: 'Trend',
        nameCustomized: false,
        status: 'draft',
        position: {
          x: 40 + ENGINE_GROUP_PADDING.left + 400,
          y: 40 + 200,
        },
        topicSectors: [],
        capitalAllocationRef: null,
        targetExitRef: null,
        missingSetupFields: [],
        engineInstanceId: execEngine.id,
        toolOwnerModuleId: null,
        topicSectorsOverridden: false,
        config: { trendPosture: 'session_intraday' },
      },
      {
        id: tradeId,
        type: 'trading',
        name: 'Trade',
        generatedNameBase: 'Trade',
        nameCustomized: false,
        status: 'draft',
        position: {
          x: 40 + ENGINE_GROUP_PADDING.left + 800,
          y: 40 + 200,
        },
        topicSectors: [],
        capitalAllocationRef: null,
        targetExitRef: null,
        missingSetupFields: [],
        engineInstanceId: execEngine.id,
        toolOwnerModuleId: null,
        topicSectorsOverridden: false,
        config: { strategyFamilies: ['strat-001'] },
      },
    ];
    const fullMembers = [
      { id: researchId, type: 'research' as const, config: { researchSubtype: 'specialty_desk' } },
      { id: 'libn', type: 'librarian' as const },
      { id: 'lib', type: 'library' as const },
      { id: 'live', type: 'live_api' as const },
      { id: trendId, type: 'trend' as const },
      { id: tradeId, type: 'trading' as const, config: { strategyFamilies: ['strat-001'] } },
      { id: 'hf', type: 'holding_fund' as const },
      { id: 'fr', type: 'fund_router' as const },
      { id: 'an', type: 'analyzer' as const },
      { id: 'pol', type: 'policy' as const },
    ];
    const all = buildOptionAnchorsForEngine({
      engineId: execEngine.id,
      templateId: execEngine.templateId,
      members: fullMembers,
    });
    const focus = all.find((a) => a.kind === 'template_input' && a.catalogRef === 'focus');
    expect(focus?.ownerModuleId).toBe(trendId);
    // Identity kinds stay inspector-only; canvas docks strategy_family beside trading.
    const strategy = all.find((a) => a.kind === 'strategy_family' && a.ownerModuleId === tradeId);
    expect(strategy).toBeTruthy();
    expect(canvasVisibleOptionAnchors(all).some((a) => a.kind === 'trend_posture')).toBe(false);
    const modulesForPlace = [
      ...execModules,
      ...fullMembers
        .filter((m) => !execModules.some((e) => e.id === m.id))
        .map((m, i) => ({
          id: m.id,
          type: m.type as CanvasModule['type'],
          name: m.type,
          generatedNameBase: m.type,
          nameCustomized: false,
          status: 'draft' as const,
          position: {
            x: 40 + ENGINE_GROUP_PADDING.left + (i % 3) * 200,
            y: 40 + 400 + Math.floor(i / 3) * 80,
          },
          topicSectors: [],
          capitalAllocationRef: null,
          targetExitRef: null,
          missingSetupFields: [] as CanvasModule['missingSetupFields'],
          engineInstanceId: execEngine.id,
          toolOwnerModuleId: null,
          topicSectorsOverridden: false,
          config: {},
        })),
    ];
    const placed = placeOptionAnchorNodes(
      execEngine,
      execEngine.canvasBounds!.width,
      all,
      modulesForPlace,
    );
    const strategyNode = placed.find((n) => n.id === strategy!.id);
    expect(strategyNode).toBeTruthy();
    expect(strategyNode!.type).toBe('decisionNode');
    expect(strategyNode!.position.x).toBe(optionAnchorColumnX(execEngine.canvasBounds!.width));
    expect(strategyNode!.position.y).toBeGreaterThanOrEqual(ENGINE_GROUP_PADDING.top);
    const edges = optionBindEdgesForEngine(all);
    const ownerEdge = edges.find((e) => e.target === strategy!.id);
    expect(ownerEdge?.source).toBe(tradeId);
    expect(ownerEdge?.targetHandle).toBe(DECISION_HANDLE_DATA_IN);
  });
});
