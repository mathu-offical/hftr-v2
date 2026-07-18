import {
  linkKindForHandlePair,
  type EngineSetupSnapshot,
  type LinkKind,
  type ModuleSetupField,
  type ModuleStatus,
  type ModuleType,
} from '@hftr/contracts';

export {
  ENGINE_CATEGORY_VISUALS,
  FAMILY_LABELS,
  LINK_COLORS,
  LINK_EDGE_DASH,
  LINK_PORT_VISUALS,
  MODULE_FAMILY,
  MODULE_VISUALS,
  engineVisualForTemplate,
  moduleSubtypeChip,
  portRoleLabel,
  type EngineCategoryVisual,
  type ModuleFamily,
  type ModuleVisual,
} from './canvas-visuals';

export interface CanvasModule {
  id: string;
  type: ModuleType;
  name: string;
  generatedNameBase: string;
  nameCustomized: boolean;
  status: ModuleStatus;
  position: { x: number; y: number };
  topicSectors: string[];
  capitalAllocationRef: string | null;
  targetExitRef: string | null;
  missingSetupFields: ModuleSetupField[];
  engineInstanceId: string | null;
  toolOwnerModuleId: string | null;
  topicSectorsOverridden: boolean;
  /** Operator-visible subtype chip (library class, venue, trading subtype, …). */
  subtypeChip?: string | null;
  config?: Record<string, unknown>;
}

/** Per-module canvas status projection from GET …/canvas (T1.4, REQ-LLM-007). */
export interface ModuleCanvasStatusProjection {
  moduleId: string;
  pendingJobs: number;
  budgetQueuedJobs: number;
  activeJobs: number;
  deadJobs: number;
  lastTradeOutcome: string | null;
  lastTrendSymbol: string | null;
  statusText: string;
}

export interface CanvasEngineGroup {
  id: string;
  templateId: string;
  label: string;
  masterTopicSectors: string[];
  capitalAllocationRef?: string | null;
  targetExitRef?: string | null;
  setupSnapshot?: EngineSetupSnapshot | null;
  templateInputs?: Record<string, string>;
  canvasBounds: { x: number; y: number; width: number; height: number } | null;
  memberModuleIds: string[];
}

export interface CanvasLink {
  id: string;
  fromModuleId: string;
  toModuleId: string;
  linkKind: LinkKind;
}

/**
 * Decode a dragged handle pair into a link kind.
 * New `{kind}-out` → `{kind}-in` pairs delegate to contracts; legacy
 * `data-out` → `data-in` keeps endpoint-aware fund_route resolution.
 */
export function edgeKindForHandles(
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
  _sourceType: ModuleType,
  _targetType: ModuleType,
): LinkKind | null {
  return linkKindForHandlePair(sourceHandle, targetHandle);
}
