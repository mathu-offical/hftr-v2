import {
  linkKindForHandlePair,
  type EngineSetupSnapshot,
  type LinkKind,
  type ModuleSetupField,
  type ModuleStatus,
  type ModuleType,
} from '@hftr/contracts';

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

/** Visual identity per module type (ui-spec §3: subtle color coding). */
export const MODULE_VISUALS: Record<ModuleType, { label: string; hue: string }> = {
  research: { label: 'Research', hue: '#7aa2f7' },
  library: { label: 'Library', hue: '#9ece6a' },
  live_api: { label: 'Live API', hue: '#7dcfff' },
  math: { label: 'Math', hue: '#bb9af7' },
  analyzer: { label: 'Analyzer', hue: '#2ac3de' },
  trend: { label: 'Trend', hue: '#e0af68' },
  trading: { label: 'Trading', hue: '#f7768e' },
  simulator: { label: 'Simulator', hue: '#ff9e64' },
  generator: { label: 'Generator', hue: '#c0caf5' },
  holding_fund: { label: 'Holding fund', hue: '#4fd6be' },
  fund_router: { label: 'Fund router', hue: '#73daca' },
  policy: { label: 'Policy', hue: '#a9b1d6' },
  display: { label: 'Display', hue: '#56b6c2' },
};

export const LINK_COLORS: Record<LinkKind, string> = {
  data_feed: '#7aa2f7',
  directive: '#e0af68',
  verification: '#9ece6a',
  fund_route: '#73daca',
};

/** Text-first port labels; color reinforces link kind on handles and edges. */
export const LINK_PORT_VISUALS: Record<LinkKind, { label: string; color: string }> = {
  data_feed: { label: 'Data feed', color: LINK_COLORS.data_feed },
  directive: { label: 'Directive', color: LINK_COLORS.directive },
  verification: { label: 'Verification', color: LINK_COLORS.verification },
  fund_route: { label: 'Fund route', color: LINK_COLORS.fund_route },
};

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
