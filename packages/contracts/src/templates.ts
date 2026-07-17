import { z } from 'zod';
import { ModuleType } from './modules';

/**
 * Company templates: preset module graphs created with a new company.
 * The Math module is always auto-provisioned separately and is not listed.
 * Positions follow the canvas column model (MODULE_COLUMN).
 */

export const CompanyTemplateId = z.enum(['blank', 'day_trading_starter', 'trend_research_lab']);
export type CompanyTemplateId = z.infer<typeof CompanyTemplateId>;

export interface TemplateModule {
  type: ModuleType;
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface TemplateLink {
  /** Numeric indices address template modules; `math` addresses the company built-in. */
  fromIndex: number | 'math';
  toIndex: number | 'math';
  linkKind: 'data_feed' | 'directive' | 'verification' | 'fund_route';
}

export interface CompanyTemplate {
  id: CompanyTemplateId;
  label: string;
  description: string;
  mathPosition?: { x: number; y: number };
  modules: TemplateModule[];
  links: TemplateLink[];
}

// ── Insertable engine templates (DevSpecs/dev-notebook.md: MODULE STORE) ────
//
// End-to-end trading engines the operator can insert into an existing company
// from the module store. Each requires user inputs (sector focus, philosophy,
// caps) before insertion; values land in module configs via `target`.
// Unavailable engines are listed honestly with the gating milestone.

export interface EngineTemplateInput {
  key: string;
  label: string;
  kind: 'text' | 'select';
  options?: string[];
  placeholder?: string;
  /** Which inserted module's config field receives the value. */
  target: { moduleIndex: number; configKey: string };
}

export interface EngineTemplate {
  id: string;
  label: string;
  category: 'day_trading' | 'trend_research' | 'crypto' | 'prediction' | 'high_frequency';
  description: string;
  available: boolean;
  unavailableReason?: string;
  modules: TemplateModule[];
  links: TemplateLink[];
  inputs: EngineTemplateInput[];
}

export const ENGINE_TEMPLATES: EngineTemplate[] = [
  {
    id: 'engine_day_trading',
    label: 'Day trading engine',
    category: 'day_trading',
    description:
      'Research + evidence + market/runtime data → trend → paper execution, with deterministic funds and policy verification.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Market Regime Research',
        config: { topicScope: 'pending_operator_scope', curiosity: 'balanced' },
        position: { x: 0, y: 0 },
      },
      {
        type: 'library',
        name: 'Strategy Evidence Library',
        config: { topicScope: 'pending_operator_scope', masterLibrary: false },
        position: { x: 460, y: 0 },
      },
      {
        type: 'live_api',
        name: 'Paper Market & Runtime Feed',
        config: {
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 60,
        },
        position: { x: 460, y: 380 },
      },
      {
        type: 'trend',
        name: 'Market Trend Scanner',
        config: { focus: 'pending_operator_scope', maxActiveTrends: 10, cadenceMinutes: 30 },
        position: { x: 920, y: 190 },
      },
      {
        type: 'trading',
        name: 'Paper Day-Trade Execution',
        config: {
          subtype: 'day',
          strategyFamilies: ['strat-001'],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
        },
        position: { x: 1380, y: 190 },
      },
      {
        type: 'holding_fund',
        name: 'Paper Seed Holding Fund',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 920, y: 570 },
      },
      {
        type: 'fund_router',
        name: 'Deterministic Fund Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 1380, y: 570 },
      },
      {
        type: 'analyzer',
        name: 'Transaction Execution Monitor',
        config: {},
        position: { x: 1840, y: 190 },
      },
      {
        type: 'policy',
        name: 'Paper Trading Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Fail-closed paper policy verification.',
        },
        position: { x: 1840, y: 570 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'directive' },
      { fromIndex: 5, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 6, linkKind: 'fund_route' },
      { fromIndex: 6, toIndex: 4, linkKind: 'fund_route' },
      { fromIndex: 4, toIndex: 7, linkKind: 'verification' },
      { fromIndex: 7, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 4, toIndex: 8, linkKind: 'directive' },
    ],
    inputs: [
      {
        key: 'focus',
        label: 'Sector focus',
        kind: 'text',
        placeholder: 'e.g. large-cap tech momentum',
        target: { moduleIndex: 3, configKey: 'focus' },
      },
      {
        // Multiple inputs targeting the same configKey are joined with ' — '.
        key: 'philosophy',
        label: 'Trading philosophy',
        kind: 'select',
        options: ['momentum continuation', 'mean reversion', 'breakout capture'],
        target: { moduleIndex: 3, configKey: 'focus' },
      },
    ],
  },
  {
    id: 'engine_trend_research',
    label: 'Trend research engine',
    category: 'trend_research',
    description: 'Research → library → trend scanner loop; no trading desk until you add one.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Scoped Market Research',
        config: { topicScope: 'pending_operator_scope', curiosity: 'balanced' },
        position: { x: 0, y: 0 },
      },
      {
        type: 'library',
        name: 'Research Evidence Library',
        config: { topicScope: 'pending_operator_scope' },
        position: { x: 460, y: 0 },
      },
      {
        type: 'trend',
        name: 'Scoped Trend Scanner',
        config: { focus: 'pending_operator_scope', maxActiveTrends: 10, cadenceMinutes: 120 },
        position: { x: 920, y: 0 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. semiconductors and AI infrastructure',
        target: { moduleIndex: 0, configKey: 'topicScope' },
      },
    ],
  },
  {
    id: 'engine_crypto',
    label: 'Crypto engine',
    category: 'crypto',
    description:
      '24/7 crypto momentum engine on Alpaca paper — research, evidence, live crypto feed, trend, and execution.',
    available: false,
    unavailableReason:
      'Requires Alpaca crypto 24/7 session envelope (sess-crypto-alpaca-24x7) in session-constraint-catalog.',
    modules: [
      {
        type: 'research',
        name: 'Crypto Regime Research',
        config: { topicScope: 'pending_operator_scope', curiosity: 'balanced' },
        position: { x: 40, y: 420 },
      },
      {
        type: 'library',
        name: 'Crypto Evidence Library',
        config: { topicScope: 'pending_operator_scope', masterLibrary: false },
        position: { x: 300, y: 420 },
      },
      {
        type: 'live_api',
        name: 'Alpaca Crypto Feed',
        config: {
          venue: 'alpaca',
          instruments: ['BTC/USD'],
          feedClass: 'crypto_latest_quotes',
          pollSeconds: 30,
        },
        position: { x: 300, y: 580 },
      },
      {
        type: 'trend',
        name: 'Crypto Trend Scanner',
        config: { focus: 'pending_operator_scope', maxActiveTrends: 8, cadenceMinutes: 15 },
        position: { x: 560, y: 500 },
      },
      {
        type: 'trading',
        name: 'Paper Crypto Execution',
        config: {
          subtype: 'crypto',
          strategyFamilies: ['strat-001'],
          exitTimelineDays: 3,
          cadenceMinutes: 5,
        },
        position: { x: 820, y: 500 },
      },
      {
        type: 'holding_fund',
        name: 'Paper Crypto Holding Fund',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 300, y: 740 },
      },
      {
        type: 'fund_router',
        name: 'Deterministic Fund Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 820, y: 740 },
      },
      {
        type: 'analyzer',
        name: 'Crypto Execution Monitor',
        config: {},
        position: { x: 1080, y: 500 },
      },
      {
        type: 'policy',
        name: 'Paper Crypto Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: '24/7 crypto paper policy verification.',
        },
        position: { x: 1080, y: 660 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'directive' },
      { fromIndex: 5, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 6, linkKind: 'fund_route' },
      { fromIndex: 6, toIndex: 4, linkKind: 'fund_route' },
      { fromIndex: 4, toIndex: 7, linkKind: 'verification' },
      { fromIndex: 7, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 4, toIndex: 8, linkKind: 'directive' },
    ],
    inputs: [
      {
        key: 'focus',
        label: 'Crypto focus',
        kind: 'text',
        placeholder: 'e.g. BTC/ETH momentum pairs',
        target: { moduleIndex: 3, configKey: 'focus' },
      },
      {
        key: 'philosophy',
        label: 'Trading philosophy',
        kind: 'select',
        options: ['momentum continuation', 'mean reversion', 'breakout capture'],
        target: { moduleIndex: 3, configKey: 'focus' },
      },
    ],
  },
  {
    id: 'engine_prediction',
    label: 'Prediction markets engine',
    category: 'prediction',
    description:
      'Event-probability trading on Kalshi demo — research, evidence, Kalshi feed, trend scanner, and limit execution.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Event Probability Research',
        config: { topicScope: 'pending_operator_scope', curiosity: 'balanced' },
        position: { x: 40, y: 420 },
      },
      {
        type: 'library',
        name: 'Event Evidence Library',
        config: { topicScope: 'pending_operator_scope', masterLibrary: false },
        position: { x: 300, y: 420 },
      },
      {
        type: 'live_api',
        name: 'Kalshi Demo Market Feed',
        config: {
          venue: 'kalshi',
          instruments: [],
          feedClass: 'kalshi_demo',
          pollSeconds: 60,
        },
        position: { x: 300, y: 580 },
      },
      {
        type: 'trend',
        name: 'Event Trend Scanner',
        config: { focus: 'pending_operator_scope', maxActiveTrends: 10, cadenceMinutes: 60 },
        position: { x: 560, y: 500 },
      },
      {
        type: 'trading',
        name: 'Kalshi Paper Execution',
        config: {
          subtype: 'prediction',
          strategyFamilies: [],
          exitTimelineDays: 7,
          cadenceMinutes: 15,
        },
        position: { x: 820, y: 500 },
      },
      {
        type: 'holding_fund',
        name: 'Paper Prediction Holding Fund',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 300, y: 740 },
      },
      {
        type: 'fund_router',
        name: 'Deterministic Fund Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 820, y: 740 },
      },
      {
        type: 'analyzer',
        name: 'Prediction Execution Monitor',
        config: {},
        position: { x: 1080, y: 500 },
      },
      {
        type: 'policy',
        name: 'Paper Prediction Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Kalshi demo-only policy verification.',
        },
        position: { x: 1080, y: 660 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'directive' },
      { fromIndex: 5, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 6, linkKind: 'fund_route' },
      { fromIndex: 6, toIndex: 4, linkKind: 'fund_route' },
      { fromIndex: 4, toIndex: 7, linkKind: 'verification' },
      { fromIndex: 7, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 4, toIndex: 8, linkKind: 'directive' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Event scope',
        kind: 'text',
        placeholder: 'e.g. US elections, macro CPI releases',
        target: { moduleIndex: 0, configKey: 'topicScope' },
      },
      {
        key: 'focus',
        label: 'Scanner focus',
        kind: 'text',
        placeholder: 'e.g. high-liquidity political markets',
        target: { moduleIndex: 3, configKey: 'focus' },
      },
    ],
  },
  {
    id: 'engine_hft',
    label: 'High-frequency engine',
    category: 'high_frequency',
    description: 'Sub-minute execution engine with microstructure guards.',
    available: false,
    unavailableReason: 'Requires a low-latency worker and live feed entitlements (post-M5).',
    modules: [],
    links: [],
    inputs: [],
  },
];

