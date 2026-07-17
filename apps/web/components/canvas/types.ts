import { Position } from '@xyflow/react';
import type { LinkKind, ModuleStatus, ModuleType } from '@hftr/contracts';

export interface CanvasModule {
  id: string;
  type: ModuleType;
  name: string;
  status: ModuleStatus;
  position: { x: number; y: number };
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

export type HandleGroup = 'dataIn' | 'dataOut' | 'controlIn' | 'toolsOut';

export type HandleId = 'data-in' | 'data-out' | 'control-in' | 'tools-out';

/**
 * Node connection points (ui-spec node model): left = data/context input,
 * right = data output, top = system control input, bottom = tools/module
 * access. Handle color signals the type it accepts.
 */
export const HANDLE_SPEC: Record<
  HandleGroup,
  { id: HandleId; type: 'source' | 'target'; position: Position; color: string }
> = {
  dataIn: { id: 'data-in', type: 'target', position: Position.Left, color: '#7aa2f7' },
  dataOut: { id: 'data-out', type: 'source', position: Position.Right, color: '#7aa2f7' },
  controlIn: { id: 'control-in', type: 'target', position: Position.Top, color: '#e0af68' },
  toolsOut: { id: 'tools-out', type: 'source', position: Position.Bottom, color: '#bb9af7' },
};

/**
 * Deterministic handle-pair → link-kind mapping:
 * - data-out → data-in   = data_feed (fund_route instead when either endpoint
 *   is a holding fund or fund router — fund routing rides the data path
 *   between fund-plane modules)
 * - data-out → control-in = directive (output driving another module's control)
 * - tools-out → data-in   = verification (tool/module access feeding evidence)
 * Any other pair has no kind and the connection is rejected.
 */
export function edgeKindForHandles(
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
  sourceType: ModuleType,
  targetType: ModuleType,
): LinkKind | null {
  const pair = `${sourceHandle ?? 'data-out'}->${targetHandle ?? 'data-in'}`;
  switch (pair) {
    case 'data-out->data-in':
      return sourceType === 'fund_router' ||
        targetType === 'fund_router' ||
        sourceType === 'holding_fund' ||
        targetType === 'holding_fund'
        ? 'fund_route'
        : 'data_feed';
    case 'data-out->control-in':
      return 'directive';
    case 'tools-out->data-in':
      return 'verification';
    default:
      return null;
  }
}
