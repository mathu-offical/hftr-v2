import {
  ENGINE_TEMPLATES,
  CANVAS_LAYOUT,
  defaultEngineDataHubCompoundConfig,
  engineCreateSection,
  engineUtilityTargetHandleId,
  handleIdForLink,
  layoutEngineTemplateAtOrigin,
  placeDataHubOrigin,
  type EngineTemplate,
  type LinkKind,
} from '@hftr/contracts';
import type { Edge, Node } from '@xyflow/react';
import { LINK_COLORS } from '@/components/canvas/canvas-visuals';

/** Compact preview card size (create-form canvas) — closer to live proportions for chrome readability. */
export const PREVIEW_MODULE_WIDTH = 168;
export const PREVIEW_MODULE_HEIGHT = 72;
export const PREVIEW_GROUP_PADDING = {
  left: 28,
  right: 28,
  top: 36,
  bottom: 20,
} as const;

const POSITION_SCALE = 0.42;
const FAMILY_GAP_Y = 200;
const DEP_GAP_Y = 160;
const RESEARCH_TO_EXEC_GAP_X = CANVAS_LAYOUT.researchToExecGap * POSITION_SCALE;
const HUB_WIDTH = 120;
const HUB_HEIGHT = 48;
const ORPHAN_GAP_Y = 180;
const CANVAS_ORIGIN = { x: 48, y: 48 };

export type PreviewEngineSeed = {
  key: string;
  templateId: string;
  label: string;
  autoDependency?: boolean;
  cascadedFromKey?: string;
};

export type PreviewModuleNodeData = {
  name: string;
  moduleType: string;
  engineKey: string;
  config?: Record<string, unknown>;
};

export type PreviewEngineGroupNodeData = {
  engineKey: string;
  label: string;
  templateId: string;
  section: 'research' | 'execution' | 'simulation';
  autoDependency: boolean;
  selected: boolean;
  /** True when this engine is in the same cascade family as the selection. */
  familyActive: boolean;
};

export type PreviewFlowNode =
  Node<PreviewEngineGroupNodeData, 'previewEngine'> | Node<PreviewModuleNodeData, 'previewModule'>;

export type EngineSeedFamily = {
  root: PreviewEngineSeed;
  deps: PreviewEngineSeed[];
};

export type EngineSeedHierarchy = {
  families: EngineSeedFamily[];
  orphans: PreviewEngineSeed[];
};

function templateFor(templateId: string): EngineTemplate | undefined {
  return ENGINE_TEMPLATES.find((item) => item.id === templateId);
}

function sectionFor(seed: PreviewEngineSeed): 'research' | 'execution' | 'simulation' {
  const template = templateFor(seed.templateId);
  return template ? engineCreateSection(template) : 'research';
}

/**
 * Nest research deps under their execution parent (`cascadedFromKey`).
 * Standalone research (manual adds) appear as orphans.
 */
export function buildEngineSeedHierarchy(engines: PreviewEngineSeed[]): EngineSeedHierarchy {
  const byKey = new Map(engines.map((seed) => [seed.key, seed]));
  const claimed = new Set<string>();
  const families: EngineSeedFamily[] = [];

  for (const seed of engines) {
    if (sectionFor(seed) !== 'execution') continue;
    const deps = engines.filter((item) => item.cascadedFromKey === seed.key);
    for (const dep of deps) claimed.add(dep.key);
    claimed.add(seed.key);
    families.push({ root: seed, deps });
  }

  const orphans = engines.filter((seed) => {
    if (claimed.has(seed.key)) return false;
    if (seed.cascadedFromKey && byKey.has(seed.cascadedFromKey)) {
      // Parent exists but wasn't an execution root (shouldn't happen) — nest under orphans flat.
      return true;
    }
    return true;
  });

  return { families, orphans };
}

