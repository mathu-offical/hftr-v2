import type { EngineSetupSnapshot } from './engines';
import { buildDecisionNodesForEngine } from './option-anchors';
import type { SimulationEngineBinding } from './paper-engine';
import type { ResearchLibraryBinding } from './research-library-binding';
import {
  EXECUTION_ENGINE_RESEARCH_DEPENDENCIES,
  EXECUTION_ENGINE_SIM_DEPENDENCIES,
  getEngineTemplateById,
  type ExecutionSimDependency,
} from './templates';

export type MissingEngineChildDependency = {
  kind: 'research' | 'simulation';
  templateId: string;
  label: string;
  placement?: 'pre' | 'post';
  role?: 'gate' | 'training';
};

/** Minimal engine row shape for parent-scoped child presence checks. */
export type EngineChildPresenceRow = {
  id: string;
  templateId: string;
  researchLibraryBinding?: ResearchLibraryBinding | null | undefined;
  simulationBinding?: SimulationEngineBinding | null | undefined;
};

function researchDepToMissing(templateId: string): MissingEngineChildDependency {
  const template = getEngineTemplateById(templateId);
  return {
    kind: 'research',
    templateId,
    label: template?.label ?? templateId,
  };
}

function simDepToMissing(dep: ExecutionSimDependency): MissingEngineChildDependency {
  const template = getEngineTemplateById(dep.templateId);
  return {
    kind: 'simulation',
    templateId: dep.templateId,
    label: template?.label ?? dep.templateId,
    placement: dep.placement,
    role: dep.placement === 'pre' ? 'gate' : 'training',
  };
}

/** Required child template ids for an execution engine (research + default sims). */
export function requiredChildDependenciesForExecution(
  executionTemplateId: string,
): MissingEngineChildDependency[] {
  const research = (EXECUTION_ENGINE_RESEARCH_DEPENDENCIES[executionTemplateId] ?? []).map(
    researchDepToMissing,
  );
  const sims = (EXECUTION_ENGINE_SIM_DEPENDENCIES[executionTemplateId] ?? []).map(simDepToMissing);
  return [...research, ...sims];
}

/**
 * Template ids of research/sim engines bound to a specific execution parent.
 * Canvas-wide template presence is not enough — each execution must have its own
 * attached research packs and parent-linked sims (D-210).
 */
export function presentChildTemplateIdsForExecution(
  executionEngineId: string,
  engines: ReadonlyArray<EngineChildPresenceRow>,
): Set<string> {
  const present = new Set<string>();
  for (const engine of engines) {
    if (engine.id === executionEngineId) continue;
    const research = engine.researchLibraryBinding;
    if (
      research?.mode === 'attach_execution' &&
      research.engineInstanceId === executionEngineId
    ) {
      present.add(engine.templateId);
      continue;
    }
    const sim = engine.simulationBinding;
    if (sim?.parentExecutionEngineId === executionEngineId) {
      present.add(engine.templateId);
    }
  }
  return present;
}

/** Diff required vs present template ids for one execution engine. */
export function missingChildDependenciesForExecution(
  executionTemplateId: string,
  presentTemplateIds: ReadonlySet<string>,
): MissingEngineChildDependency[] {
  return requiredChildDependenciesForExecution(executionTemplateId).filter(
    (dep) => !presentTemplateIds.has(dep.templateId),
  );
}

/** Required child engines already attached to an execution parent (D-213). */
export function presentChildDependenciesForExecution(
  executionTemplateId: string,
  presentTemplateIds: ReadonlySet<string>,
): MissingEngineChildDependency[] {
  return requiredChildDependenciesForExecution(executionTemplateId).filter((dep) =>
    presentTemplateIds.has(dep.templateId),
  );
}

type DecisionSnapshotMember = {
  id: string;
  type: string;
  config?: Record<string, unknown>;
};

/** Build initial decision snapshot fields for engine create / setupSnapshot seeding. */
export function seedEngineDecisionSnapshot(input: {
  engineId: string;
  templateId: string;
  members: DecisionSnapshotMember[];
}): {
  decisionNodes: NonNullable<EngineSetupSnapshot['decisionNodes']>;
  decisionOptionSelections: Record<string, string>;
} {
  const nodes = buildDecisionNodesForEngine(input);
  const decisionOptionSelections: Record<string, string> = {};
  for (const node of nodes) {
    if (node.selectedOptionId) {
      decisionOptionSelections[node.id] = node.selectedOptionId;
    }
  }
  const decisionNodes = nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    catalogRef: node.catalogRef,
    label: node.label,
    ...(node.layer ? { layer: node.layer } : {}),
    ...(node.parentAnchorId !== undefined
      ? { parentAnchorId: node.parentAnchorId ?? null }
      : {}),
    ...(node.ownerModuleId !== undefined ? { ownerModuleId: node.ownerModuleId ?? null } : {}),
    ownerEngineId: node.ownerEngineId,
    ...(node.defaultPosition ? { defaultPosition: node.defaultPosition } : {}),
    options: node.options ?? [],
    selectedOptionId: node.selectedOptionId ?? null,
    ...(node.intakes ? { intakes: node.intakes } : {}),
    ...(node.connectionMode ? { connectionMode: node.connectionMode } : {}),
  }));
  return { decisionNodes, decisionOptionSelections };
}
