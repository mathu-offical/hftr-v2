import { getEngineTemplateById, type LinkKind, type ModuleType } from '@hftr/contracts';

/** Canvas family for distinct card chrome (data vs agent vs fund vs tool). */
export type ModuleFamily = 'data_source' | 'agent' | 'fund' | 'tool' | 'control';

export const MODULE_FAMILY: Record<ModuleType, ModuleFamily> = {
  library: 'data_source',
  live_api: 'data_source',
  research: 'agent',
  librarian: 'agent',
  trend: 'agent',
  trading: 'agent',
  simulator: 'agent',
  analyzer: 'agent',
  generator: 'agent',
  display: 'agent',
  holding_fund: 'fund',
  fund_router: 'fund',
  math: 'tool',
  clock: 'tool',
  time: 'tool',
  policy: 'control',
};

export const FAMILY_LABELS: Record<ModuleFamily, string> = {
  data_source: 'Data source',
  agent: 'Agent',
  /** Capital nodes read as vaults (D-068 silhouette). */
  fund: 'Vault',
  tool: 'Tool',
  control: 'Control',
};

/** Rudimentary card silhouette for fund / data-source / agent families (D-068 / D-109). */
export type FamilyShapeKind =
  | 'vault'
  | 'library'
  | 'live_feed'
  | 'research'
  | 'librarian'
  | 'trend'
  | 'trading'
  | 'analyzer'
  | 'policy';

export type ModuleVisual = {
  label: string;
  hue: string;
  family: ModuleFamily;
  /** Card corner radius class. */
  radiusClass: string;
  borderStyle: 'solid' | 'dashed' | 'double';
  /** Left accent treatment. */
  accent: 'bar' | 'stripe' | 'rail' | 'dot';
  /** Soft fill wash over surface-1. */
  wash: string;
  /** Optional vault / library / live-feed silhouette chrome. */
  shape?: FamilyShapeKind;
};

export const MODULE_VISUALS: Record<ModuleType, ModuleVisual> = {
  research: {
    label: 'Research',
    hue: '#7aa2f7',
    family: 'agent',
    radiusClass: 'rounded-lg',
    borderStyle: 'solid',
    accent: 'bar',
    wash: 'rgba(122, 162, 247, 0.06)',
    shape: 'research',
  },
  librarian: {
    label: 'Librarian',
    hue: '#89b4fa',
    family: 'agent',
    radiusClass: 'rounded-lg',
    borderStyle: 'solid',
    accent: 'bar',
    wash: 'rgba(137, 180, 250, 0.06)',
    shape: 'librarian',
  },
  library: {
    label: 'Library',
    hue: '#9ece6a',
    family: 'data_source',
    radiusClass: 'rounded-md',
    borderStyle: 'dashed',
    accent: 'stripe',
    wash: 'rgba(158, 206, 106, 0.12)',
    shape: 'library',
  },
  live_api: {
    label: 'Live API',
    hue: '#7dcfff',
    family: 'data_source',
    radiusClass: 'rounded-md',
    borderStyle: 'dashed',
    accent: 'rail',
    wash: 'rgba(125, 207, 255, 0.12)',
    shape: 'live_feed',
  },
  math: {
    label: 'Math',
    hue: '#bb9af7',
    family: 'tool',
    radiusClass: 'rounded-md',
    borderStyle: 'solid',
    accent: 'dot',
    wash: 'rgba(187, 154, 247, 0.08)',
  },
  clock: {
    label: 'Clock',
    hue: '#cfc9a6',
    family: 'tool',
    radiusClass: 'rounded-md',
    borderStyle: 'solid',
    accent: 'dot',
    wash: 'rgba(207, 201, 166, 0.1)',
  },
  time: {
    label: 'Time',
    hue: '#d4a574',
    family: 'tool',
    radiusClass: 'rounded-md',
    borderStyle: 'solid',
    accent: 'dot',
    wash: 'rgba(212, 165, 116, 0.1)',
  },
  analyzer: {
    label: 'Analyzer',
    hue: '#2ac3de',
    family: 'agent',
    radiusClass: 'rounded-lg',
    borderStyle: 'solid',
    accent: 'bar',
    wash: 'rgba(42, 195, 222, 0.06)',
    shape: 'analyzer',
  },
  trend: {
    label: 'Trend',
    hue: '#e0af68',
    family: 'agent',
    radiusClass: 'rounded-lg',
    borderStyle: 'solid',
    accent: 'bar',
    wash: 'rgba(224, 175, 104, 0.07)',
    shape: 'trend',
  },
  trading: {
    label: 'Trading',
    hue: '#f7768e',
    family: 'agent',
    radiusClass: 'rounded-lg',
    borderStyle: 'solid',
    accent: 'bar',
    wash: 'rgba(247, 118, 142, 0.07)',
    shape: 'trading',
  },
  simulator: {
    label: 'Simulator',
    hue: '#ff9e64',
    family: 'agent',
    radiusClass: 'rounded-lg',
    borderStyle: 'solid',
    accent: 'bar',
    wash: 'rgba(255, 158, 100, 0.07)',
  },
  generator: {
    label: 'Generator',
    hue: '#c0caf5',
    family: 'agent',
    radiusClass: 'rounded-lg',
    borderStyle: 'solid',
    accent: 'bar',
    wash: 'rgba(192, 202, 245, 0.06)',
  },
  holding_fund: {
    label: 'Holding fund',
    hue: '#4fd6be',
    family: 'fund',
    radiusClass: 'rounded-xl',
    borderStyle: 'double',
    accent: 'rail',
    wash: 'rgba(79, 214, 190, 0.14)',
    shape: 'vault',
  },
  fund_router: {
    label: 'Fund router',
    hue: '#73bcda',
    family: 'fund',
    radiusClass: 'rounded-xl',
    borderStyle: 'double',
    accent: 'rail',
    wash: 'rgba(115, 188, 218, 0.14)',
    shape: 'vault',
  },
  policy: {
    label: 'Policy',
    hue: '#a9b1d6',
    family: 'control',
    radiusClass: 'rounded-sm',
    borderStyle: 'solid',
    accent: 'stripe',
    wash: 'rgba(169, 177, 214, 0.08)',
    shape: 'policy',
  },
  display: {
    label: 'Display',
    hue: '#56b6c2',
    family: 'agent',
    radiusClass: 'rounded-lg',
    borderStyle: 'solid',
    accent: 'bar',
    wash: 'rgba(86, 182, 194, 0.06)',
  },
};