/** Session envelope id that unlocks engine_crypto when present in session-constraint-catalog. */
export const ALPACA_CRYPTO_SESSION_ENVELOPE_ID = 'sess-crypto-alpaca-24x7';

/**
 * Resolve dynamic engine availability (e.g. crypto when session envelope ships).
 * Paper crypto preset becomes available only when `sess-crypto-alpaca-24x7` is
 * seeded; live crypto dispatch still requires live-gate arming (fail-closed).
 */
export function resolveEngineTemplateAvailability(
  template: EngineTemplate,
  sessionEnvelopeIds: ReadonlySet<string> = new Set(),
): EngineTemplate {
  if (template.id !== 'engine_crypto') return template;
  if (sessionEnvelopeIds.has(ALPACA_CRYPTO_SESSION_ENVELOPE_ID)) {
    const { unavailableReason: _removed, ...rest } = template;
    return { ...rest, available: true };
  }
  return template;
}

export function listResolvedEngineTemplates(
  sessionEnvelopeIds: ReadonlySet<string> = new Set(),
): EngineTemplate[] {
  return ENGINE_TEMPLATES.map((t) => resolveEngineTemplateAvailability(t, sessionEnvelopeIds));
}

export function getEngineTemplateById(id: string): EngineTemplate | undefined {
  return ENGINE_TEMPLATES.find((template) => template.id === id);
}

