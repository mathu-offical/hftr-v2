import { z } from 'zod';
import { TradingMode } from './foundation';
import { CompanySectorFocuses } from './sector-focus';

/**
 * Company + module domain contracts (agent-docs/product/product-spec.md,
 * agent-docs/architecture/data-model.md §Companies & modules).
 */

export const ModuleType = z.enum([
  'research',
  'librarian',
  'library',
  'live_api',
  'trend',
  'trading',
  'policy',
  'generator',
  'simulator',
  'analyzer',
  'holding_fund',
  'fund_router',
  'math',
  'display',
]);
export type ModuleType = z.infer<typeof ModuleType>;

/** D-033: module types that receive one dedicated deterministic Math tool. */
export const MATH_REQUIRED_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'research',
  'librarian',
  'trend',
  'trading',
  'simulator',
  'analyzer',
  'generator',
]);

export function moduleRequiresMath(type: ModuleType): boolean {
  return MATH_REQUIRED_MODULE_TYPES.has(type);
}

/**
 * Hard cap on modules per company (hub + engine members + dedicated Math tools).
 * Sized for flexible multi-engine canvases (D-052); engines share one company queue.
 */
export const MAX_MODULES_PER_COMPANY = 200;

/** Create-form / canvas soft cap on ENGINE groups (see CreateCompanyForm). */
export const MAX_ENGINES_PER_COMPANY = 16;

/**
 * Projected module rows for company create: 1 hub + each engine member + one
 * dedicated Math per math-required member + optional standalone extras.
 */
export function projectedModuleSlotsForCreate(input: {
  engineModuleTypes: ReadonlyArray<ReadonlyArray<ModuleType>>;
  extraModuleTypes?: ReadonlyArray<ModuleType>;
}): number {
  let count = 1;
  for (const types of input.engineModuleTypes) {
    count += types.length;
    for (const type of types) {
      if (moduleRequiresMath(type)) count += 1;
    }
  }
  for (const type of input.extraModuleTypes ?? []) {
    count += 1;
    if (moduleRequiresMath(type)) count += 1;
  }
  return count;
}

export const TradingSubtype = z.enum(['crypto', 'prediction', 'hft', 'day', 'long_term', 'custom']);
export type TradingSubtype = z.infer<typeof TradingSubtype>;

/** D-042: external / specialty research curator kinds (`config.researchSubtype`). */
export const ResearchSubtype = z.enum([
  'external_web',
  'external_filings',
  'external_market_news',
  'specialty_desk',
  'event_catalyst',
  'crypto_onchain_context',
  'prediction_niche',
]);
export type ResearchSubtype = z.infer<typeof ResearchSubtype>;

/** D-042: librarian agent kinds (`config.librarianSubtype`). */
export const LibrarianSubtype = z.enum(['librarian_relevance', 'librarian_seed_keeper']);
export type LibrarianSubtype = z.infer<typeof LibrarianSubtype>;

/** D-042: library content class (`config.libraryClass`). */
export const LibraryClass = z.enum([
  'seeded_mechanisms',
  'topic_runtime',
  'market_history',
  'runtime_market_cache',
  'runtime_app_logs',
  'specialty_evidence',
  'master_graph',
]);
export type LibraryClass = z.infer<typeof LibraryClass>;

/** D-042: typed Math tools (`config.mathType`). */
export const MathType = z.enum([
  'company_hub',
  'fund_path',
  'desk_execution',
  'trend_signal',
  'research_metric',
  'analyzer_reconcile',
  'simulator_sandbox',
  'session_calendar',
]);
export type MathType = z.infer<typeof MathType>;

/** Preferred dedicated Math type when auto-provisioning for an owner module. */
export function preferredMathTypeForOwner(owner: ModuleType): MathType {
  switch (owner) {
    case 'research':
    case 'librarian':
      return 'research_metric';
    case 'trend':
      return 'trend_signal';
    case 'trading':
      return 'desk_execution';
    case 'analyzer':
      return 'analyzer_reconcile';
    case 'simulator':
      return 'simulator_sandbox';
    case 'generator':
      return 'research_metric';
    case 'library':
    case 'live_api':
    case 'policy':
    case 'holding_fund':
    case 'fund_router':
    case 'math':
    case 'display':
      return 'company_hub';
    default: {
      const _exhaustive: never = owner;
      return _exhaustive;
    }
  }
}

export const ModuleStatus = z.enum(['active', 'paused', 'error', 'draft']);
export type ModuleStatus = z.infer<typeof ModuleStatus>;

