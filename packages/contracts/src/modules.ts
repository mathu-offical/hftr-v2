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
  'fund_router',
  'math',
]);
export type ModuleType = z.infer<typeof ModuleType>;

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
  'trading->fund_router': ['fund_route'],
  'fund_router->trading': ['fund_route'],
  'simulator->trend': ['verification'],
  'simulator->research': ['verification'],
  'analyzer->trend': ['verification', 'data_feed'],
  'analyzer->research': ['verification', 'data_feed'],
  'trading->analyzer': ['verification'],
  'math->trading': ['data_feed'],
  'math->trend': ['data_feed'],
};

export function allowedLinkKinds(from: ModuleType, to: ModuleType): readonly LinkKind[] {
  return LINK_RULES[`${from}->${to}`] ?? [];
}

/** Canvas column per module type (left → right ordering, ui-spec §3). */
export const MODULE_COLUMN: Record<ModuleType, number> = {
  research: 0,
  library: 1,
  live_api: 1,
  math: 1,
  analyzer: 1,
  trend: 2,
  trading: 3,
  simulator: 3,
  generator: 3,
  fund_router: 3,
  policy: 4,
};

export const CanvasPosition = z.object({ x: z.number(), y: z.number() });
export type CanvasPosition = z.infer<typeof CanvasPosition>;

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
  fund_router: GenericModuleConfig,
  math: z.object({}).strict(), // math module carries no user config
};

// ── API payloads ─────────────────────────────────────────────────────────────

export const CreateCompanyInput = z.object({
  name: z.string().min(1).max(80),
  philosophyPrompt: z.string().min(1).max(4000),
  mode: TradingMode.default('paper'),
  seedCreditsCents: z.number().int().min(0).max(100_000_000_00).default(0),
  template: z
    .enum([
      'blank',
      'day_trading_starter',
      'crypto_starter',
      'prediction_starter',
      'research_first',
    ])
    .default('blank'),
});
export type CreateCompanyInput = z.infer<typeof CreateCompanyInput>;

export const UpdateCompanyInput = z.object({
  name: z.string().min(1).max(80).optional(),
  philosophyPrompt: z.string().min(1).max(4000).optional(),
});
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

export const CreateModuleInput = z.object({
  type: ModuleType,
  name: z.string().min(1).max(80),
  config: z.unknown(),
  canvasPosition: CanvasPosition.optional(),
});
export type CreateModuleInput = z.infer<typeof CreateModuleInput>;

export const UpdateModuleInput = z.object({
  name: z.string().min(1).max(80).optional(),
  config: z.unknown().optional(),
  status: ModuleStatus.optional(),
  canvasPosition: CanvasPosition.optional(),
});
export type UpdateModuleInput = z.infer<typeof UpdateModuleInput>;

export const CreateLinkInput = z.object({
  fromModuleId: z.string().uuid(),
  toModuleId: z.string().uuid(),
  linkKind: LinkKind,
});
export type CreateLinkInput = z.infer<typeof CreateLinkInput>;
