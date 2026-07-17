import { z } from 'zod';
import { TradingMode } from './foundation';

/**
 * Company + module domain contracts (agent-docs/product/product-spec.md,
 * agent-docs/architecture/data-model.md §Companies & modules).
 */

export const ModuleType = z.enum([
  'research',
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
  'trend',
  'trading',
  'simulator',
  'analyzer',
  'generator',
]);

export function moduleRequiresMath(type: ModuleType): boolean {
  return MATH_REQUIRED_MODULE_TYPES.has(type);
}

export const TradingSubtype = z.enum(['crypto', 'prediction', 'hft', 'day', 'long_term', 'custom']);
export type TradingSubtype = z.infer<typeof TradingSubtype>;

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
  'library->trend': ['data_feed'],
  'library->research': ['data_feed'],
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
  'trading->analyzer': ['verification'],
  'analyzer->policy': ['verification'],
  // Dedicated Math ownership (D-033): owner input/context ↔ Math (data only).
  'research->math': ['data_feed'],
  'trend->math': ['data_feed'],
  'trading->math': ['data_feed'],
  'simulator->math': ['data_feed'],
  'analyzer->math': ['data_feed'],
  'generator->math': ['data_feed'],
  // Math TOOL attachments (D-028): calculated ValueRefs return as data_feed.
  'math->research': ['data_feed'],
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

/**
 * Decode a source/target handle pair into a link kind.
 * New handles require matching `{kind}-out` → `{kind}-in`.
 * Legacy migration pairs map to their canonical kinds; fund-route ambiguity on
 * `data-out` → `data-in` stays `data_feed` here (endpoint-aware UI resolves fund).
 */
export function linkKindForHandlePair(
  sourceHandle?: string | null,
  targetHandle?: string | null,
): LinkKind | null {
  if (!sourceHandle || !targetHandle) return null;

  const source = parseKindHandle(sourceHandle);
  const target = parseKindHandle(targetHandle);
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

function normalizeNeighborNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized.sort((a, b) => a.localeCompare(b));
}

/**
 * Derive a display name from the module type, base function label, and neighbor
 * base names (never full generated neighbor strings).
 */
export function deriveGeneratedModuleName(input: {
  type: ModuleType;
  baseName: string;
  inboundNames: readonly string[];
  outboundNames: readonly string[];
}): string {
  const baseName = input.baseName.trim();
  if (input.type === 'math') return baseName;

  const inbound = normalizeNeighborNames(input.inboundNames);
  const outbound = normalizeNeighborNames(input.outboundNames);
  if (inbound.length === 0 && outbound.length === 0) return baseName;

  let name = baseName;
  if (inbound.length > 0) name += ` ← ${inbound.join(' · ')}`;
  if (outbound.length > 0) name += ` → ${outbound.join(' · ')}`;

  if (name.length <= GENERATED_MODULE_NAME_MAX_LENGTH) return name;
  return name.slice(0, GENERATED_MODULE_NAME_MAX_LENGTH).trimEnd();
}

/** Canvas column per module type (left → right ordering, ui-spec §3). */
export const MODULE_COLUMN: Record<ModuleType, number> = {
  research: 0,
  library: 1,
  live_api: 1,
  math: 1,
  analyzer: 1,
  holding_fund: 1,
  trend: 2,
  trading: 3,
  simulator: 3,
  generator: 3,
  fund_router: 3,
  policy: 4,
  display: 4,
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
  curiosity: z.enum(['conservative', 'balanced', 'exploratory']).default('balanced'),
  cadenceMinutes: z.number().int().min(30).max(1440).default(180),
  targetLibraryIds: z.array(z.string().uuid()).default([]),
  sourceAllowlist: z.array(z.string()).default([]),
  sourceBlocklist: z.array(z.string()).default([]),
});

export const LibraryModuleConfig = z.object({
  topicScope: z.string().min(1),
  masterLibrary: z.boolean().default(false),
});

export const LiveApiModuleConfig = z.object({
  venue: z.enum(['alpaca', 'kalshi', 'polymarket', 'coinbase', 'paper_sim']),
  instruments: z.array(z.string().min(1)).max(50),
  feedClass: z.string().default('iex_free'),
  pollSeconds: z.number().int().min(5).max(3600).default(60),
});

export const TrendModuleConfig = z.object({
  focus: z.string().min(1),
  maxActiveTrends: z.number().int().min(1).max(50).default(10),
  cadenceMinutes: z.number().int().min(5).max(1440).default(30),
});

export const TradingModuleConfig = z.object({
  subtype: TradingSubtype,
  strategyFamilies: z.array(z.string()).default([]),
  exitTimelineDays: z.number().int().min(0).max(3650).default(1),
  cadenceMinutes: z.number().int().min(1).max(60).default(5),
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

export const MODULE_CONFIG_SCHEMAS: Record<ModuleType, z.ZodTypeAny> = {
  research: ResearchModuleConfig,
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
  math: z.object({}).strict(), // math module carries no user config
  display: DisplayModuleConfig,
};

// ── API payloads ─────────────────────────────────────────────────────────────

/** Per-index setup for modules seeded by the selected company template. */
export const TemplateModuleSetupEntry = z.object({
  moduleIndex: z.number().int().nonnegative(),
  setup: ModuleSetupInput,
});
export type TemplateModuleSetupEntry = z.infer<typeof TemplateModuleSetupEntry>;

/** Extra standalone modules added during company creation. */
export const CreateCompanyExtraModule = z.object({
  type: ModuleType,
  name: z.string().min(1).max(80),
  config: z.unknown().optional(),
  setup: ModuleSetupInput.optional(),
  canvasPosition: CanvasPosition.optional(),
});
export type CreateCompanyExtraModule = z.infer<typeof CreateCompanyExtraModule>;

/** Extra ENGINE templates inserted during company creation. */
export const CreateCompanyExtraEngine = z.object({
  templateId: z.string().min(1).max(80),
  inputs: z.record(z.string(), z.string()).default({}),
  setup: ModuleSetupInput.optional(),
  canvasOffset: CanvasPosition.optional(),
});
export type CreateCompanyExtraEngine = z.infer<typeof CreateCompanyExtraEngine>;

export const CreateCompanyInput = z.object({
  name: z.string().min(1).max(80),
  philosophyPrompt: z.string().min(1).max(4000),
  mode: TradingMode.default('paper'),
  seedCreditsCents: z.number().int().min(0).max(100_000_000_00).default(0),
  /**
   * Shared fallback setup applied to matching template nodes when a per-module
   * entry is absent (backward compatible with the original single form).
   */
  templateSetup: ModuleSetupInput.optional(),
  /** Preferred: inline setup keyed to each seeded template module index. */
  templateModuleSetups: z.array(TemplateModuleSetupEntry).max(40).optional(),
  /** Additional modules beyond the company template seed. */
  extraModules: z.array(CreateCompanyExtraModule).max(40).optional(),
  /** Additional ENGINE templates inserted at create time. */
  extraEngines: z.array(CreateCompanyExtraEngine).max(5).optional(),
  // Template selection is composed in the route from CompanyTemplateId
  // (templates.ts) — the single source of truth for available templates.
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