export const LinkKind = z.enum(['data_feed', 'directive', 'verification', 'fund_route']);
export type LinkKind = z.infer<typeof LinkKind>;

/**
 * Which link kinds are allowed between module types (canvas edge validation).
 * Key: `${fromType}->${toType}`. Absent key = link rejected.
 */
export const LINK_RULES: Readonly<Record<string, readonly LinkKind[]>> = {
  'research->library': ['data_feed'],
  'librarian->library': ['data_feed'],
  'library->librarian': ['data_feed'],
  'library->trend': ['data_feed'],
  'library->research': ['data_feed'],
  'research->librarian': ['data_feed'],
  'librarian->research': ['data_feed'],
  'live_api->trend': ['data_feed'],
  'live_api->trading': ['data_feed'],
  'trend->trading': ['directive'],
  'trend->simulator': ['directive'],
  'trading->policy': ['directive'],
  // Funds only flow through Math (never into LLM / model-bearing nodes).
  'holding_fund->math': ['fund_route'],
  'math->fund_router': ['fund_route'],
  'fund_router->math': ['fund_route'],
  'math->holding_fund': ['fund_route'],
  'simulator->trend': ['verification'],
  'simulator->research': ['verification'],
  'analyzer->trend': ['verification', 'data_feed'],
  'analyzer->research': ['verification', 'data_feed'],
  'analyzer->librarian': ['verification', 'data_feed'],
  'trading->analyzer': ['verification'],
  'analyzer->policy': ['verification'],
  // Dedicated Math ownership (D-033): owner input/context ↔ Math (data only).
  'research->math': ['data_feed'],
  'librarian->math': ['data_feed'],
  'trend->math': ['data_feed'],
  'trading->math': ['data_feed'],
  'simulator->math': ['data_feed'],
  'analyzer->math': ['data_feed'],
  'generator->math': ['data_feed'],
  // Math TOOL attachments (D-028): calculated ValueRefs return as data_feed.
  'math->research': ['data_feed'],
  'math->librarian': ['data_feed'],
  'math->library': ['data_feed'],
  'math->live_api': ['data_feed'],
  'math->trend': ['data_feed'],
  'math->trading': ['data_feed'],
  'math->simulator': ['data_feed'],
  'math->analyzer': ['data_feed'],
  'math->policy': ['data_feed'],
  'math->generator': ['data_feed'],
  'math->display': ['data_feed'],
  'trading->display': ['data_feed'],
  'analyzer->display': ['data_feed'],
  'trend->display': ['data_feed'],
  'live_api->display': ['data_feed'],
  'library->display': ['data_feed'],
  'librarian->display': ['data_feed'],
};

/** Module types allowed on either end of a fund_route edge. */
export const FUND_ROUTE_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'math',
  'holding_fund',
  'fund_router',
]);

/**
 * Fund routes must traverse Math: both ends are fund participants and at
 * least one end is Math. LLM / model-bearing nodes never carry fund_route.
 */
export function isLegalFundRoute(from: ModuleType, to: ModuleType): boolean {
  if (!FUND_ROUTE_MODULE_TYPES.has(from) || !FUND_ROUTE_MODULE_TYPES.has(to)) {
    return false;
  }
  return from === 'math' || to === 'math';
}

export function allowedLinkKinds(from: ModuleType, to: ModuleType): readonly LinkKind[] {
  return LINK_RULES[`${from}->${to}`] ?? [];
}

/** Canonical port ordering for canvas handle stacks (top → bottom). */
export const LINK_KIND_ORDER: readonly LinkKind[] = [
  'data_feed',
  'directive',
  'verification',
  'fund_route',
];

const GENERATED_MODULE_NAME_MAX_LENGTH = 80;
const FOCUS_TOKEN_MAX_LENGTH = 18;
const CONNECTION_REF_CAP = 2;

/** Unset focus placeholder in compact primary labels (`Fn · —`). */
export const MODULE_FOCUS_UNSET = '—';

function orderLinkKinds(kinds: Iterable<LinkKind>): readonly LinkKind[] {
  const allowed = new Set(kinds);
  return LINK_KIND_ORDER.filter((kind) => allowed.has(kind));
}

/** Inbound/outbound link-kind ports a module type may expose on the canvas. */
export function moduleLinkPorts(type: ModuleType): {
  inbound: readonly LinkKind[];
  outbound: readonly LinkKind[];
} {
  const inbound = new Set<LinkKind>();
  const outbound = new Set<LinkKind>();

  for (const [key, kinds] of Object.entries(LINK_RULES)) {
    const [from, to] = key.split('->') as [ModuleType, ModuleType];
    if (to === type) {
      for (const kind of kinds) inbound.add(kind);
    }
    if (from === type) {
      for (const kind of kinds) outbound.add(kind);
    }
  }

  return {
    inbound: orderLinkKinds(inbound),
    outbound: orderLinkKinds(outbound),
  };
}

