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
  NATURE_COLORS,
  NATURE_EDGE_DASH,
  engineVisualForTemplate,
  moduleSubtypeChip,
  portRoleLabel,
  type EngineCategoryVisual,
  type FamilyShapeKind,
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
  /** D-077: type-relevant card projection from GET …/canvas. */
  typeContext?: ModuleTypeContextProjection;
}

/** Compact trend row for TrendListChrome + binding edges (D-077). */
export interface CanvasTrendRow {
  id: string;
  symbol: string;
  direction: string;
  strengthBand: string;
  status: string;
  engineInstanceId: string | null;
  tradingModuleId: string | null;
}

/** D-077: type-relevant facts for on-card interactive context. */
export type ModuleTypeContextProjection =
  | {
      kind: 'library';
      libraryId: string | null;
      name: string | null;
      conceptCount: number;
      libraryClass: string | null;
    }
  | {
      kind: 'research';
      topics: { id: string; title: string }[];
      targetLibraries: { id: string; name: string }[];
      researchSubtype: string | null;
      cadenceMinutes: number | null;
    }
  | {
      kind: 'live_api';
      venue: string | null;
      instruments: string[];
      feedClass: string | null;
      pollSeconds: number | null;
    }
  | {
      kind: 'trend';
      trendPosture: string | null;
      maxActiveTrends: number;
      cadenceMinutes: number | null;
      trends: CanvasTrendRow[];
    }
  | { kind: 'none' };

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
  typeContext?: ModuleTypeContextProjection;
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
  /** D-091 motherboard utility links. */
  utilityLinks?: Array<{
    id: string;
    bus: 'data_in' | 'data_out' | 'clock' | 'funds' | 'system_control';
    fromEngineId?: string | null;
    fromModuleId?: string | null;
    streamId?: string | null;
    streamDescriptor?: string | null;
  }>;
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
