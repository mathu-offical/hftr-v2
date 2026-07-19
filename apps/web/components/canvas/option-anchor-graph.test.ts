import { describe, expect, it } from 'vitest';
import {
  ENGINE_GROUP_PADDING,
  CANVAS_LAYOUT,
  buildOptionAnchorsForEngine,
  canvasVisibleOptionAnchors,
} from '@hftr/contracts';
import {
  optionAnchorColumnX,
  optionBindEdgesForEngine,
  placeOptionAnchorNodes,
  OPTION_ANCHOR_NODE_HEIGHT,
  OPTION_ANCHOR_OWNER_GAP,
  OPTION_ANCHOR_COLUMN_WIDTH,
} from './option-anchor-graph';
import { DECISION_HANDLE_DATA_IN } from '@hftr/contracts';
import type { CanvasEngineGroup, CanvasModule } from './types';

describe('decision-node graph placement (D-192 / D-180)', () => {
  const engine: CanvasEngineGroup = {
    id: '11111111-1111-1111-1111-111111111111',
    templateId: 'research_web_fabric',
    label: 'Web fabric',
    masterTopicSectors: [],
    canvasBounds: { x: 40, y: 40, width: 900, height: 700 },
    memberModuleIds: [],
    setupSnapshot: null,
    templateInputs: {},
  };

  const researcherId = '22222222-2222-2222-2222-222222222222';
  const librarianId = '33333333-3333-3333-3333-333333333333';
  const libraryId = '44444444-4444-4444-4444-444444444444';

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
        x: 40 + ENGINE_GROUP_PADDING.left + 460,
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
  ];

  it('docks owned roots beside owner modules with parent-relative coords', () => {
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
    const researchRoot = placed.find(
      (n) => n.data.kind === 'research_subtype' && n.data.ownerModuleId === researcherId,
    );
    expect(researchRoot).toBeTruthy();
    const expectedX =
      ENGINE_GROUP_PADDING.left + CANVAS_LAYOUT.moduleWidth + OPTION_ANCHOR_OWNER_GAP;
    expect(researchRoot!.position.x).toBe(expectedX);
    expect(researchRoot!.position.y).toBe(120);
  });

  it('avoids vertical overlap between owner decision stacks', () => {
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
    const researchOwned = placed.filter((n) => n.data.ownerModuleId === researcherId);
    const librarianOwned = placed.filter((n) => n.data.ownerModuleId === librarianId);
    const heightOf = (n: (typeof placed)[number]) =>
      Math.max(OPTION_ANCHOR_NODE_HEIGHT, 36 + (n.data.options?.length ?? 0) * 14);
    const researchBottom = Math.max(
      ...researchOwned.map((n) => n.position.y + heightOf(n)),
    );
    const librarianTop = Math.min(...librarianOwned.map((n) => n.position.y));
    expect(librarianTop).toBeGreaterThanOrEqual(researchBottom);
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
      (a) => a.kind === 'research_subtype' && a.ownerModuleId === researcherId,
    );
    expect(root).toBeTruthy();
    const dataEdge = edges.find(
      (e) =>
        e.target === root!.id &&
        e.source === researcherId &&
        e.targetHandle === DECISION_HANDLE_DATA_IN,
    );
    expect(dataEdge?.sourceHandle).toBeTruthy();
    expect(visible.some((a) => a.parentAnchorId === root!.id)).toBe(false);
    expect(edges.some((e) => e.source === root!.id && e.target !== root!.id)).toBe(false);
  });

  it('docks focus beside trend on day-trading-shaped engine (D-191)', () => {
    const execEngine: CanvasEngineGroup = {
      ...engine,
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      templateId: 'engine_day_trading',
      label: 'Day desk',
      canvasBounds: { x: 40, y: 40, width: 1400, height: 900 },
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
    // Full member list matching template order so focus resolves to trend index 4
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
    const focusNode = placed.find((n) => n.id === focus!.id);
    expect(focusNode).toBeTruthy();
    const trendRelX = ENGINE_GROUP_PADDING.left + 400;
    const trendRelY = 200;
    expect(focusNode!.position.x).toBe(
      trendRelX + CANVAS_LAYOUT.moduleWidth + OPTION_ANCHOR_OWNER_GAP,
    );
    // Non-overlap may push below owner Y when earlier owner trees are tall.
    expect(focusNode!.position.y).toBeGreaterThanOrEqual(trendRelY);
    const edges = optionBindEdgesForEngine(all);
    const ownerEdge = edges.find((e) => e.target === focus!.id);
    expect(ownerEdge?.source).toBe(trendId);
  });
});