export function handleIdForLink(kind: LinkKind, direction: 'in' | 'out'): string {
  return `${kind}-${direction}`;
}

function parseKindHandle(handle: string): { kind: LinkKind; direction: 'in' | 'out' } | null {
  const suffix = handle.endsWith('-in') ? 'in' : handle.endsWith('-out') ? 'out' : null;
  if (!suffix) return null;
  const kindPart = handle.slice(0, -(suffix.length + 1));
  const parsed = LinkKind.safeParse(kindPart);
  if (!parsed.success) return null;
  return { kind: parsed.data, direction: suffix };
}

/** Per-stream dependency port on the canvas (D-057). */
export type StreamPortSpec = {
  handleId: string;
  kind: LinkKind;
  direction: 'in' | 'out';
  /** null = free bus for new links */
  peerModuleId: string | null;
  peerLabel: string | null;
  role: 'bus' | 'stream';
};

/**
 * Stable handle id for a bus or per-peer stream port.
 * Bus: `{kind}-{in|out}`; stream: `{kind}-{in|out}__{peerUuid}`.
 */
export function handleIdForStream(
  kind: LinkKind,
  direction: 'in' | 'out',
  peerModuleId?: string | null,
): string {
  const base = handleIdForLink(kind, direction);
  if (peerModuleId == null) return base;
  return `${base}__${peerModuleId}`;
}

/** Parse bus or stream handle ids produced by {@link handleIdForStream}. */
export function parseStreamHandle(
  handle: string,
): { kind: LinkKind; direction: 'in' | 'out'; peerModuleId: string | null } | null {
  const sepIndex = handle.indexOf('__');
  const base = sepIndex >= 0 ? handle.slice(0, sepIndex) : handle;
  const peerModuleId = sepIndex >= 0 ? handle.slice(sepIndex + 2) || null : null;
  const parsed = parseKindHandle(base);
  if (!parsed) return null;
  return { ...parsed, peerModuleId };
}

/**
 * Inbound/outbound stream ports for a module: one bus per kind, then one stream
 * per existing link peer. Peers sort in pipeline / capital-flow order (D-073),
 * not raw UUID order, so Math and multi-attach stacks stay logical.
 */
export function moduleStreamPorts(input: {
  type: ModuleType;
  moduleId: string;
  links: Array<{
    fromModuleId: string;
    toModuleId: string;
    linkKind: LinkKind;
    fromLabel: string;
    toLabel: string;
    fromType?: ModuleType | undefined;
    toType?: ModuleType | undefined;
  }>;
}): { inbound: StreamPortSpec[]; outbound: StreamPortSpec[] } {
  const ports = moduleLinkPorts(input.type);

  const peerSortKey = (
    peerType: ModuleType | undefined,
    peerLabel: string,
    peerId: string,
    kind: LinkKind,
  ): string => {
    if (kind === 'fund_route') {
      const fundBias =
        peerType === 'holding_fund'
          ? 0
          : peerType === 'fund_router'
            ? 1
            : peerType === 'math'
              ? 2
              : 3;
      return `${fundBias}:${peerLabel}:${peerId}`;
    }
    const col = peerType != null ? MODULE_COLUMN[peerType] : 99;
    const row = peerType != null ? MODULE_LANE_ROW[peerType] : 99;
    return `${String(col).padStart(2, '0')}:${String(row).padStart(2, '0')}:${peerLabel}:${peerId}`;
  };

  const buildPorts = (
    kinds: readonly LinkKind[],
    direction: 'in' | 'out',
  ): StreamPortSpec[] => {
    const result: StreamPortSpec[] = [];
    for (const kind of kinds) {
      result.push({
        handleId: handleIdForStream(kind, direction),
        kind,
        direction,
        peerModuleId: null,
        peerLabel: null,
        role: 'bus',
      });

      type RankedStream = {
        port: StreamPortSpec;
        sortKey: string;
      };
      const streams: RankedStream[] = [];
      for (const link of input.links) {
        if (link.linkKind !== kind) continue;
        if (direction === 'in' && link.toModuleId === input.moduleId) {
          streams.push({
            sortKey: peerSortKey(link.fromType, link.fromLabel, link.fromModuleId, kind),
            port: {
              handleId: handleIdForStream(kind, direction, link.fromModuleId),
              kind,
              direction,
              peerModuleId: link.fromModuleId,
              peerLabel: link.fromLabel,
              role: 'stream',
            },
          });
        } else if (direction === 'out' && link.fromModuleId === input.moduleId) {
          streams.push({
            sortKey: peerSortKey(link.toType, link.toLabel, link.toModuleId, kind),
            port: {
              handleId: handleIdForStream(kind, direction, link.toModuleId),
              kind,
              direction,
              peerModuleId: link.toModuleId,
              peerLabel: link.toLabel,
              role: 'stream',
            },
          });
        }
      }
      streams.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      result.push(...streams.map((entry) => entry.port));
    }
    return result;
  };

  return {
    inbound: buildPorts(ports.inbound, 'in'),
    outbound: buildPorts(ports.outbound, 'out'),
  };
}

