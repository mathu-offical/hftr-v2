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
import {
  OPTION_ANCHOR_HANDLE_IN,
  OPTION_ANCHOR_HANDLE_OUT,
} from './OptionAnchorNode';
import type { CanvasEngineGroup, CanvasModule } from './types';

describe('option-anchor-graph placement (D-180)', () => {
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

  it('avoids vertical overlap between owner trees', () => {
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
    const researchBottom = Math.max(
      ...researchOwned.map((n) => n.position.y + OPTION_ANCHOR_NODE_HEIGHT),
    );
    const librarianTop = Math.min(...librarianOwned.map((n) => n.position.y));
    expect(librarianTop).toBeGreaterThanOrEqual(researchBottom);
  });

  it('centers free column in ENGINE_GROUP_PADDING.right', () => {
    const x = optionAnchorColumnX(900);
    expect(x).toBe(
      900 -
        ENGINE_GROUP_PADDING.right +
        Math.floor((ENGINE_GROUP_PADDING.right - OPTION_ANCHOR_COLUMN_WIDTH) / 2),
    );
  });

  it('wires option_bind edges with handles', () => {
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
    const ownerEdge = edges.find((e) => e.target === root!.id && e.source === researcherId);
    expect(ownerEdge?.targetHandle).toBe(OPTION_ANCHOR_HANDLE_IN);
    expect(ownerEdge?.sourceHandle).toBeTruthy();
    const child = visible.find((a) => a.parentAnchorId === root!.id);
    if (child) {
      const childEdge = edges.find((e) => e.target === child.id && e.source === root!.id);
      expect(childEdge?.sourceHandle).toBe(OPTION_ANCHOR_HANDLE_OUT);
      expect(childEdge?.targetHandle).toBe(OPTION_ANCHOR_HANDLE_IN);
    }
  });
});