/** Keys belonging to the cascade family of the current selection (root + deps). */
export function cascadeFamilyKeys(
  engines: PreviewEngineSeed[],
  selectedEngineKey: string | null,
): Set<string> {
  if (!selectedEngineKey) return new Set();
  const selected = engines.find((seed) => seed.key === selectedEngineKey);
  if (!selected) return new Set([selectedEngineKey]);

  const rootKey =
    selected.cascadedFromKey ?? (sectionFor(selected) === 'execution' ? selected.key : null);
  if (!rootKey) return new Set([selectedEngineKey]);

  const keys = new Set<string>([rootKey]);
  for (const seed of engines) {
    if (seed.cascadedFromKey === rootKey) keys.add(seed.key);
  }
  return keys;
}

function computeCompactBounds(positions: readonly { x: number; y: number }[]) {
  if (positions.length === 0) {
    return {
      x: 0,
      y: 0,
      width: PREVIEW_GROUP_PADDING.left + PREVIEW_GROUP_PADDING.right + PREVIEW_MODULE_WIDTH,
      height: PREVIEW_GROUP_PADDING.top + PREVIEW_GROUP_PADDING.bottom + PREVIEW_MODULE_HEIGHT,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pos of positions) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + PREVIEW_MODULE_WIDTH);
    maxY = Math.max(maxY, pos.y + PREVIEW_MODULE_HEIGHT);
  }
  return {
    x: minX - PREVIEW_GROUP_PADDING.left,
    y: minY - PREVIEW_GROUP_PADDING.top,
    width: maxX - minX + PREVIEW_GROUP_PADDING.left + PREVIEW_GROUP_PADDING.right,
    height: maxY - minY + PREVIEW_GROUP_PADDING.top + PREVIEW_GROUP_PADDING.bottom,
  };
}

/** Layout via rankEngineMembers (D-212); scale for compact preview cards only. */
function scaledModulePositions(template: EngineTemplate, origin: { x: number; y: number }) {
  const { modulePositions } = layoutEngineTemplateAtOrigin(
    template.modules.map((module) => ({ type: module.type })),
    template.links,
    { x: 0, y: 0 },
    PREVIEW_GROUP_PADDING,
  );
  return modulePositions.map((pos) => ({
    x: pos.x * POSITION_SCALE + origin.x,
    y: pos.y * POSITION_SCALE + origin.y,
  }));
}

type PlacedEngine = {
  seed: PreviewEngineSeed;
  template: EngineTemplate;
  bounds: { x: number; y: number; width: number; height: number };
  absPositions: { x: number; y: number }[];
};

function placeEngine(
  seed: PreviewEngineSeed,
  origin: { x: number; y: number },
): PlacedEngine | null {
  const template = templateFor(seed.templateId);
  if (!template) return null;
  const absPositions = scaledModulePositions(template, origin);
  const bounds = computeCompactBounds(absPositions);
  return { seed, template, bounds, absPositions };
}