export const LINK_COLORS: Record<LinkKind, string> = {
  data_feed: '#7aa2f7',
  directive: '#e0af68',
  verification: '#9ece6a',
  fund_route: '#73daca',
};

/** D-108: nature families for rails/edges (system vs data vs time vs fund). */
export const NATURE_COLORS: Record<'data' | 'system' | 'fund' | 'time', string> = {
  data: '#7aa2f7',
  system: '#e0af68',
  fund: '#73daca',
  time: '#bb9af7',
};

export const NATURE_EDGE_DASH: Record<'data' | 'system' | 'fund' | 'time', string | undefined> = {
  data: undefined,
  system: '6 3',
  fund: '10 4',
  time: '3 3',
};

export const NATURE_PORT_VISUALS: Record<
  'data' | 'system' | 'fund' | 'time',
  { label: string; shortLabel: string; color: string }
> = {
  data: { label: 'Data', shortLabel: 'Data', color: NATURE_COLORS.data },
  system: { label: 'System', shortLabel: 'Sys', color: NATURE_COLORS.system },
  fund: { label: 'Fund', shortLabel: 'Fund', color: NATURE_COLORS.fund },
  time: { label: 'Time', shortLabel: 'Time', color: NATURE_COLORS.time },
};

/** Edge dash patterns — visual bus identity per link kind. */
export const LINK_EDGE_DASH: Record<LinkKind, string | undefined> = {
  data_feed: undefined,
  directive: '7 4',
  verification: '2 3',
  fund_route: '10 4',
};

export const LINK_PORT_VISUALS: Record<
  LinkKind,
  { label: string; shortLabel: string; color: string }
> = {
  data_feed: { label: 'Data feed', shortLabel: 'Data', color: LINK_COLORS.data_feed },
  directive: { label: 'Directive', shortLabel: 'Dir', color: LINK_COLORS.directive },
  verification: { label: 'Verification', shortLabel: 'Verify', color: LINK_COLORS.verification },
  fund_route: { label: 'Fund route', shortLabel: 'Fund', color: LINK_COLORS.fund_route },
};

/**
 * Role-specific port label for the nature of data on that bus.
 * LinkKind remains the connection contract; labels are presentation-only.
 */
