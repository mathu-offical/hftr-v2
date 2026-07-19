import {
  ENGINE_TEMPLATES,
  allowedLinkKinds,
  engineCreateSection,
  handleIdForLink,
  moduleLinkPorts,
  type EngineTemplate,
  type LinkKind,
  type ModuleType,
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
const RESEARCH_TO_EXEC_GAP_X = 200;
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
  section: 'research' | 'execution';
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

function sectionFor(seed: PreviewEngineSeed): 'research' | 'execution' {
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

function scaledModulePositions(template: EngineTemplate, origin: { x: number; y: number }) {
  return template.modules.map((module) => ({
    x: module.position.x * POSITION_SCALE + origin.x,
    y: module.position.y * POSITION_SCALE + origin.y,
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

/** Prefer library outputs for legal library→research bridges; then trend/research. */
function pickResearchBridgeSource(template: EngineTemplate): number {
  const preference: ModuleType[] = ['library', 'trend', 'research', 'librarian'];
  for (const type of preference) {
    for (let index = template.modules.length - 1; index >= 0; index -= 1) {
      const module = template.modules[index]!;
      if (module.type !== type) continue;
      if (moduleLinkPorts(module.type).outbound.includes('data_feed')) return index;
      if (moduleLinkPorts(module.type).outbound.includes('directive')) return index;
    }
  }
  for (let index = template.modules.length - 1; index >= 0; index -= 1) {
    if (moduleLinkPorts(template.modules[index]!.type).outbound.length > 0) return index;
  }
  return Math.max(0, template.modules.length - 1);
}

/** Prefer research/library inputs on the execution spine. */
function pickExecutionBridgeTarget(template: EngineTemplate): number {
  const preference: ModuleType[] = ['research', 'library', 'librarian', 'trend', 'trading'];
  for (const type of preference) {
    for (let index = 0; index < template.modules.length; index += 1) {
      const module = template.modules[index]!;
      if (module.type !== type) continue;
      if (moduleLinkPorts(module.type).inbound.includes('data_feed')) return index;
      if (moduleLinkPorts(module.type).inbound.includes('directive')) return index;
    }
  }
  for (let index = 0; index < template.modules.length; index += 1) {
    if (moduleLinkPorts(template.modules[index]!.type).inbound.length > 0) return index;
  }
  return 0;
}

function bridgeLinkKind(fromType: ModuleType, toType: ModuleType): LinkKind | null {
  const kinds = allowedLinkKinds(fromType, toType);
  const fromOut = new Set(moduleLinkPorts(fromType).outbound);
  const toIn = new Set(moduleLinkPorts(toType).inbound);
  const usable = kinds.filter((kind) => fromOut.has(kind) && toIn.has(kind));
  if (usable.includes('data_feed')) return 'data_feed';
  if (usable.includes('directive')) return 'directive';
  return usable[0] ?? null;
}

/** Resolve module indices + link kind that both expose matching handle ports. */
function resolveResearchExecBridge(
  research: EngineTemplate,
  execution: EngineTemplate,
): { fromIndex: number; toIndex: number; kind: LinkKind } | null {
  if (research.modules.length === 0 || execution.modules.length === 0) return null;

  const fromCandidates = [
    pickResearchBridgeSource(research),
    ...research.modules.map((_, index) => index),
  ];
  const toCandidates = [
    pickExecutionBridgeTarget(execution),
    ...execution.modules.map((_, index) => index),
  ];

  for (const fromIndex of fromCandidates) {
    const fromType = research.modules[fromIndex]!.type;
    for (const toIndex of toCandidates) {
      const toType = execution.modules[toIndex]!.type;
      const kind = bridgeLinkKind(fromType, toType);
      if (kind) return { fromIndex, toIndex, kind };
    }
  }
  return null;
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
    if (link.fromIndex === 'math' || link.toIndex === 'math') return;
    const kind = link.linkKind as LinkKind;
    edges.push({
      id: `link:${seed.key}:${linkIndex}`,
      source: `mod:${seed.key}:${link.fromIndex}`,
      target: `mod:${seed.key}:${link.toIndex}`,
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

function appendResearchToExecutionBridge(
  edges: Edge[],
  research: PlacedEngine,
  execution: PlacedEngine,
) {
  // Never wire eng→eng without Handle ports — React Flow logs #008 (handle id null).
  const bridge = resolveResearchExecBridge(research.template, execution.template);
  if (!bridge) return;

  const { fromIndex, toIndex, kind } = bridge;
  edges.push({
    id: `bridge:${research.seed.key}:${execution.seed.key}`,
    source: `mod:${research.seed.key}:${fromIndex}`,
    target: `mod:${execution.seed.key}:${toIndex}`,
    type: 'smoothstep',
    animated: true,
    sourceHandle: handleIdForLink(kind, 'out'),
    targetHandle: handleIdForLink(kind, 'in'),
    style: {
      stroke: LINK_COLORS[kind],
      strokeWidth: 1.75,
      strokeDasharray: '6 4',
    },
    label: 'research → exec',
    labelStyle: { fill: 'var(--color-accent)', fontSize: 9 },
    labelBgStyle: { fill: 'var(--color-surface-0)' },
    selectable: false,
    focusable: false,
    data: { kind: 'research_exec_bridge' },
  });
}

/**
 * Build a read-only React Flow graph from create-form engine seeds.
 *
 * Placement:
 * - Each execution family: research deps stacked left → execution on the right
 * - Families stacked top→bottom
 * - Standalone research engines below as orphans (left column)
 *
 * Edges:
 * - Intra-engine template links
 * - Research-dep → execution bridges (module ports, dashed)
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
      // Only wire research-dep → its owning execution (never dep ↔ dep).
      if (placed.seed.cascadedFromKey === family.root.key) {
        appendResearchToExecutionBridge(edges, placed, placedExec);
      }
    }
    appendEngineNodes(nodes, edges, placedExec, input.selectedEngineKey, familyActiveKeys);

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