export const COMPANY_TEMPLATES: Record<CompanyTemplateId, CompanyTemplate> = {
  blank: {
    id: 'blank',
    label: 'Blank',
    description: 'Just the company and its Math module. Build the graph yourself.',
    modules: [],
    links: [],
  },
  day_trading_starter: {
    id: 'day_trading_starter',
    label: 'Day trading starter',
    description:
      'Full paper engine: research, evidence, market/runtime data, trend, execution, deterministic funds, and policy verification.',
    mathPosition: { x: 540, y: 500 },
    modules: [
      {
        type: 'research',
        name: 'Market Regime Research',
        config: { topicScope: 'pending_operator_scope', curiosity: 'balanced' },
        position: { x: 20, y: 180 },
      },
      {
        type: 'library',
        name: 'Strategy Evidence Library',
        config: { topicScope: 'pending_operator_scope', masterLibrary: false },
        position: { x: 280, y: 120 },
      },
      {
        type: 'live_api',
        name: 'Paper Market & Runtime Feed',
        config: {
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 60,
        },
        position: { x: 280, y: 300 },
      },
      {
        type: 'trend',
        name: 'Market Trend Scanner',
        config: { focus: 'pending_operator_scope', maxActiveTrends: 10, cadenceMinutes: 30 },
        position: { x: 540, y: 210 },
      },
      {
        type: 'trading',
        name: 'Paper Day-Trade Execution',
        config: {
          subtype: 'day',
          // strat-001 = opening_range_breakout in the seeded strategy catalog.
          strategyFamilies: ['strat-001'],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
        },
        position: { x: 800, y: 210 },
      },
      {
        type: 'holding_fund',
        name: 'Paper Seed Holding Fund',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 280, y: 500 },
      },
      {
        type: 'fund_router',
        name: 'Deterministic Fund Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 800, y: 500 },
      },
      {
        type: 'analyzer',
        name: 'Transaction Execution Monitor',
        config: {},
        position: { x: 1060, y: 210 },
      },
      {
        type: 'policy',
        name: 'Paper Trading Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Fail-closed paper policy verification.',
        },
        position: { x: 1060, y: 390 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'directive' },
      { fromIndex: 5, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 6, linkKind: 'fund_route' },
      { fromIndex: 6, toIndex: 4, linkKind: 'fund_route' },
      { fromIndex: 4, toIndex: 7, linkKind: 'verification' },
      { fromIndex: 7, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 4, toIndex: 8, linkKind: 'directive' },
    ],
  },
  trend_research_lab: {
    id: 'trend_research_lab',
    label: 'Trend research lab',
    description: 'Research and trend modules only — no trading desk until you add one.',
    modules: [
      {
        type: 'research',
        name: 'Scoped Market Research',
        config: { topicScope: 'pending_operator_scope', curiosity: 'balanced' },
        position: { x: 20, y: 240 },
      },
      {
        type: 'library',
        name: 'Research Evidence Library',
        config: { topicScope: 'pending_operator_scope', masterLibrary: false },
        position: { x: 280, y: 240 },
      },
      {
        type: 'trend',
        name: 'Scoped Trend Scanner',
        config: { focus: 'pending_operator_scope', maxActiveTrends: 10, cadenceMinutes: 120 },
        position: { x: 540, y: 240 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
    ],
  },
};