function appendEngineNodes(
  nodes: PreviewFlowNode[],
  edges: Edge[],
  placed: PlacedEngine,
  selectedEngineKey: string | null,
  familyActiveKeys: Set<string>,
) {
  const { seed, template, bounds, absPositions } = placed;
  const section = engineCreateSection(template);

  nodes.push({
    id: `eng:${seed.key}`,
    type: 'previewEngine',
    position: { x: bounds.x, y: bounds.y },
    data: {
      engineKey: seed.key,
      label: seed.label,
      templateId: seed.templateId,
      section,
      autoDependency: Boolean(seed.autoDependency),
      selected: selectedEngineKey === seed.key,
      familyActive: familyActiveKeys.has(seed.key),
    },
    style: {
      width: bounds.width,
      height: bounds.height,
      zIndex: -1,
    },
    selectable: true,
    draggable: false,
  });

  template.modules.forEach((module, moduleIndex) => {
    const abs = absPositions[moduleIndex]!;
    nodes.push({
      id: `mod:${seed.key}:${moduleIndex}`,
      type: 'previewModule',
      parentId: `eng:${seed.key}`,
      extent: 'parent',
      position: {
        x: abs.x - bounds.x,
        y: abs.y - bounds.y,
      },
      data: {
        name: module.name,
        moduleType: module.type,
        engineKey: seed.key,
        config: module.config,
      },
      style: { width: PREVIEW_MODULE_WIDTH, height: PREVIEW_MODULE_HEIGHT },
      selectable: false,
      draggable: false,
    });
  });

  template.links.forEach((link, linkIndex) => {
    const kind = link.linkKind as LinkKind;
    const routerIndex = template.modules.findIndex((module) => module.type === 'fund_router');
    const usesLegacyFundPathMath =
      link.fromIndex === 'math' || link.toIndex === 'math';
    if (usesLegacyFundPathMath && routerIndex < 0) return;

    let sourceId: string;
    let targetId: string;
    if (usesLegacyFundPathMath) {
      // D-221 legacy template stub — D-229 templates use holding_fund → fund_router direct.
      const fundMathId = `mod:${seed.key}:fundMath`;
      if (!nodes.some((node) => node.id === fundMathId)) {
        const routerAbs = absPositions[routerIndex]!;
        nodes.push({
          id: fundMathId,
          type: 'previewModule',
          parentId: `eng:${seed.key}`,
          extent: 'parent',
          position: {
            x: routerAbs.x - bounds.x + 12,
            y: routerAbs.y - bounds.y + PREVIEW_MODULE_HEIGHT + 10,
          },
          data: {
            name: 'FundMath',
            moduleType: 'math',
            engineKey: seed.key,
            config: { mathType: 'fund_path' },
          },
          style: { width: PREVIEW_MODULE_WIDTH * 0.85, height: 36 },
          selectable: false,
          draggable: false,
        });
      }
      sourceId =
        link.fromIndex === 'math' ? fundMathId : `mod:${seed.key}:${link.fromIndex}`;
      targetId = link.toIndex === 'math' ? fundMathId : `mod:${seed.key}:${link.toIndex}`;
    } else {
      sourceId = `mod:${seed.key}:${link.fromIndex}`;
      targetId = `mod:${seed.key}:${link.toIndex}`;
    }

    edges.push({
      id: `link:${seed.key}:${linkIndex}`,
      source: sourceId,
      target: targetId,
      type: 'smoothstep',
      sourceHandle: handleIdForLink(kind, 'out'),
      targetHandle: handleIdForLink(kind, 'in'),
      style: { stroke: LINK_COLORS[kind], strokeWidth: 1.25 },
      label: kind.replace('_', ' '),
      labelStyle: { fill: 'var(--color-ink-faint)', fontSize: 8 },
      labelBgStyle: { fill: 'var(--color-surface-0)' },
      selectable: false,
      focusable: false,
    });
  });
}

/** D-168: no default eng↔eng preview bridges — only Data Hub → exec data_in. */

/** D-159 / D-168: synthetic Data Hub between research and execution, wired to exec data_in. */
function appendFamilyDataHub(
  nodes: PreviewFlowNode[],
  edges: Edge[],
  familyKey: string,
  researchBounds: { x: number; y: number; width: number; height: number }[],
  execution: PlacedEngine,
  familyActive: boolean,
) {
  const hubSize = { width: HUB_WIDTH, height: HUB_HEIGHT };
  const origin = placeDataHubOrigin(researchBounds, execution.bounds, hubSize);
  const hubId = `hub:${familyKey}`;

  const compound = defaultEngineDataHubCompoundConfig();
  nodes.push({
    id: hubId,
    type: 'previewModule',
    position: { x: origin.x, y: origin.y },
    data: {
      name: 'Data Hub',
      moduleType: 'library',
      engineKey: familyKey,
      config: {
        libraryClass: 'engine_data_hub',
        engineDataHub: true,
        shelves: compound.shelves,
        shelfOutputs: compound.shelfOutputs,
        topicFeed: compound.topicFeed,
      },
    },
    style: { width: HUB_WIDTH, height: HUB_HEIGHT, zIndex: 1 },
    selectable: false,
    draggable: false,
  });

  edges.push({
    id: `bridge:hub:${familyKey}`,
    source: hubId,
    target: `eng:${execution.seed.key}`,
    type: 'smoothstep',
    animated: true,
    sourceHandle: handleIdForLink('data_feed', 'out'),
    targetHandle: engineUtilityTargetHandleId('data_in'),
    style: {
      stroke: LINK_COLORS.data_feed,
      strokeWidth: 1.5,
      strokeDasharray: '4 3',
    },
    label: 'Data Hub',
    labelStyle: { fill: 'var(--color-accent)', fontSize: 8 },
    labelBgStyle: { fill: 'var(--color-surface-0)' },
    selectable: false,
    focusable: false,
    data: { kind: 'data_hub_bridge', familyActive },
  });
}

