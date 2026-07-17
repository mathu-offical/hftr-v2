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
  fund_router: { label: 'Fund router', hue: '#73daca' },
  policy: { label: 'Policy', hue: '#a9b1d6' },
};

export const LINK_COLORS: Record<LinkKind, string> = {
  data_feed: '#7aa2f7',
  directive: '#e0af68',
  verification: '#9ece6a',
  fund_route: '#73daca',
};