/**
 * Decode a source/target handle pair into a link kind.
 * Accepts bus and per-stream handles (`parseStreamHandle`).
 * Legacy migration pairs map to their canonical kinds; fund-route ambiguity on
 * `data-out` → `data-in` stays `data_feed` here (endpoint-aware UI resolves fund).
 */
export function linkKindForHandlePair(
  sourceHandle?: string | null,
  targetHandle?: string | null,
): LinkKind | null {
  if (!sourceHandle || !targetHandle) return null;

  const source = parseStreamHandle(sourceHandle);
  const target = parseStreamHandle(targetHandle);
  if (source && target) {
    if (source.direction !== 'out' || target.direction !== 'in') return null;
    if (source.kind !== target.kind) return null;
    return source.kind;
  }

  if (sourceHandle === 'data-out' && targetHandle === 'data-in') return 'data_feed';
  if (sourceHandle === 'data-out' && targetHandle === 'control-in') return 'directive';
  if (sourceHandle === 'tools-out' && targetHandle === 'data-in') return 'verification';

  return null;
}

/**
 * Preferred canvas lane per module type (left → right, D-064 / ui-spec §3).
 * Research + data sources left; sense-making mid; execution then verification right.
 * Reflow compresses unused lanes so sparse engines stay compact.
 */
export const MODULE_COLUMN: Record<ModuleType, number> = {
  research: 0,
  librarian: 0,
  library: 1,
  live_api: 1,
  math: 1,
  trend: 2,
  holding_fund: 2,
  trading: 3,
  simulator: 3,
  generator: 3,
  fund_router: 3,
  analyzer: 4,
  policy: 4,
  display: 4,
};

/**
 * Preferred vertical order within a lane (top → bottom) when multiple types share a column.
 * Connection-aware barycenter may still refine row placement.
 */
export const MODULE_LANE_ROW: Record<ModuleType, number> = {
  research: 0,
  librarian: 1,
  library: 0,
  live_api: 1,
  math: 0,
  trend: 0,
  holding_fund: 1,
  trading: 0,
  simulator: 0,
  generator: 1,
  fund_router: 2,
  analyzer: 0,
  policy: 1,
  display: 2,
};

export const CanvasPosition = z.object({ x: z.number(), y: z.number() });
export type CanvasPosition = z.infer<typeof CanvasPosition>;

// ── Common inline setup + validation ────────────────────────────────────────

export const ModuleSetupField = z.enum(['capital_allocation', 'topic_sector', 'target_exit']);
export type ModuleSetupField = z.infer<typeof ModuleSetupField>;

export const CAPITAL_BEARING_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'trading',
  'holding_fund',
  'fund_router',
]);

const TOPIC_SCOPED_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'research',
  'librarian',
  'library',
  'live_api',
  'trend',
  'trading',
  'simulator',
  'analyzer',
]);

export function requiredModuleSetupFields(type: ModuleType): readonly ModuleSetupField[] {
  const fields: ModuleSetupField[] = [];
  if (CAPITAL_BEARING_MODULE_TYPES.has(type)) fields.push('capital_allocation', 'target_exit');
  if (TOPIC_SCOPED_MODULE_TYPES.has(type)) fields.push('topic_sector');
  return fields;
}

const AmountDecimalInput = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/);
const PercentageDecimalInput = z
  .string()
  .trim()
  .regex(/^\d{1,3}(?:\.\d{1,4})?$/)
  .refine((value) => {
    const [whole = '0', fraction = ''] = value.split('.');
    const wholeInt = BigInt(whole);
    return wholeInt < 100n || (wholeInt === 100n && /^0*$/.test(fraction));
  }, 'Percentage must be between 0 and 100');