/**
 * Build a read-only React Flow graph from create-form engine seeds.
 *
 * Placement (D-159):
 * - Each execution family: research deps left → Data Hub gap → execution right
 * - Families stacked top→bottom
 * - Standalone research engines as orphans (left column)
 *
 * Edges:
 * - Intra-engine template links (member → member)
 * - Data Hub → exec data_in (D-168: no default eng↔eng bridges)
 */
export function buildTemplatePreviewGraph(input: {
  engines: PreviewEngineSeed[];
  selectedEngineKey: string | null;
}): { nodes: PreviewFlowNode[]; edges: Edge[] } {
  const nodes: PreviewFlowNode[] = [];
  const edges: Edge[] = [];
  const { families, orphans } = buildEngineSeedHierarchy(input.engines);
  const familyActiveKeys = cascadeFamilyKeys(input.engines, input.selectedEngineKey);

  let cursorY = CANVAS_ORIGIN.y;

  for (const family of families) {
    const placedDeps: PlacedEngine[] = [];
    let depCursorY = cursorY;
    let depsRight = CANVAS_ORIGIN.x;
    let depsBottom = cursorY;

    for (const dep of family.deps) {
      const placed = placeEngine(dep, { x: CANVAS_ORIGIN.x, y: depCursorY });
      if (!placed) continue;
      placedDeps.push(placed);
      depsRight = Math.max(depsRight, placed.bounds.x + placed.bounds.width);
      depsBottom = Math.max(depsBottom, placed.bounds.y + placed.bounds.height);
      depCursorY = placed.bounds.y + placed.bounds.height + DEP_GAP_Y;
    }

    const execOriginX =
      family.deps.length > 0 ? depsRight + RESEARCH_TO_EXEC_GAP_X : CANVAS_ORIGIN.x;
    const execOriginY = cursorY;
    const placedExec = placeEngine(family.root, { x: execOriginX, y: execOriginY });
    if (!placedExec) continue;

    for (const placed of placedDeps) {
      appendEngineNodes(nodes, edges, placed, input.selectedEngineKey, familyActiveKeys);
    }
    appendEngineNodes(nodes, edges, placedExec, input.selectedEngineKey, familyActiveKeys);

    if (engineCreateSection(placedExec.template) === 'execution') {
      appendFamilyDataHub(
        nodes,
        edges,
        family.root.key,
        placedDeps.map((d) => d.bounds),
        placedExec,
        familyActiveKeys.has(family.root.key),
      );
    }

    const familyBottom = Math.max(depsBottom, placedExec.bounds.y + placedExec.bounds.height);
    cursorY = familyBottom + FAMILY_GAP_Y;
  }

  for (const orphan of orphans) {
    const placed = placeEngine(orphan, { x: CANVAS_ORIGIN.x, y: cursorY });
    if (!placed) continue;
    appendEngineNodes(nodes, edges, placed, input.selectedEngineKey, familyActiveKeys);
    cursorY = placed.bounds.y + placed.bounds.height + ORPHAN_GAP_Y;
  }

  return { nodes, edges };
}

