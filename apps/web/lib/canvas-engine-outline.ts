/**
 * Canvas engines inventory outline (D-211): nest research packs and linked sims
 * under their parent execution for indented palette viewing.
 */

import {
  engineCreateSection,
  getEngineTemplateById,
  researchDependenciesForExecutionEngine,
} from '@hftr/contracts';

export type CanvasEngineOutlineItem = {
  id: string;
  label: string;
  templateId: string;
  /** Parent execution when attached research or linked sim. */
  parentExecutionId?: string | null;
  childKind?: 'research' | 'simulation' | null;
  /** Sim role when childKind is simulation. */
  simRole?: 'gate' | 'training' | 'adhoc' | null;
};

export type CanvasEngineOutlineFamily = {
  root: CanvasEngineOutlineItem;
  children: CanvasEngineOutlineItem[];
};

export type CanvasEngineBindingSource = {
  id: string;
  label: string;
  templateId: string;
  setupSnapshot?:
    | {
        researchLibraryBinding?:
          | {
              mode: string;
              engineInstanceId?: string | undefined;
            }
          | null
          | undefined;
        simulationBinding?:
          | {
              role?: 'gate' | 'training' | 'adhoc' | undefined;
              parentExecutionEngineId?: string | null | undefined;
            }
          | null
          | undefined;
      }
    | null
    | undefined;
};

/**
 * Map canvas engine nodes → outline items with parent links.
 * Prefers persisted bindings; falls back to unique template-dep inference for
 * research packs that predate researchLibraryBinding on setup_snapshot.
 */
export function canvasEnginesToOutlineItems(
  engines: readonly CanvasEngineBindingSource[],
): CanvasEngineOutlineItem[] {
  const execIdsByResearchTemplate = new Map<string, string[]>();
  for (const engine of engines) {
    const template = getEngineTemplateById(engine.templateId);
    if (!template || engineCreateSection(template) !== 'execution') continue;
    for (const depId of researchDependenciesForExecutionEngine(engine.templateId)) {
      const list = execIdsByResearchTemplate.get(depId) ?? [];
      list.push(engine.id);
      execIdsByResearchTemplate.set(depId, list);
    }
  }

  return engines.map((engine) => {
    const snap = engine.setupSnapshot;
    const research = snap?.researchLibraryBinding;
    const sim = snap?.simulationBinding;

    if (research?.mode === 'attach_execution' && research.engineInstanceId) {
      return {
        id: engine.id,
        label: engine.label,
        templateId: engine.templateId,
        parentExecutionId: research.engineInstanceId,
        childKind: 'research' as const,
      };
    }

    if (sim?.parentExecutionEngineId) {
      return {
        id: engine.id,
        label: engine.label,
        templateId: engine.templateId,
        parentExecutionId: sim.parentExecutionEngineId,
        childKind: 'simulation' as const,
        simRole: (sim.role ?? null) as 'gate' | 'training' | 'adhoc' | null,
      };
    }

    const template = getEngineTemplateById(engine.templateId);
    if (template && engineCreateSection(template) === 'research') {
      const candidates = execIdsByResearchTemplate.get(engine.templateId) ?? [];
      if (candidates.length === 1) {
        return {
          id: engine.id,
          label: engine.label,
          templateId: engine.templateId,
          parentExecutionId: candidates[0]!,
          childKind: 'research' as const,
        };
      }
    }

    return {
      id: engine.id,
      label: engine.label,
      templateId: engine.templateId,
    };
  });
}

function childSortKey(engine: CanvasEngineOutlineItem): string {
  const kindRank = engine.childKind === 'research' ? '0' : engine.childKind === 'simulation' ? '1' : '2';
  const roleRank =
    engine.simRole === 'gate'
      ? '0'
      : engine.simRole === 'training'
        ? '1'
        : engine.simRole === 'adhoc'
          ? '2'
          : '3';
  return `${kindRank}:${roleRank}:${engine.label}`;
}

/**
 * Build parent→child families for the engines inventory.
 * Children whose parent is missing from the list stay as roots.
 */
export function buildCanvasEngineOutline(
  engines: readonly CanvasEngineOutlineItem[],
): CanvasEngineOutlineFamily[] {
  const byId = new Map(engines.map((engine) => [engine.id, engine]));
  const childrenByParent = new Map<string, CanvasEngineOutlineItem[]>();
  const nestedIds = new Set<string>();

  for (const engine of engines) {
    const parentId = engine.parentExecutionId ?? null;
    if (!parentId || !byId.has(parentId) || parentId === engine.id) continue;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(engine);
    childrenByParent.set(parentId, list);
    nestedIds.add(engine.id);
  }

  for (const [, kids] of childrenByParent) {
    kids.sort((a, b) => childSortKey(a).localeCompare(childSortKey(b)));
  }

  const families: CanvasEngineOutlineFamily[] = [];
  const seen = new Set<string>();

  for (const engine of engines) {
    if (nestedIds.has(engine.id) || seen.has(engine.id)) continue;
    seen.add(engine.id);
    const children = childrenByParent.get(engine.id) ?? [];
    for (const child of children) seen.add(child.id);
    families.push({ root: engine, children: [...children] });
  }

  for (const engine of engines) {
    if (seen.has(engine.id)) continue;
    families.push({ root: engine, children: [] });
  }

  return families;
}

/** Module row for Modules inventory (D-215). */
export type CanvasModuleOutlineItem = {
  id: string;
  name: string;
  type: string;
  engineInstanceId?: string | null;
};

export type CanvasModuleOutlineGroup = {
  /** null = company-scoped / ungrouped modules (no engine_instance_id). */
  engineId: string | null;
  engineLabel: string;
  modules: CanvasModuleOutlineItem[];
};

/**
 * Group modules under their ENGINE membership for indented inventory viewing.
 * Engine group order follows `engines`; unknown engine ids get a fallback label;
 * ungrouped modules (clock, free Math, etc.) land in a final Company bucket.
 */
export function buildCanvasModuleOutline(
  modules: readonly CanvasModuleOutlineItem[],
  engines: ReadonlyArray<{ id: string; label: string }>,
): CanvasModuleOutlineGroup[] {
  const labelById = new Map(engines.map((engine) => [engine.id, engine.label]));
  const byEngine = new Map<string | null, CanvasModuleOutlineItem[]>();

  for (const mod of modules) {
    const key = mod.engineInstanceId ?? null;
    const list = byEngine.get(key) ?? [];
    list.push(mod);
    byEngine.set(key, list);
  }

  for (const [, list] of byEngine) {
    list.sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  }

  const groups: CanvasModuleOutlineGroup[] = [];
  const seenEngine = new Set<string>();

  for (const engine of engines) {
    const list = byEngine.get(engine.id);
    if (!list || list.length === 0) continue;
    seenEngine.add(engine.id);
    groups.push({
      engineId: engine.id,
      engineLabel: engine.label,
      modules: list,
    });
  }

  for (const [engineId, list] of byEngine) {
    if (engineId === null || seenEngine.has(engineId)) continue;
    groups.push({
      engineId,
      engineLabel: labelById.get(engineId) ?? 'Engine',
      modules: list,
    });
  }

  const ungrouped = byEngine.get(null);
  if (ungrouped && ungrouped.length > 0) {
    groups.push({
      engineId: null,
      engineLabel: 'Company',
      modules: ungrouped,
    });
  }

  return groups;
}