export const CapitalAllocationInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('amount'), value: AmountDecimalInput }),
  z.object({ mode: z.literal('percentage'), value: PercentageDecimalInput }),
]);
export type CapitalAllocationInput = z.infer<typeof CapitalAllocationInput>;

/** Raw operator input; API converts financial/time fields to append-only ValueRefs. */
export const ModuleSetupInput = z.object({
  topicSectors: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  capitalAllocation: CapitalAllocationInput.optional(),
  targetExitAt: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().min(1).max(100).optional(),
});
export type ModuleSetupInput = z.infer<typeof ModuleSetupInput>;

export interface ModuleSetupState {
  topicSectors: readonly string[];
  capitalAllocationRef: string | null;
  targetExitRef: string | null;
}

export function missingModuleSetupFields(
  type: ModuleType,
  state: ModuleSetupState,
): ModuleSetupField[] {
  return requiredModuleSetupFields(type).filter((field) => {
    switch (field) {
      case 'capital_allocation':
        return !state.capitalAllocationRef;
      case 'topic_sector':
        return state.topicSectors.length === 0;
      case 'target_exit':
        return !state.targetExitRef;
      default: {
        const _exhaustive: never = field;
        return _exhaustive;
      }
    }
  });
}

// ── Per-type config schemas (jsonb `modules.config`) ────────────────────────

export const ResearchModuleConfig = z.object({
  topicScope: z.string().min(1),
  /** D-042: curator specialization. */
  researchSubtype: ResearchSubtype.default('external_web'),
  curiosity: z.enum(['conservative', 'balanced', 'exploratory']).default('balanced'),
  cadenceMinutes: z.number().int().min(30).max(1440).default(180),
  targetLibraryIds: z.array(z.string().uuid()).default([]),
  sourceAllowlist: z.array(z.string()).default([]),
  sourceBlocklist: z.array(z.string()).default([]),
  /** D-039: default auto-admit after model-free validation; operator may require approval. */
  admissionMode: z
    .enum(['auto_admit_validated', 'require_operator_approval'])
    .default('auto_admit_validated'),
  /** When true, operator owns deeper lever picks; LLM still constrained to envelopes. */
  manualControl: z.boolean().default(false),
});

export const LibrarianModuleConfig = z.object({
  topicScope: z.string().min(1),
  librarianSubtype: LibrarianSubtype.default('librarian_relevance'),
  cadenceMinutes: z.number().int().min(30).max(1440).default(360),
  targetLibraryIds: z.array(z.string().uuid()).default([]),
  /** Relative weights inside envelope — LLM/user picks; never raw scores as authority. */
  relevanceWeights: z
    .object({
      topical: z.number().min(0).max(1).default(0.4),
      freshness: z.number().min(0).max(1).default(0.3),
      evidenceFit: z.number().min(0).max(1).default(0.3),
    })
    .default({ topical: 0.4, freshness: 0.3, evidenceFit: 0.3 }),
  seedProtect: z.boolean().default(false),
  manualControl: z.boolean().default(false),
});

export const LibraryModuleConfig = z.object({
  topicScope: z.string().min(1),
  masterLibrary: z.boolean().default(false),
  /** D-042: library content class. */
  libraryClass: LibraryClass.default('topic_runtime'),
});

export const LiveApiModuleConfig = z.object({
  venue: z.enum(['alpaca', 'kalshi', 'polymarket', 'coinbase', 'paper_sim']),
  instruments: z.array(z.string().min(1)).max(50),
  feedClass: z.string().default('iex_free'),
  pollSeconds: z.number().int().min(5).max(3600).default(60),
});

export const TrendPosture = z.enum([
  'session_intraday',
  'crypto_cross_cap',
  'event_probability',
  'position_horizon',
  'microstructure_swarm',
  'research_only',
]);
export type TrendPosture = z.infer<typeof TrendPosture>;

export const TrendModuleConfig = z.object({
  focus: z.string().min(1),
  trendPosture: TrendPosture.default('session_intraday'),
  maxActiveTrends: z.number().int().min(1).max(50).default(10),
  cadenceMinutes: z.number().int().min(5).max(1440).default(30),
  manualControl: z.boolean().default(false),
});

export const TradingModuleConfig = z.object({
  subtype: TradingSubtype,
  strategyFamilies: z.array(z.string()).default([]),
  exitTimelineDays: z.number().int().min(0).max(3650).default(1),
  cadenceMinutes: z.number().int().min(1).max(60).default(5),
  manualControl: z.boolean().default(false),
});