export function portRoleLabel(
  type: ModuleType,
  kind: LinkKind,
  direction: 'in' | 'out',
  config?: Record<string, unknown> | null,
): string {
  const base = LINK_PORT_VISUALS[kind].label;
  switch (kind) {
    case 'data_feed': {
      if (type === 'library') return direction === 'out' ? 'Corpus out' : 'Corpus in';
      if (type === 'live_api') return direction === 'out' ? 'Market feed' : 'Feed in';
      if (type === 'research') return direction === 'out' ? 'Findings' : 'Sources';
      if (type === 'librarian') return direction === 'out' ? 'Evidence' : 'Ingest';
      if (type === 'trend') return direction === 'out' ? 'Signals data' : 'Inputs';
      if (type === 'trading') return direction === 'in' ? 'Desk data' : 'Trade data';
      if (type === 'math') return 'Calc ref';
      if (type === 'clock') return direction === 'out' ? 'Now' : 'Clock in';
      if (type === 'time') {
        return direction === 'out' ? 'Time bus' : 'Authority in';
      }
      if (type === 'analyzer') {
        if (direction === 'in') return 'Observe';
        const emit = config?.emitMode;
        if (emit === 'verify_loopback') return 'ExecMon';
        if (emit === 'to_desk_stream') return 'Desk out';
        if (emit === 'to_library') return 'Lib write';
        return 'Analysis';
      }
      if (type === 'simulator') return direction === 'out' ? 'Sim data' : 'Sim in';
      if (type === 'generator') return 'Generated';
      if (type === 'display') return direction === 'in' ? 'Display in' : 'Display out';
      return base;
    }
    case 'directive': {
      if (type === 'trend') return direction === 'out' ? 'Trade directive' : 'Directive in';
      if (type === 'trading') return direction === 'in' ? 'Execution order' : 'Directive out';
      if (type === 'policy') return direction === 'out' ? 'Policy directive' : 'Directive in';
      return base;
    }
    case 'verification': {
      if (type === 'policy') return direction === 'in' ? 'Policy check' : 'Verified';
      if (type === 'analyzer') return direction === 'out' ? 'Verify out' : 'Verify in';
      if (type === 'trading') return 'Verify';
      return base;
    }
    case 'fund_route': {
      if (type === 'holding_fund') return direction === 'out' ? 'Capital out' : 'Capital in';
      if (type === 'fund_router') return direction === 'out' ? 'Route out' : 'Route in';
      if (type === 'math') return direction === 'in' ? 'Fund in' : 'Fund out';
      return base;
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function humanizeToken(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Operator-visible subtype chip from module config (library class, venue, etc.). */
export function moduleSubtypeChip(
  type: ModuleType,
  config: Record<string, unknown> | null | undefined,
  generatedNameBase: string,
): string | null {
  const cfg = config ?? {};
  switch (type) {
    case 'library': {
      const libraryClass = cfg.libraryClass;
      if (typeof libraryClass === 'string' && libraryClass.trim()) {
        return humanizeToken(libraryClass);
      }
      break;
    }
    case 'live_api': {
      const venue = cfg.venue;
      if (typeof venue === 'string' && venue.trim()) {
        return humanizeToken(venue);
      }
      const feedClass = cfg.feedClass;
      if (typeof feedClass === 'string' && feedClass.trim()) {
        return humanizeToken(feedClass);
      }
      break;
    }
    case 'research': {
      const subtype = cfg.researchSubtype;
      if (typeof subtype === 'string' && subtype.trim()) {
        return humanizeToken(subtype);
      }
      break;
    }
    case 'librarian': {
      const subtype = cfg.librarianSubtype;
      if (typeof subtype === 'string' && subtype.trim()) {
        return humanizeToken(subtype);
      }
      break;
    }
    case 'trading': {
      const subtype = cfg.subtype;
      if (typeof subtype === 'string' && subtype.trim()) {
        return humanizeToken(subtype);
      }
      if (generatedNameBase && generatedNameBase !== 'Trade') return generatedNameBase;
      break;
    }
    case 'math': {
      const mathType = cfg.mathType;
      if (typeof mathType === 'string' && mathType.trim()) {
        return humanizeToken(mathType);
      }
      break;
    }
    case 'clock': {
      const mode = cfg.displayMode;
      if (typeof mode === 'string' && mode.trim()) {
        return humanizeToken(mode);
      }
      break;
    }
    case 'time': {
      const transform = cfg.transform;
      if (typeof transform === 'string' && transform.trim()) {
        return humanizeToken(transform);
      }
      break;
    }
    case 'display': {
      const kind = cfg.displayKind;
      if (typeof kind === 'string' && kind.trim()) {
        return humanizeToken(kind);
      }
      break;
    }
    case 'trend': {
      const posture = cfg.trendPosture;
      if (typeof posture === 'string' && posture.trim()) {
        return humanizeToken(posture);
      }
      break;
    }
    case 'analyzer': {
      const emitMode = cfg.emitMode;
      if (emitMode === 'verify_loopback') return 'Exec monitor';
      if (emitMode === 'to_desk_stream') return 'Desk stream';
      if (emitMode === 'to_library') return 'To library';
      if (typeof emitMode === 'string' && emitMode.trim()) {
        return humanizeToken(emitMode);
      }
      break;
    }
    case 'policy': {
      const envelope = cfg.policyEnvelopeRef;
      if (typeof envelope === 'string' && envelope.trim()) {
        return humanizeToken(envelope.replace(/_v\d+$/i, '').slice(0, 28));
      }
      break;
    }
    case 'holding_fund': {
      const source = cfg.source;
      if (typeof source === 'string' && source.trim()) {
        return humanizeToken(source);
      }
      break;
    }
    case 'fund_router': {
      const mode = cfg.approvalMode;
      if (typeof mode === 'string' && mode.trim()) {
        return humanizeToken(mode);
      }
      break;
    }
    case 'simulator':
    case 'generator': {
      if (generatedNameBase && generatedNameBase !== MODULE_VISUALS[type].label) {
        return generatedNameBase;
      }
      break;
    }
    default:
      break;
  }
  const familyDefault = MODULE_VISUALS[type].label;
  if (generatedNameBase && generatedNameBase !== familyDefault) {
    return generatedNameBase;
  }
  return null;
}

export type EngineCategoryVisual = {
  hue: string;
  wash: string;
  stripe: string;
  label: string;
};

export const ENGINE_CATEGORY_VISUALS: Record<string, EngineCategoryVisual> = {
  day_trading: {
    hue: '#f7768e',
    wash: 'rgba(247, 118, 142, 0.09)',
    stripe: 'rgba(247, 118, 142, 0.22)',
    label: 'Day trading',
  },
  trend_research: {
    hue: '#e0af68',
    wash: 'rgba(224, 175, 104, 0.09)',
    stripe: 'rgba(224, 175, 104, 0.22)',
    label: 'Trend research',
  },
  crypto: {
    hue: '#ff9e64',
    wash: 'rgba(255, 158, 100, 0.09)',
    stripe: 'rgba(255, 158, 100, 0.22)',
    label: 'Crypto',
  },
  prediction: {
    hue: '#bb9af7',
    wash: 'rgba(187, 154, 247, 0.09)',
    stripe: 'rgba(187, 154, 247, 0.22)',
    label: 'Prediction',
  },
  high_frequency: {
    hue: '#f7768e',
    wash: 'rgba(247, 118, 142, 0.12)',
    stripe: 'rgba(247, 118, 142, 0.28)',
    label: 'High frequency',
  },
  long_term: {
    hue: '#4fd6be',
    wash: 'rgba(79, 214, 190, 0.09)',
    stripe: 'rgba(79, 214, 190, 0.22)',
    label: 'Long term',
  },
  research: {
    hue: '#7aa2f7',
    wash: 'rgba(122, 162, 247, 0.10)',
    stripe: 'rgba(122, 162, 247, 0.24)',
    label: 'Research',
  },
};

const DEFAULT_ENGINE_VISUAL: EngineCategoryVisual = {
  hue: 'var(--color-accent)',
  wash: 'rgba(122, 162, 247, 0.06)',
  stripe: 'rgba(122, 162, 247, 0.16)',
  label: 'Engine',
};

export function engineVisualForTemplate(templateId: string): EngineCategoryVisual {
  const template = getEngineTemplateById(templateId);
  if (!template) return DEFAULT_ENGINE_VISUAL;
  return ENGINE_CATEGORY_VISUALS[template.category] ?? DEFAULT_ENGINE_VISUAL;
}