export const PolicyModuleConfig = z.object({
  policyEnvelopeRef: z.string().default('paper_balanced_general_v1'),
  notes: z.string().default(''),
});

export const DisplayKind = z.enum(['table', 'list', 'ledger', 'chart', 'graph']);
export type DisplayKind = z.infer<typeof DisplayKind>;

export const DisplayModuleConfig = z.object({
  displayKind: DisplayKind.default('table'),
  title: z.string().min(1).max(80).default('Display'),
  sourceModuleIds: z.array(z.string().uuid()).default([]),
});
export type DisplayModuleConfig = z.infer<typeof DisplayModuleConfig>;

function normalizeNeighborLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized.sort((a, b) => a.localeCompare(b));
}

function capNeighborLabels(labels: readonly string[], cap: number): string[] {
  if (labels.length <= cap) return [...labels];
  const kept = labels.slice(0, cap);
  const overflow = labels.length - cap;
  return [...kept, `+${overflow}`];
}

/**
 * Short function lexicon for canvas identity (compact labels).
 * Prefer type + subtype/kind over long prose bases.
 */
export function moduleFunctionLabel(type: ModuleType, config?: unknown): string {
  const cfg =
    config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};

  switch (type) {
    case 'research':
      return 'Research';
    case 'librarian':
      return 'Librarian';
    case 'library':
      return 'Library';
    case 'live_api':
      return 'LiveAPI';
    case 'trend':
      return 'Trend';
    case 'trading': {
      const subtype = TradingSubtype.safeParse(cfg.subtype);
      if (!subtype.success) return 'Trade';
      switch (subtype.data) {
        case 'day':
          return 'DayTrade';
        case 'long_term':
          return 'Swing';
        case 'crypto':
          return 'Crypto';
        case 'prediction':
          return 'Pred';
        case 'hft':
          return 'HFT';
        case 'custom':
          return 'Trade';
      }
    }
    case 'policy':
      return 'Policy';
    case 'generator':
      return 'Gen';
    case 'simulator':
      return 'Sim';
    case 'analyzer':
      return 'Analyze';
    case 'holding_fund':
      return 'Fund';
    case 'fund_router':
      return 'Router';
    case 'math':
      return 'Math';
    case 'display': {
      const kind = DisplayKind.safeParse(cfg.displayKind);
      if (!kind.success) return 'Display';
      switch (kind.data) {
        case 'table':
          return 'Table';
        case 'list':
          return 'List';
        case 'ledger':
          return 'Ledger';
        case 'chart':
          return 'Chart';
        case 'graph':
          return 'Graph';
      }
    }
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Compact focus token from topic/sector (preferred) or optional capital display.
 * Long topics collapse to the first word / slug within FOCUS_TOKEN_MAX_LENGTH.
 */
export function moduleFocusToken(input: {
  topicSectors?: readonly string[] | null | undefined;
  capitalAllocationDisplay?: string | null | undefined;
}): string {
  const topics = (input.topicSectors ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (topics.length > 0) {
    const first = topics[0]!;
    if (first.length <= FOCUS_TOKEN_MAX_LENGTH) return first;
    const word = first.split(/[\s,/|]+/).find((part) => part.length > 0) ?? first;
    if (word.length <= FOCUS_TOKEN_MAX_LENGTH) return word;
    return `${word.slice(0, FOCUS_TOKEN_MAX_LENGTH - 1)}…`;
  }

  const capital = input.capitalAllocationDisplay?.trim();
  if (capital) {
    return capital.length <= FOCUS_TOKEN_MAX_LENGTH
      ? capital
      : `${capital.slice(0, FOCUS_TOKEN_MAX_LENGTH - 1)}…`;
  }

  return MODULE_FOCUS_UNSET;
}

/** Primary identity line: `{Fn} · {Focus}`. */
export function composeModulePrimaryLabel(fn: string, focus: string): string {
  const safeFn = fn.trim() || 'Node';
  const safeFocus = focus.trim() || MODULE_FOCUS_UNSET;
  return `${safeFn} · ${safeFocus}`;
}

/**
 * Compact connection refs from neighbor function labels (never full display names).
 * Caps at 2 inbound + 2 outbound with `+N` overflow.
 */
export function composeConnectionRefs(
  inboundLabels: readonly string[],
  outboundLabels: readonly string[],
): string | null {
  const inbound = capNeighborLabels(normalizeNeighborLabels(inboundLabels), CONNECTION_REF_CAP);
  const outbound = capNeighborLabels(normalizeNeighborLabels(outboundLabels), CONNECTION_REF_CAP);
  if (inbound.length === 0 && outbound.length === 0) return null;

  let refs = '';
  if (inbound.length > 0) refs += `← ${inbound.join(' · ')}`;
  if (outbound.length > 0) {
    if (refs) refs += ' ';
    refs += `→ ${outbound.join(' · ')}`;
  }
  return refs;
}

/**
 * Split a persisted compact name into primary identity and optional connection refs.
 * Secondary starts at the first ` ← ` or ` → ` marker.
 */
export function splitCompactModuleName(name: string): {
  primary: string;
  connectionRefs: string | null;
} {
  const trimmed = name.trim();
  const arrowIn = trimmed.indexOf(' ← ');
  const arrowOut = trimmed.indexOf(' → ');
  let splitAt = -1;
  if (arrowIn >= 0 && arrowOut >= 0) splitAt = Math.min(arrowIn, arrowOut);
  else if (arrowIn >= 0) splitAt = arrowIn;
  else if (arrowOut >= 0) splitAt = arrowOut;

  if (splitAt < 0) {
    return { primary: trimmed, connectionRefs: null };
  }

  const primary = trimmed.slice(0, splitAt).trimEnd();
  const connectionRefs = trimmed.slice(splitAt + 1).trim();
  return {
    primary: primary || trimmed,
    connectionRefs: connectionRefs || null,
  };
}

function truncatePreferringRefs(primary: string, refs: string | null): string {
  if (!refs) {
    if (primary.length <= GENERATED_MODULE_NAME_MAX_LENGTH) return primary;
    return `${primary.slice(0, GENERATED_MODULE_NAME_MAX_LENGTH - 1).trimEnd()}…`;
  }

  const full = `${primary} ${refs}`;
  if (full.length <= GENERATED_MODULE_NAME_MAX_LENGTH) return full;

  // Drop refs before slicing the primary identity.
  if (primary.length <= GENERATED_MODULE_NAME_MAX_LENGTH) return primary;
  return `${primary.slice(0, GENERATED_MODULE_NAME_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * Derive a compact display name: `{Fn} · {Focus}` plus optional `←`/`→` neighbor Fn refs.
 * Math stays primary-only (no connection suffix).
 */
export function deriveGeneratedModuleName(input: {
  type: ModuleType;
  /** Preferred short Fn; falls back to `moduleFunctionLabel(type, config)`. */
  baseName?: string;
  config?: unknown;
  topicSectors?: readonly string[] | null;
  capitalAllocationDisplay?: string | null;
  /** Neighbor short function labels (not full generated names). */
  inboundLabels?: readonly string[];
  outboundLabels?: readonly string[];
  /** @deprecated Prefer inboundLabels — treated as labels when inboundLabels omitted. */
  inboundNames?: readonly string[];
  /** @deprecated Prefer outboundLabels — treated as labels when outboundLabels omitted. */
  outboundNames?: readonly string[];
}): string {
  const fn = input.baseName?.trim() || moduleFunctionLabel(input.type, input.config);
  const focus = moduleFocusToken({
    topicSectors: input.topicSectors,
    capitalAllocationDisplay: input.capitalAllocationDisplay,
  });
  const primary = composeModulePrimaryLabel(fn, focus);

  if (input.type === 'math') return primary;

  const inbound = input.inboundLabels ?? input.inboundNames ?? [];
  const outbound = input.outboundLabels ?? input.outboundNames ?? [];
  const refs = composeConnectionRefs(inbound, outbound);
  return truncatePreferringRefs(primary, refs);
}

export const HoldingFundModuleConfig = z.object({
  source: z.enum(['company_seed', 'company_pool', 'reserve', 'broker_balance']),
  allocationPolicyRef: z.string().default('paper_balanced_general_v1'),
});

export const FundRouterModuleConfig = z.object({
  policyEnvelopeRef: z.string().default('paper_balanced_general_v1'),
  approvalMode: z.enum(['manual', 'policy']).default('manual'),
  targetModuleIds: z.array(z.string().uuid()).default([]),
});

export const GenericModuleConfig = z.object({}).passthrough();

export const MathModuleConfig = z.object({
  mathType: MathType.default('company_hub'),
});
export type MathModuleConfig = z.infer<typeof MathModuleConfig>;

export const MODULE_CONFIG_SCHEMAS: Record<ModuleType, z.ZodTypeAny> = {
  research: ResearchModuleConfig,
  librarian: LibrarianModuleConfig,
  library: LibraryModuleConfig,
  live_api: LiveApiModuleConfig,
  trend: TrendModuleConfig,
  trading: TradingModuleConfig,
  policy: PolicyModuleConfig,
  generator: GenericModuleConfig,
  simulator: GenericModuleConfig,
  analyzer: GenericModuleConfig,
  holding_fund: HoldingFundModuleConfig,
  fund_router: FundRouterModuleConfig,
  math: MathModuleConfig,
  display: DisplayModuleConfig,
};

// ── API payloads ─────────────────────────────────────────────────────────────

/** Extra standalone modules added during company creation. */
export const CreateCompanyExtraModule = z.object({
  type: ModuleType,
  name: z.string().min(1).max(80),
  config: z.unknown().optional(),
  setup: ModuleSetupInput.optional(),
  canvasPosition: CanvasPosition.optional(),
});
export type CreateCompanyExtraModule = z.infer<typeof CreateCompanyExtraModule>;

/**
 * ENGINE seed at company creation (D-043): at least one required.
 * Same shape as module-store insert (template inputs + shared setup).
 */
export const CreateCompanyEngine = z.object({
  templateId: z.string().min(1).max(80),
  inputs: z.record(z.string(), z.string()).default({}),
  setup: ModuleSetupInput.optional(),
  canvasOffset: CanvasPosition.optional(),
});
export type CreateCompanyEngine = z.infer<typeof CreateCompanyEngine>;

/** @deprecated Use CreateCompanyEngine — kept as alias for transitional imports. */
export const CreateCompanyExtraEngine = CreateCompanyEngine;
export type CreateCompanyExtraEngine = CreateCompanyEngine;

export const CreateCompanyInput = z.object({
  name: z.string().min(1).max(80),
  philosophyPrompt: z.string().min(1).max(4000),
  mode: TradingMode.default('paper'),
  seedCreditsCents: z.number().int().min(0).max(100_000_000_00).default(0),
  /**
   * Optional multi-select from SECTOR_FOCUS_PRESETS. Persisted on the company
   * and used to pre-seed engine master topic/sectors when engine setup omits them.
   */
  sectorFocuses: CompanySectorFocuses,
  /**
   * Required ENGINE seeds (min 1). Sole graph seed path — company Math hub
   * is always auto-provisioned; standalone extras are optional.
   */
  engines: z.array(CreateCompanyEngine).min(1, 'at least one engine required').max(10),
  /** Optional standalone modules outside engines. */
  extraModules: z.array(CreateCompanyExtraModule).max(40).optional(),
});
export type CreateCompanyInput = z.infer<typeof CreateCompanyInput>;

// PhilosophyProfile imported lazily via index re-export consumers; keep shape
// inline here to avoid circular imports with philosophy.ts → pipeline.
export const UpdateCompanyInput = z.object({
  name: z.string().min(1).max(80).optional(),
  philosophyPrompt: z.string().min(1).max(4000).optional(),
  /** Structured slideable philosophy axes (see philosophy.ts). */
  philosophyProfile: z
    .object({
      version: z.literal(1),
      axes: z.record(z.string(), z.enum(['min', 'typical', 'max'])),
    })
    .optional(),
});
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

export const CreateModuleInput = z.object({
  type: ModuleType,
  name: z.string().min(1).max(80),
  generatedNameBase: z.string().min(1).max(80).optional(),
  config: z.unknown(),
  canvasPosition: CanvasPosition.optional(),
  setup: ModuleSetupInput.optional(),
  /** Optional ENGINE membership at create (batch engine insert sets this). */
  engineInstanceId: z.string().uuid().nullable().optional(),
});
export type CreateModuleInput = z.infer<typeof CreateModuleInput>;

export const UpdateModuleInput = z.object({
  name: z.string().min(1).max(80).optional(),
  restoreGeneratedName: z.boolean().optional(),
  /** Restore this module's topic/sector from its ENGINE master (clears override). */
  restoreEngineTopic: z.boolean().optional(),
  config: z.unknown().optional(),
  status: ModuleStatus.optional(),
  canvasPosition: CanvasPosition.optional(),
  setup: ModuleSetupInput.optional(),
  engineInstanceId: z.string().uuid().nullable().optional(),
});
export type UpdateModuleInput = z.infer<typeof UpdateModuleInput>;

export const CreateLinkInput = z.object({
  fromModuleId: z.string().uuid(),
  toModuleId: z.string().uuid(),
  linkKind: LinkKind,
});
export type CreateLinkInput = z.infer<typeof CreateLinkInput>;
