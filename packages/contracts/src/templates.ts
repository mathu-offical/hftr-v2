import { z } from 'zod';
import { ModuleType, type CreateCompanyEngine } from './modules';

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

/**
 * Stable template link order (D-073): non-math graph edges keep author order;
 * Math fund_route edges are contiguous as into-Math then out-of-Math so capital
 * flow reads holding → Math → router in every engine template.
 */
export function orderTemplateLinks(links: readonly TemplateLink[]): TemplateLink[] {
  const mathFund: TemplateLink[] = [];
  const rest: TemplateLink[] = [];
  for (const link of links) {
    const touchesMath = link.fromIndex === 'math' || link.toIndex === 'math';
    if (link.linkKind === 'fund_route' && touchesMath) {
      mathFund.push(link);
    } else {
      rest.push(link);
    }
  }
  const intoMath = mathFund
    .filter((link) => link.toIndex === 'math')
    .sort((a, b) => String(a.fromIndex).localeCompare(String(b.fromIndex)));
  const outOfMath = mathFund
    .filter((link) => link.fromIndex === 'math')
    .sort((a, b) => String(a.toIndex).localeCompare(String(b.toIndex)));
  const otherMathFund = mathFund.filter(
    (link) => link.toIndex !== 'math' && link.fromIndex !== 'math',
  );
  return [...rest, ...intoMath, ...outOfMath, ...otherMathFund];
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

export interface EngineTemplateInputTarget {
  moduleIndex: number;
  configKey: string;
}

export interface EngineTemplateInput {
  key: string;
  label: string;
  kind: 'text' | 'select';
  options?: string[];
  placeholder?: string;
  /** Which inserted module's config field receives the value. */
  target: EngineTemplateInputTarget;
  /**
   * Extra modules that receive the same operator value (D-143).
   * One form field; fan-out at insert so research/librarian/library stay scoped together.
   */
  alsoTargets?: EngineTemplateInputTarget[];
}

/** D-202: stable decision-node seeds declared on engine templates. */
export interface EngineTemplateDecisionSeed {
  kind: string;
  ownerModuleIndex: number | null;
  optionRefs?: string[];
  defaultSelectedRef?: string;
}

/** Primary + alsoTargets for template input application. */
export function templateInputTargets(input: EngineTemplateInput): EngineTemplateInputTarget[] {
  return [input.target, ...(input.alsoTargets ?? [])];
}

export interface EngineTemplate {
  id: string;
  label: string;
  category:
    | 'day_trading'
    | 'trend_research'
    | 'crypto'
    | 'prediction'
    | 'high_frequency'
    | 'long_term'
    | 'research'
    | 'simulation';
  description: string;
  available: boolean;
  unavailableReason?: string;
  modules: TemplateModule[];
  links: TemplateLink[];
  inputs: EngineTemplateInput[];
  /** D-202: documents required decision kinds; builder fills option catalogs. */
  decisionNodes?: EngineTemplateDecisionSeed[];
}

/** Shared execution-desk decision seed pattern (research spine → feed → trend → trade). */
const EXECUTION_DESK_DECISION_SEEDS = (
  tradeIndex: number,
  analyzerIndex: number,
  strategyRefs: readonly string[],
): EngineTemplateDecisionSeed[] => [
  { kind: 'research_subtype', ownerModuleIndex: 0 },
  { kind: 'curiosity_band', ownerModuleIndex: 0 },
  { kind: 'admission_mode', ownerModuleIndex: 0 },
  { kind: 'cadence_band', ownerModuleIndex: 0 },
  {
    kind: 'branch_role',
    ownerModuleIndex: 0,
    optionRefs: ['discover', 'verify_sanity'],
    defaultSelectedRef: 'discover',
  },
  { kind: 'librarian_subtype', ownerModuleIndex: 1 },
  { kind: 'cadence_band', ownerModuleIndex: 1 },
  { kind: 'library_class', ownerModuleIndex: 2 },
  { kind: 'feed_class', ownerModuleIndex: 3 },
  { kind: 'query_policy', ownerModuleIndex: 3 },
  { kind: 'schedule_policy', ownerModuleIndex: 3 },
  { kind: 'trend_posture', ownerModuleIndex: 4 },
  { kind: 'cadence_band', ownerModuleIndex: 4 },
  {
    kind: 'strategy_family',
    ownerModuleIndex: tradeIndex,
    optionRefs: [...strategyRefs],
  },
  { kind: 'branch_role', ownerModuleIndex: tradeIndex },
  { kind: 'recovery_phase', ownerModuleIndex: tradeIndex },
  { kind: 'emit_mode', ownerModuleIndex: analyzerIndex },
];

/** Research-pack decision seeds (curator → librarian → library → analyzer). */
const RESEARCH_PACK_DECISION_SEEDS: EngineTemplateDecisionSeed[] = [
  { kind: 'research_subtype', ownerModuleIndex: 0 },
  { kind: 'curiosity_band', ownerModuleIndex: 0 },
  { kind: 'admission_mode', ownerModuleIndex: 0 },
  { kind: 'cadence_band', ownerModuleIndex: 0 },
  {
    kind: 'branch_role',
    ownerModuleIndex: 0,
    optionRefs: ['discover', 'verify_sanity'],
    defaultSelectedRef: 'discover',
  },
  { kind: 'librarian_subtype', ownerModuleIndex: 1 },
  { kind: 'cadence_band', ownerModuleIndex: 1 },
  { kind: 'library_class', ownerModuleIndex: 2 },
  { kind: 'emit_mode', ownerModuleIndex: 3 },
];

/** Simulation desk seeds (feed → trend → trade spread). */
const SIM_DESK_DECISION_SEEDS = (
  strategyRefs: readonly string[],
): EngineTemplateDecisionSeed[] => [
  { kind: 'feed_class', ownerModuleIndex: 0 },
  { kind: 'query_policy', ownerModuleIndex: 0 },
  { kind: 'schedule_policy', ownerModuleIndex: 0 },
  { kind: 'trend_posture', ownerModuleIndex: 1 },
  { kind: 'cadence_band', ownerModuleIndex: 1 },
  {
    kind: 'strategy_family',
    ownerModuleIndex: 2,
    optionRefs: [...strategyRefs],
  },
  { kind: 'branch_role', ownerModuleIndex: 2 },
  { kind: 'recovery_phase', ownerModuleIndex: 2 },
  { kind: 'emit_mode', ownerModuleIndex: 5 },
];

export const ENGINE_TEMPLATES: EngineTemplate[] = [
  {
    id: 'engine_day_trading',
    label: 'Day trading engine',
    category: 'day_trading',
    description:
      'Session desk research + evidence + market/runtime data → intraday trend → paper execution, with deterministic funds and policy verification. Seeds regime lab + desk-aligned research packs.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Desk specialty research (internal)',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'specialty_desk',
          curiosity: 'exploratory',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'librarian',
        name: 'Session Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Session Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          masterLibrary: false,
          libraryClass: 'specialty_evidence',
        },
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
        position: { x: 460, y: 552 },
      },
      {
        type: 'trend',
        name: 'Market Trend Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'session_intraday',
          maxActiveTrends: 10,
          cadenceMinutes: 30,
        },
        position: { x: 920, y: 276 },
      },
      {
        type: 'trading',
        name: 'Paper Day-Trade Execution',
        config: {
          subtype: 'day',
          strategyFamilies: ['strat-001', 'strat-002', 'strat-005'],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
          executionBinding: { routingMode: 'funds_only' },
        },
        position: { x: 1380, y: 276 },
      },
      {
        type: 'holding_fund',
        name: 'Paper Seed Holding Fund',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 920, y: 828 },
      },
      {
        type: 'fund_router',
        name: 'Day-Trade Fund Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 1380, y: 828 },
      },
      {
        type: 'analyzer',
        name: 'Transaction Execution Monitor',
        config: {
          emitMode: 'verify_loopback',
          streamDescriptor: 'execution_verify_loopback',
        },
        position: { x: 1840, y: 276 },
      },
      {
        type: 'policy',
        name: 'Paper Trading Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Fail-closed paper policy verification.',
        },
        position: { x: 1840, y: 828 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'directive' },
      { fromIndex: 5, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 8, toIndex: 9, linkKind: 'verification' },
      { fromIndex: 5, toIndex: 9, linkKind: 'directive' },
      { fromIndex: 6, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 7, linkKind: 'fund_route' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. sector and theme scope',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Sector focus',
        kind: 'text',
        placeholder: 'e.g. large-cap tech momentum',
        target: { moduleIndex: 4, configKey: 'focus' },
      },
      {
        // Multiple inputs targeting the same configKey are joined with ' — '.
        key: 'philosophy',
        label: 'Trading philosophy',
        kind: 'select',
        options: ['momentum continuation', 'mean reversion', 'breakout capture'],
        target: { moduleIndex: 4, configKey: 'focus' },
      },
    ],
    decisionNodes: EXECUTION_DESK_DECISION_SEEDS(5, 8, [
      'strat-001',
      'strat-002',
      'strat-005',
    ]),
  },
  {
    id: 'engine_trend_research',
    label: 'Trend research engine',
    category: 'trend_research',
    description:
      'Research → library → trend scanner loop; terminal analyzer concat → data_out. No trading desk until you add one.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Scoped Market Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'specialty_desk',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'librarian',
        name: 'Trend Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Research Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'topic_runtime',
          masterLibrary: false,
        },
        position: { x: 460, y: 0 },
      },
      {
        type: 'trend',
        name: 'Scoped Trend Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'research_only',
          maxActiveTrends: 10,
          cadenceMinutes: 120,
        },
        position: { x: 920, y: 0 },
      },
      {
        type: 'analyzer',
        name: 'Trend Research Concat',
        config: {
          emitMode: 'to_desk_stream',
          streamDescriptor: 'trend_research_concat',
        },
        position: { x: 1380, y: 0 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. semiconductors and AI infrastructure',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
          { moduleIndex: 3, configKey: 'focus' },
        ],
      },
      {
        key: 'focus',
        label: 'Trend focus',
        kind: 'text',
        placeholder: 'e.g. semiconductors and AI infrastructure',
        target: { moduleIndex: 3, configKey: 'focus' },
      },
    ],
    decisionNodes: [
      ...RESEARCH_PACK_DECISION_SEEDS.filter((s) => s.kind !== 'emit_mode'),
      { kind: 'trend_posture', ownerModuleIndex: 3 },
      { kind: 'cadence_band', ownerModuleIndex: 3 },
      { kind: 'emit_mode', ownerModuleIndex: 4 },
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
        name: 'Crypto context research (internal)',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'crypto_onchain_context',
          curiosity: 'balanced',
        },
        position: { x: 40, y: 420 },
      },
      {
        type: 'librarian',
        name: 'Crypto Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 40, y: 580 },
      },
      {
        type: 'library',
        name: 'Crypto Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
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
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'crypto_cross_cap',
          maxActiveTrends: 8,
          cadenceMinutes: 15,
        },
        position: { x: 560, y: 500 },
      },
      {
        type: 'trading',
        name: 'Paper Crypto Execution',
        config: {
          subtype: 'crypto',
          // Trend continuation + VWAP-style reversion + pairs/relative value (24/7 desks).
          strategyFamilies: ['strat-003', 'strat-005', 'strat-008'],
          exitTimelineDays: 3,
          cadenceMinutes: 5,
          executionBinding: { routingMode: 'funds_only' },
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
        name: 'Crypto Fund Router',
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
        config: {
          emitMode: 'verify_loopback',
          streamDescriptor: 'crypto_execution_verify',
        },
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
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'directive' },
      { fromIndex: 6, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 7, linkKind: 'fund_route' },
      // fund_router → trading owner Math is provisioned at insert (not stubbed here).
      { fromIndex: 5, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 8, toIndex: 9, linkKind: 'verification' },
      { fromIndex: 5, toIndex: 9, linkKind: 'directive' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. sector and theme scope',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Crypto focus',
        kind: 'text',
        placeholder: 'e.g. BTC/ETH momentum pairs',
        target: { moduleIndex: 4, configKey: 'focus' },
      },
      {
        key: 'philosophy',
        label: 'Trading philosophy',
        kind: 'select',
        options: ['momentum continuation', 'mean reversion', 'breakout capture'],
        target: { moduleIndex: 4, configKey: 'focus' },
      },
    ],
    decisionNodes: EXECUTION_DESK_DECISION_SEEDS(5, 8, [
      'strat-003',
      'strat-005',
      'strat-008',
    ]),
  },
  {
    id: 'engine_prediction',
    label: 'Prediction markets engine',
    category: 'prediction',
    description:
      'Event-probability trading on Kalshi demo — research, evidence, Kalshi feed, trend scanner, and limit execution.',
    available: false,
    unavailableReason:
      'Requires seeded prediction-market strategy families in seeded-strategy-catalog; interim strat-005/strat-008 palette pending dedicated prediction families.',
    modules: [
      {
        type: 'research',
        name: 'Prediction niche research (internal)',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'prediction_niche',
          curiosity: 'balanced',
        },
        position: { x: 40, y: 420 },
      },
      {
        type: 'librarian',
        name: 'Event Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 40, y: 580 },
      },
      {
        type: 'library',
        name: 'Event Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
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
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'event_probability',
          maxActiveTrends: 10,
          cadenceMinutes: 60,
        },
        position: { x: 560, y: 500 },
      },
      {
        type: 'trading',
        name: 'Kalshi Paper Execution',
        config: {
          subtype: 'prediction',
          // Event-probability desks: mean-reversion + relative-value until dedicated
          // prediction families ship in seeded-strategy-catalog.
          strategyFamilies: ['strat-005', 'strat-008'],
          exitTimelineDays: 7,
          cadenceMinutes: 15,
          executionBinding: { routingMode: 'funds_only' },
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
        name: 'Prediction Fund Router',
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
        config: {
          emitMode: 'verify_loopback',
          streamDescriptor: 'prediction_execution_verify',
        },
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
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'directive' },
      { fromIndex: 6, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 7, linkKind: 'fund_route' },
      // fund_router → trading owner Math is provisioned at insert (not stubbed here).
      { fromIndex: 5, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 8, toIndex: 9, linkKind: 'verification' },
      { fromIndex: 5, toIndex: 9, linkKind: 'directive' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Event scope',
        kind: 'text',
        placeholder: 'e.g. US elections, macro CPI releases',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Scanner focus',
        kind: 'text',
        placeholder: 'e.g. high-liquidity political markets',
        target: { moduleIndex: 4, configKey: 'focus' },
      },
    ],
    decisionNodes: EXECUTION_DESK_DECISION_SEEDS(5, 8, ['strat-005', 'strat-008']),
  },
  {
    id: 'engine_long_term',
    label: 'Long-term engine',
    category: 'long_term',
    description:
      'Full spine for horizon positioning: filings research, specialty evidence, low-cadence trend and execution.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Filings fundamentals research (internal)',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_filings',
          curiosity: 'conservative',
          cadenceMinutes: 720,
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'research',
        name: 'Event catalyst research (internal)',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'event_catalyst',
          curiosity: 'balanced',
          cadenceMinutes: 360,
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'librarian',
        name: 'Horizon Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 560 },
      },
      {
        type: 'library',
        name: 'Long-horizon Evidence',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'live_api',
        name: 'Paper Market Feed',
        config: {
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 300,
        },
        position: { x: 460, y: 552 },
      },
      {
        type: 'trend',
        name: 'Horizon Trend Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'position_horizon',
          maxActiveTrends: 8,
          cadenceMinutes: 240,
        },
        position: { x: 920, y: 276 },
      },
      {
        type: 'trading',
        name: 'Paper Long-term Execution',
        config: {
          subtype: 'long_term',
          // Multi-session trend + compression breakout + lead-lag theme propagation.
          strategyFamilies: ['strat-003', 'strat-004', 'strat-009'],
          exitTimelineDays: 180,
          cadenceMinutes: 60,
          executionBinding: { routingMode: 'funds_only' },
        },
        position: { x: 1380, y: 276 },
      },
      {
        type: 'holding_fund',
        name: 'Paper Horizon Holding Fund',
        config: { source: 'company_seed', allocationPolicyRef: 'paper_balanced_general_v1' },
        position: { x: 920, y: 828 },
      },
      {
        type: 'fund_router',
        name: 'Horizon Fund Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 1380, y: 828 },
      },
      {
        type: 'analyzer',
        name: 'Horizon Execution Monitor',
        config: {
          emitMode: 'verify_loopback',
          streamDescriptor: 'horizon_execution_verify',
        },
        position: { x: 1840, y: 276 },
      },
      {
        type: 'policy',
        name: 'Paper Long-term Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Long-horizon paper policy verification.',
        },
        position: { x: 1840, y: 828 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 5, toIndex: 6, linkKind: 'directive' },
      { fromIndex: 7, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 8, linkKind: 'fund_route' },
      { fromIndex: 6, toIndex: 9, linkKind: 'verification' },
      { fromIndex: 9, toIndex: 10, linkKind: 'verification' },
      { fromIndex: 6, toIndex: 10, linkKind: 'directive' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Horizon scope',
        kind: 'text',
        placeholder: 'e.g. defensive rotation, quality compounders',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
          { moduleIndex: 3, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Trend focus',
        kind: 'text',
        placeholder: 'e.g. multi-week sector leadership',
        target: { moduleIndex: 5, configKey: 'focus' },
      },
    ],
    decisionNodes: [
      { kind: 'research_subtype', ownerModuleIndex: 0 },
      { kind: 'curiosity_band', ownerModuleIndex: 0 },
      { kind: 'admission_mode', ownerModuleIndex: 0 },
      { kind: 'cadence_band', ownerModuleIndex: 0 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 0,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'research_subtype', ownerModuleIndex: 1 },
      { kind: 'curiosity_band', ownerModuleIndex: 1 },
      { kind: 'admission_mode', ownerModuleIndex: 1 },
      { kind: 'cadence_band', ownerModuleIndex: 1 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 1,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'librarian_subtype', ownerModuleIndex: 2 },
      { kind: 'cadence_band', ownerModuleIndex: 2 },
      { kind: 'library_class', ownerModuleIndex: 3 },
      { kind: 'feed_class', ownerModuleIndex: 4 },
      { kind: 'query_policy', ownerModuleIndex: 4 },
      { kind: 'schedule_policy', ownerModuleIndex: 4 },
      { kind: 'trend_posture', ownerModuleIndex: 5 },
      { kind: 'cadence_band', ownerModuleIndex: 5 },
      {
        kind: 'strategy_family',
        ownerModuleIndex: 6,
        optionRefs: ['strat-003', 'strat-004', 'strat-009'],
      },
      { kind: 'branch_role', ownerModuleIndex: 6 },
      { kind: 'recovery_phase', ownerModuleIndex: 6 },
      { kind: 'emit_mode', ownerModuleIndex: 9 },
    ],
  },
  {
    id: 'research_web_fabric',
    label: 'Web research fabric',
    category: 'research',
    description:
      'Pure-data research ENGINE: web discover + librarian → topic libraries; terminal analyzer concat → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Web Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_web',
          curiosity: 'exploratory',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'librarian',
        name: 'Relevance Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Topic Runtime Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'topic_runtime',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'analyzer',
        name: 'Web Fabric Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'web_fabric_concat' },
        position: { x: 920, y: 140 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 3, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. semiconductor supply chain',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
    ],
    decisionNodes: RESEARCH_PACK_DECISION_SEEDS,
  },
  {
    id: 'research_filings_fundamentals',
    label: 'Horizon filings & fundamentals',
    category: 'research',
    description:
      'Long-horizon fundamentals pack for multi-month desks: SEC/EDGAR + fundamentals library (conservative cadence) → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Filings Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_filings',
          curiosity: 'conservative',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'librarian',
        name: 'Fundamentals Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Fundamentals Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'topic_runtime',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'analyzer',
        name: 'Filings Fundamentals Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'filings_fundamentals_concat' },
        position: { x: 920, y: 140 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 3, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Filings scope',
        kind: 'text',
        placeholder: 'e.g. S&P 500 10-K themes',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
    ],
    decisionNodes: RESEARCH_PACK_DECISION_SEEDS,
  },
  {
    id: 'research_seed_mechanisms',
    label: 'Seeded mechanisms keeper',
    category: 'research',
    description:
      'Protect and refresh compile-time seeded trading-mechanism libraries; terminal analyzer concat → library.',
    available: true,
    modules: [
      {
        type: 'librarian',
        name: 'Seed Keeper',
        config: {
          topicScope: 'trading mechanisms',
          librarianSubtype: 'librarian_seed_keeper',
          seedProtect: true,
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'research',
        name: 'Mechanism Web Refresh',
        config: {
          topicScope: 'trading mechanisms',
          researchSubtype: 'external_web',
          curiosity: 'conservative',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Seeded Mechanisms Library',
        config: {
          topicScope: 'trading mechanisms',
          libraryClass: 'seeded_mechanisms',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'analyzer',
        name: 'Mechanisms Keeper Concat',
        config: { emitMode: 'to_library' },
        position: { x: 920, y: 140 },
      },
    ],
    links: [
      { fromIndex: 1, toIndex: 0, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 3, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. mechanism themes',
        target: { moduleIndex: 1, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 0, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
    ],
    decisionNodes: [
      { kind: 'librarian_subtype', ownerModuleIndex: 0 },
      { kind: 'cadence_band', ownerModuleIndex: 0 },
      { kind: 'research_subtype', ownerModuleIndex: 1 },
      { kind: 'curiosity_band', ownerModuleIndex: 1 },
      { kind: 'admission_mode', ownerModuleIndex: 1 },
      { kind: 'cadence_band', ownerModuleIndex: 1 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 1,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'library_class', ownerModuleIndex: 2 },
      { kind: 'emit_mode', ownerModuleIndex: 3 },
    ],
  },
  {
    id: 'research_event_catalyst',
    label: 'Horizon event catalysts',
    category: 'research',
    description:
      'Event/macro catalyst pack for long-term desks: catalyst curator + evidence library for multi-week windows → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Event Catalyst Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'event_catalyst',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'librarian',
        name: 'Event Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Event Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'analyzer',
        name: 'Event Catalyst Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'event_catalyst_concat' },
        position: { x: 920, y: 140 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 3, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Event scope',
        kind: 'text',
        placeholder: 'e.g. earnings season, CPI prints',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
    ],
    decisionNodes: RESEARCH_PACK_DECISION_SEEDS,
  },
  {
    id: 'research_market_regime_lab',
    label: 'Session regime lab',
    category: 'research',
    description:
      'Macro/regime context pack for day-trading desks: market news + desk specialty, regime evidence, paper feed, research-only trend → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Market News Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_market_news',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'research',
        name: 'Regime Desk Specialty Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'specialty_desk',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'librarian',
        name: 'Regime Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 560 },
      },
      {
        type: 'library',
        name: 'Regime Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'live_api',
        name: 'Regime Paper Market Feed',
        config: {
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 60,
        },
        position: { x: 460, y: 552 },
      },
      {
        type: 'trend',
        name: 'Research-only Trend Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'research_only',
          maxActiveTrends: 10,
          cadenceMinutes: 60,
        },
        position: { x: 920, y: 276 },
      },
      {
        type: 'analyzer',
        name: 'Regime Lab Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'regime_lab_concat' },
        position: { x: 1380, y: 276 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 5, toIndex: 6, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Regime scope',
        kind: 'text',
        placeholder: 'e.g. risk-on/risk-off equities',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
          { moduleIndex: 3, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Scanner focus',
        kind: 'text',
        placeholder: 'e.g. breadth and leadership',
        target: { moduleIndex: 5, configKey: 'focus' },
      },
    ],
    decisionNodes: [
      { kind: 'research_subtype', ownerModuleIndex: 0 },
      { kind: 'curiosity_band', ownerModuleIndex: 0 },
      { kind: 'admission_mode', ownerModuleIndex: 0 },
      { kind: 'cadence_band', ownerModuleIndex: 0 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 0,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'research_subtype', ownerModuleIndex: 1 },
      { kind: 'curiosity_band', ownerModuleIndex: 1 },
      { kind: 'admission_mode', ownerModuleIndex: 1 },
      { kind: 'cadence_band', ownerModuleIndex: 1 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 1,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'librarian_subtype', ownerModuleIndex: 2 },
      { kind: 'cadence_band', ownerModuleIndex: 2 },
      { kind: 'library_class', ownerModuleIndex: 3 },
      { kind: 'feed_class', ownerModuleIndex: 4 },
      { kind: 'query_policy', ownerModuleIndex: 4 },
      { kind: 'schedule_policy', ownerModuleIndex: 4 },
      { kind: 'trend_posture', ownerModuleIndex: 5 },
      { kind: 'cadence_band', ownerModuleIndex: 5 },
      { kind: 'emit_mode', ownerModuleIndex: 6 },
    ],
  },
  {
    id: 'research_crypto_context',
    label: 'Crypto context research',
    category: 'research',
    description:
      'Crypto paper-desk support pack: on-chain/context research, crypto market news, knowledge library, and cross-cap scanner → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Crypto Context Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'crypto_onchain_context',
          curiosity: 'exploratory',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'research',
        name: 'Crypto Market News',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_market_news',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'librarian',
        name: 'Crypto Context Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 560 },
      },
      {
        type: 'library',
        name: 'Crypto Knowledge Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'live_api',
        name: 'Crypto Context Paper Feed',
        config: {
          venue: 'alpaca',
          instruments: ['BTC/USD'],
          feedClass: 'crypto_latest_quotes',
          pollSeconds: 30,
        },
        position: { x: 460, y: 552 },
      },
      {
        type: 'trend',
        name: 'Crypto Cross-cap Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'crypto_cross_cap',
          maxActiveTrends: 8,
          cadenceMinutes: 30,
        },
        position: { x: 920, y: 276 },
      },
      {
        type: 'analyzer',
        name: 'Crypto Context Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'crypto_context_concat' },
        position: { x: 1380, y: 276 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 5, toIndex: 6, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. crypto knowledge scope',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
          { moduleIndex: 3, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Crypto focus',
        kind: 'text',
        placeholder: 'e.g. BTC/ETH regime + alts',
        target: { moduleIndex: 5, configKey: 'focus' },
      },
    ],
    decisionNodes: [
      { kind: 'research_subtype', ownerModuleIndex: 0 },
      { kind: 'curiosity_band', ownerModuleIndex: 0 },
      { kind: 'admission_mode', ownerModuleIndex: 0 },
      { kind: 'cadence_band', ownerModuleIndex: 0 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 0,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'research_subtype', ownerModuleIndex: 1 },
      { kind: 'curiosity_band', ownerModuleIndex: 1 },
      { kind: 'admission_mode', ownerModuleIndex: 1 },
      { kind: 'cadence_band', ownerModuleIndex: 1 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 1,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'librarian_subtype', ownerModuleIndex: 2 },
      { kind: 'cadence_band', ownerModuleIndex: 2 },
      { kind: 'library_class', ownerModuleIndex: 3 },
      { kind: 'feed_class', ownerModuleIndex: 4 },
      { kind: 'query_policy', ownerModuleIndex: 4 },
      { kind: 'schedule_policy', ownerModuleIndex: 4 },
      { kind: 'trend_posture', ownerModuleIndex: 5 },
      { kind: 'cadence_band', ownerModuleIndex: 5 },
      { kind: 'emit_mode', ownerModuleIndex: 6 },
    ],
  },
  {
    id: 'research_prediction_niche',
    label: 'Prediction niche research',
    category: 'research',
    description:
      'Kalshi/prediction-desk support pack: niche probability research, catalyst curator, demo feed, event-probability scanner → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Prediction Niche Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'prediction_niche',
          curiosity: 'exploratory',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'research',
        name: 'Prediction Catalyst Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'event_catalyst',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'librarian',
        name: 'Prediction Niche Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 560 },
      },
      {
        type: 'library',
        name: 'Prediction Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'live_api',
        name: 'Kalshi Demo Feed',
        config: {
          venue: 'kalshi',
          instruments: [],
          feedClass: 'kalshi_demo',
          pollSeconds: 60,
        },
        position: { x: 460, y: 552 },
      },
      {
        type: 'trend',
        name: 'Event Probability Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'event_probability',
          maxActiveTrends: 10,
          cadenceMinutes: 60,
        },
        position: { x: 920, y: 276 },
      },
      {
        type: 'analyzer',
        name: 'Prediction Niche Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'prediction_niche_concat' },
        position: { x: 1380, y: 276 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 5, toIndex: 6, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Event scope',
        kind: 'text',
        placeholder: 'e.g. elections, macro prints',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
          { moduleIndex: 3, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Scanner focus',
        kind: 'text',
        placeholder: 'e.g. high-liquidity political markets',
        target: { moduleIndex: 5, configKey: 'focus' },
      },
    ],
    decisionNodes: [
      { kind: 'research_subtype', ownerModuleIndex: 0 },
      { kind: 'curiosity_band', ownerModuleIndex: 0 },
      { kind: 'admission_mode', ownerModuleIndex: 0 },
      { kind: 'cadence_band', ownerModuleIndex: 0 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 0,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'research_subtype', ownerModuleIndex: 1 },
      { kind: 'curiosity_band', ownerModuleIndex: 1 },
      { kind: 'admission_mode', ownerModuleIndex: 1 },
      { kind: 'cadence_band', ownerModuleIndex: 1 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 1,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'librarian_subtype', ownerModuleIndex: 2 },
      { kind: 'cadence_band', ownerModuleIndex: 2 },
      { kind: 'library_class', ownerModuleIndex: 3 },
      { kind: 'feed_class', ownerModuleIndex: 4 },
      { kind: 'query_policy', ownerModuleIndex: 4 },
      { kind: 'schedule_policy', ownerModuleIndex: 4 },
      { kind: 'trend_posture', ownerModuleIndex: 5 },
      { kind: 'cadence_band', ownerModuleIndex: 5 },
      { kind: 'emit_mode', ownerModuleIndex: 6 },
    ],
  },
  {
    id: 'research_desk_aligned',
    label: 'Day-trade desk specialty',
    category: 'research',
    description:
      'Intraday specialty-desk feeder for day-trading engines: session curator, desk evidence, paper feed, and session_intraday trend → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Desk-Aligned Specialty Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'specialty_desk',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'librarian',
        name: 'Desk Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Desk Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'live_api',
        name: 'Desk Paper Market Feed',
        config: {
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 60,
        },
        position: { x: 460, y: 552 },
      },
      {
        type: 'trend',
        name: 'Desk Session Feeder Trend',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'session_intraday',
          maxActiveTrends: 10,
          cadenceMinutes: 15,
        },
        position: { x: 920, y: 276 },
      },
      {
        type: 'analyzer',
        name: 'Desk Aligned Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'desk_aligned_concat' },
        position: { x: 1380, y: 276 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Desk scope',
        kind: 'text',
        placeholder: 'e.g. day-trade large-cap tech',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Session focus',
        kind: 'text',
        placeholder: 'e.g. day-trade large-cap tech momentum',
        target: { moduleIndex: 4, configKey: 'focus' },
      },
    ],
    decisionNodes: [
      ...RESEARCH_PACK_DECISION_SEEDS.filter((s) => s.kind !== 'emit_mode'),
      { kind: 'feed_class', ownerModuleIndex: 3 },
      { kind: 'query_policy', ownerModuleIndex: 3 },
      { kind: 'schedule_policy', ownerModuleIndex: 3 },
      { kind: 'trend_posture', ownerModuleIndex: 4 },
      { kind: 'cadence_band', ownerModuleIndex: 4 },
      { kind: 'emit_mode', ownerModuleIndex: 5 },
    ],
  },
  {
    id: 'research_multi_curator',
    label: 'Multi-curator fabric',
    category: 'research',
    description:
      'Broad pure-data fabric with web, filings, and market-news curators plus librarian; terminal analyzer concat → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Web Curator',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_web',
          curiosity: 'exploratory',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'research',
        name: 'Filings Curator',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_filings',
          curiosity: 'conservative',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'research',
        name: 'Market News Curator',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_market_news',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 560 },
      },
      {
        type: 'librarian',
        name: 'Fabric Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 840 },
      },
      {
        type: 'library',
        name: 'Multi-topic Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'topic_runtime',
          masterLibrary: false,
        },
        position: { x: 460, y: 280 },
      },
      {
        type: 'library',
        name: 'Specialty Cross-ref Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 460, y: 700 },
      },
      {
        type: 'analyzer',
        name: 'Multi-curator Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'multi_curator_concat' },
        position: { x: 920, y: 700 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 5, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 6, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Fabric scope',
        kind: 'text',
        placeholder: 'e.g. company-wide market knowledge',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
          { moduleIndex: 3, configKey: 'topicScope' },
          { moduleIndex: 4, configKey: 'topicScope' },
          { moduleIndex: 5, configKey: 'topicScope' },
        ],
      },
    ],
    decisionNodes: [
      { kind: 'research_subtype', ownerModuleIndex: 0 },
      { kind: 'curiosity_band', ownerModuleIndex: 0 },
      { kind: 'admission_mode', ownerModuleIndex: 0 },
      { kind: 'cadence_band', ownerModuleIndex: 0 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 0,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'research_subtype', ownerModuleIndex: 1 },
      { kind: 'curiosity_band', ownerModuleIndex: 1 },
      { kind: 'admission_mode', ownerModuleIndex: 1 },
      { kind: 'cadence_band', ownerModuleIndex: 1 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 1,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'research_subtype', ownerModuleIndex: 2 },
      { kind: 'curiosity_band', ownerModuleIndex: 2 },
      { kind: 'admission_mode', ownerModuleIndex: 2 },
      { kind: 'cadence_band', ownerModuleIndex: 2 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 2,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'librarian_subtype', ownerModuleIndex: 3 },
      { kind: 'cadence_band', ownerModuleIndex: 3 },
      { kind: 'library_class', ownerModuleIndex: 4 },
      { kind: 'library_class', ownerModuleIndex: 5 },
      { kind: 'emit_mode', ownerModuleIndex: 6 },
    ],
  },
  {
    id: 'research_microstructure_lab',
    label: 'Microstructure research lab',
    category: 'research',
    description:
      'Quote/flow toxicity and imbalance context pack for high-frequency-oriented paper desks: microstructure + market-news curators, evidence library, high-cadence Alpaca bars, research-only scanner → data_out.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Microstructure Context Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'microstructure_context',
          curiosity: 'exploratory',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'research',
        name: 'Quote Quality News Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_market_news',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'librarian',
        name: 'Microstructure Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 560 },
      },
      {
        type: 'library',
        name: 'Microstructure Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 460, y: 140 },
      },
      {
        type: 'live_api',
        name: 'Alpaca Bars Feed',
        config: {
          venue: 'alpaca',
          instruments: [],
          feedClass: 'iex_free',
          pollSeconds: 5,
        },
        position: { x: 460, y: 552 },
      },
      {
        type: 'trend',
        name: 'Microstructure Lab Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'research_only',
          maxActiveTrends: 16,
          cadenceMinutes: 5,
        },
        position: { x: 920, y: 276 },
      },
      {
        type: 'analyzer',
        name: 'Microstructure Lab Concat',
        config: { emitMode: 'to_desk_stream', streamDescriptor: 'microstructure_lab_concat' },
        position: { x: 1380, y: 276 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 6, linkKind: 'data_feed' },
      { fromIndex: 5, toIndex: 6, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Microstructure scope',
        kind: 'text',
        placeholder: 'e.g. liquid large-cap quote quality',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
          { moduleIndex: 3, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Scanner focus',
        kind: 'text',
        placeholder: 'e.g. spread stability and flow toxicity',
        target: { moduleIndex: 5, configKey: 'focus' },
      },
    ],
    decisionNodes: [
      { kind: 'research_subtype', ownerModuleIndex: 0 },
      { kind: 'curiosity_band', ownerModuleIndex: 0 },
      { kind: 'admission_mode', ownerModuleIndex: 0 },
      { kind: 'cadence_band', ownerModuleIndex: 0 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 0,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'research_subtype', ownerModuleIndex: 1 },
      { kind: 'curiosity_band', ownerModuleIndex: 1 },
      { kind: 'admission_mode', ownerModuleIndex: 1 },
      { kind: 'cadence_band', ownerModuleIndex: 1 },
      {
        kind: 'branch_role',
        ownerModuleIndex: 1,
        optionRefs: ['discover', 'verify_sanity'],
        defaultSelectedRef: 'discover',
      },
      { kind: 'librarian_subtype', ownerModuleIndex: 2 },
      { kind: 'cadence_band', ownerModuleIndex: 2 },
      { kind: 'library_class', ownerModuleIndex: 3 },
      { kind: 'feed_class', ownerModuleIndex: 4 },
      { kind: 'query_policy', ownerModuleIndex: 4 },
      { kind: 'schedule_policy', ownerModuleIndex: 4 },
      { kind: 'trend_posture', ownerModuleIndex: 5 },
      { kind: 'cadence_band', ownerModuleIndex: 5 },
      { kind: 'emit_mode', ownerModuleIndex: 6 },
    ],
  },
  {
    id: 'engine_hft',
    label: 'High-frequency engine',
    category: 'high_frequency',
    description:
      'High-frequency-oriented paper desk (retail API framing): microstructure research spine, high-cadence feed, swarm scanner, strat-007 execution, paper_hft_swarm_v1 throttles. Live remains fail-closed.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Microstructure research (internal)',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'microstructure_context',
          curiosity: 'exploratory',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'librarian',
        name: 'Microstructure Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Microstructure Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          masterLibrary: false,
          libraryClass: 'specialty_evidence',
        },
        position: { x: 460, y: 0 },
      },
      {
        type: 'live_api',
        name: 'High-cadence Market Feed',
        config: {
          // Paper-first: synthetic high-cadence feed. Bind Alpaca IEX when operator
          // elevates executionBinding (D-174). Keeps swarm cadence without live entitlement.
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 5,
        },
        position: { x: 460, y: 552 },
      },
      {
        type: 'trend',
        name: 'Microstructure Swarm Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'microstructure_swarm',
          maxActiveTrends: 24,
          cadenceMinutes: 5,
        },
        position: { x: 920, y: 276 },
      },
      {
        type: 'trading',
        name: 'Paper HFT Execution',
        config: {
          subtype: 'hft',
          strategyFamilies: ['strat-007'],
          exitTimelineDays: 0,
          cadenceMinutes: 1,
          executionBinding: { routingMode: 'funds_only' },
        },
        position: { x: 1380, y: 276 },
      },
      {
        type: 'holding_fund',
        name: 'Paper HFT Holding Fund',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_hft_swarm_v1',
        },
        position: { x: 920, y: 828 },
      },
      {
        type: 'fund_router',
        name: 'HFT Fund Router',
        config: {
          policyEnvelopeRef: 'paper_hft_swarm_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 1380, y: 828 },
      },
      {
        type: 'analyzer',
        name: 'HFT Execution Monitor',
        config: {
          emitMode: 'verify_loopback',
          streamDescriptor: 'execution_verify_loopback',
        },
        position: { x: 1840, y: 276 },
      },
      {
        type: 'policy',
        name: 'Paper HFT Policy',
        config: {
          policyEnvelopeRef: 'paper_hft_swarm_v1',
          notes:
            'Fail-closed paper HFT policy (retail-API framing). Live unlock requires documented live-gate pass; not colocated HFT.',
        },
        position: { x: 1840, y: 828 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'directive' },
      { fromIndex: 5, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 8, toIndex: 9, linkKind: 'verification' },
      { fromIndex: 5, toIndex: 9, linkKind: 'directive' },
      { fromIndex: 6, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 7, linkKind: 'fund_route' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. liquid large-cap microstructure',
        target: { moduleIndex: 0, configKey: 'topicScope' },
        alsoTargets: [
          { moduleIndex: 1, configKey: 'topicScope' },
          { moduleIndex: 2, configKey: 'topicScope' },
        ],
      },
      {
        key: 'focus',
        label: 'Swarm focus',
        kind: 'text',
        placeholder: 'e.g. top-tier liquidity quote quality',
        target: { moduleIndex: 4, configKey: 'focus' },
      },
      {
        key: 'philosophy',
        label: 'Trading philosophy',
        kind: 'select',
        options: ['spread capture', 'inventory skew defense', 'quote microstructure'],
        target: { moduleIndex: 4, configKey: 'focus' },
      },
    ],
    decisionNodes: EXECUTION_DESK_DECISION_SEEDS(5, 8, ['strat-007']),
  },
  // ── Simulation ENGINEs (D-189) — paper_sim / funds_only by default ─────────
  {
    id: 'sim_gate_strategy_spread',
    label: 'Strategy-spread gate sim',
    category: 'simulation',
    description:
      'Pre/parallel execution GATE: runs multiple strategy families in a testable paper spread to glean optimized settings that influence the parent execution engine. Paper-only (funds_only).',
    available: true,
    modules: [
      {
        type: 'live_api',
        name: 'Gate Market Feed',
        config: {
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 30,
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'trend',
        name: 'Gate Strategy Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'session_intraday',
          maxActiveTrends: 12,
          cadenceMinutes: 15,
        },
        position: { x: 460, y: 0 },
      },
      {
        type: 'trading',
        name: 'Gate Spread Execution',
        config: {
          subtype: 'day',
          // Day-horizon spread: strat-001/002/005. HFT parent should prefer strat-007 via mimicParent.
          strategyFamilies: ['strat-001', 'strat-002', 'strat-005'],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
          executionBinding: { routingMode: 'funds_only' },
        },
        position: { x: 920, y: 0 },
      },
      {
        type: 'holding_fund',
        name: 'Gate Sim Holding',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 460, y: 460 },
      },
      {
        type: 'fund_router',
        name: 'Gate Sim Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 920, y: 460 },
      },
      {
        type: 'analyzer',
        name: 'Gate Score Concat',
        config: {
          emitMode: 'to_desk_stream',
          streamDescriptor: 'gate_optimized_settings',
        },
        position: { x: 1380, y: 0 },
      },
      {
        type: 'policy',
        name: 'Gate Sim Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Paper gate sim — influences parent via gleaned settings; not live.',
        },
        position: { x: 1380, y: 460 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'directive' },
      { fromIndex: 2, toIndex: 5, linkKind: 'verification' },
      { fromIndex: 5, toIndex: 6, linkKind: 'verification' },
      { fromIndex: 2, toIndex: 6, linkKind: 'directive' },
      { fromIndex: 3, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 4, linkKind: 'fund_route' },
    ],
    inputs: [
      {
        key: 'focus',
        label: 'Gate focus',
        kind: 'text',
        placeholder: 'e.g. session liquid large-cap spread',
        target: { moduleIndex: 1, configKey: 'focus' },
      },
    ],
    decisionNodes: SIM_DESK_DECISION_SEEDS(['strat-001', 'strat-002', 'strat-005']),
  },
  {
    id: 'sim_train_policy_replay',
    label: 'Policy-replay training sim',
    category: 'simulation',
    description:
      'Post-execution TRAINING: replays the parent engine policy in paper, runs additional trades, and feeds tag/concept-enriched results back to the parent Engine Data Hub. Paper-only.',
    available: true,
    modules: [
      {
        type: 'live_api',
        name: 'Training Market Feed',
        config: {
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 60,
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'trend',
        name: 'Training Replay Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'session_intraday',
          maxActiveTrends: 8,
          cadenceMinutes: 30,
        },
        position: { x: 460, y: 0 },
      },
      {
        type: 'trading',
        name: 'Training Paper Execution',
        config: {
          subtype: 'day',
          strategyFamilies: ['strat-001'],
          exitTimelineDays: 1,
          cadenceMinutes: 10,
          executionBinding: { routingMode: 'funds_only' },
        },
        position: { x: 920, y: 0 },
      },
      {
        type: 'holding_fund',
        name: 'Training Sim Holding',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 460, y: 460 },
      },
      {
        type: 'fund_router',
        name: 'Training Sim Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 920, y: 460 },
      },
      {
        type: 'analyzer',
        name: 'Training Hub Feedback',
        config: {
          emitMode: 'to_desk_stream',
          streamDescriptor: 'training_hub_feedback',
        },
        position: { x: 1380, y: 0 },
      },
      {
        type: 'policy',
        name: 'Training Sim Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Paper training sim — feeds parent hub; not live.',
        },
        position: { x: 1380, y: 460 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'directive' },
      { fromIndex: 2, toIndex: 5, linkKind: 'verification' },
      { fromIndex: 5, toIndex: 6, linkKind: 'verification' },
      { fromIndex: 2, toIndex: 6, linkKind: 'directive' },
      { fromIndex: 3, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 4, linkKind: 'fund_route' },
    ],
    inputs: [
      {
        key: 'focus',
        label: 'Training focus',
        kind: 'text',
        placeholder: 'e.g. parent policy replay universe',
        target: { moduleIndex: 1, configKey: 'focus' },
      },
    ],
    decisionNodes: SIM_DESK_DECISION_SEEDS(['strat-001']),
  },
  {
    id: 'sim_adhoc_paper_desk',
    label: 'Adhoc paper sim desk',
    category: 'simulation',
    description:
      'Standalone simulation ENGINE in the paper world: own lifecycle, strategy self-learning, and optional later promotion to a real execution ENGINE. Not linked to a parent by default.',
    available: true,
    modules: [
      {
        type: 'live_api',
        name: 'Adhoc Sim Feed',
        config: {
          venue: 'paper_sim',
          instruments: [],
          feedClass: 'synthetic_sim',
          pollSeconds: 60,
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'library',
        name: 'Adhoc Sim Notes Library',
        config: {
          topicScope: 'pending_operator_scope',
          masterLibrary: false,
          libraryClass: 'specialty_evidence',
        },
        position: { x: 0, y: 460 },
      },
      {
        type: 'trend',
        name: 'Adhoc Sim Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'session_intraday',
          maxActiveTrends: 10,
          cadenceMinutes: 20,
        },
        position: { x: 460, y: 0 },
      },
      {
        type: 'trading',
        name: 'Adhoc Paper Execution',
        config: {
          subtype: 'day',
          strategyFamilies: ['strat-001', 'strat-002'],
          exitTimelineDays: 2,
          cadenceMinutes: 10,
          executionBinding: { routingMode: 'funds_only' },
        },
        position: { x: 920, y: 0 },
      },
      {
        type: 'holding_fund',
        name: 'Adhoc Sim Holding',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 460, y: 460 },
      },
      {
        type: 'fund_router',
        name: 'Adhoc Sim Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 920, y: 460 },
      },
      {
        type: 'analyzer',
        name: 'Adhoc Sim Monitor',
        config: {
          emitMode: 'verify_loopback',
          streamDescriptor: 'adhoc_sim_verify',
        },
        position: { x: 1380, y: 0 },
      },
      {
        type: 'policy',
        name: 'Adhoc Sim Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Standalone paper sim desk — promotable later via live-gate ceremony.',
        },
        position: { x: 1380, y: 460 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'directive' },
      { fromIndex: 3, toIndex: 6, linkKind: 'verification' },
      { fromIndex: 6, toIndex: 7, linkKind: 'verification' },
      { fromIndex: 3, toIndex: 7, linkKind: 'directive' },
      { fromIndex: 4, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 5, linkKind: 'fund_route' },
    ],
    inputs: [
      {
        key: 'focus',
        label: 'Sim desk focus',
        kind: 'text',
        placeholder: 'e.g. experimental mean-reversion cohort',
        target: { moduleIndex: 2, configKey: 'focus' },
        alsoTargets: [{ moduleIndex: 1, configKey: 'topicScope' }],
      },
    ],
    decisionNodes: [
      { kind: 'feed_class', ownerModuleIndex: 0 },
      { kind: 'query_policy', ownerModuleIndex: 0 },
      { kind: 'schedule_policy', ownerModuleIndex: 0 },
      { kind: 'trend_posture', ownerModuleIndex: 2 },
      { kind: 'cadence_band', ownerModuleIndex: 2 },
      {
        kind: 'strategy_family',
        ownerModuleIndex: 3,
        optionRefs: ['strat-001', 'strat-002', 'strat-005'],
      },
      { kind: 'branch_role', ownerModuleIndex: 3 },
      { kind: 'recovery_phase', ownerModuleIndex: 3 },
      { kind: 'emit_mode', ownerModuleIndex: 6 },
    ],
  },
];

/** Session envelope id that unlocks engine_crypto when present in session-constraint-catalog. */
export const ALPACA_CRYPTO_SESSION_ENVELOPE_ID = 'sess-crypto-alpaca-24x7';

// Normalize Math fund_route link order on every engine template (D-073).
for (const template of ENGINE_TEMPLATES) {
  template.links = orderTemplateLinks(template.links);
}

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
  return ENGINE_TEMPLATES.map((t) => {
    const resolved = resolveEngineTemplateAvailability(t, sessionEnvelopeIds);
    return { ...resolved, links: orderTemplateLinks(resolved.links) };
  });
}

export function getEngineTemplateById(id: string): EngineTemplate | undefined {
  const template = ENGINE_TEMPLATES.find((item) => item.id === id);
  if (!template) return undefined;
  const links = orderTemplateLinks(template.links);
  const alreadyOrdered =
    links.length === template.links.length && links.every((link, i) => link === template.links[i]);
  return alreadyOrdered ? template : { ...template, links };
}

/** Create-form sections: research, execution, simulation (D-189). */
export type EngineCreateSection = 'research' | 'execution' | 'simulation';

const EXECUTION_CATEGORIES = new Set<EngineTemplate['category']>([
  'day_trading',
  'crypto',
  'prediction',
  'long_term',
  'high_frequency',
]);

/**
 * When an execution ENGINE is added, also seed these research ENGINE templates
 * if not already present (D-042 specialty packs + D-043 UX + D-153 defaults).
 * Packs are use-case-specific to the execution engine they support.
 *
 * D-191 dual path: every execution template also ships inline specialty research
 * (internal desk gather). Child packs here feed the Engine Data Hub; overlapping
 * researchSubtype values between inline modules and packs are intentional.
 */
export const EXECUTION_ENGINE_RESEARCH_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  /** Regime/macro lab + session specialty desk feeder for intraday paper desks. */
  engine_day_trading: ['research_market_regime_lab', 'research_desk_aligned'],
  /** On-chain + crypto market context for 24/7 crypto paper. */
  engine_crypto: ['research_crypto_context'],
  /** Event/probability niche lab before Kalshi desk wiring. */
  engine_prediction: ['research_prediction_niche'],
  /** Filings/fundamentals + event catalysts for multi-month horizon desks. */
  engine_long_term: ['research_filings_fundamentals', 'research_event_catalyst'],
  /** Microstructure lab for high-frequency-oriented paper desks (D-157). */
  engine_hft: ['research_microstructure_lab'],
};

/** Default child sim count when adding an execution ENGINE (D-189). Operator may set 0..N. */
export const DEFAULT_EXECUTION_SIM_COUNT = 2;

export type ExecutionSimDependency = {
  templateId: string;
  placement: 'pre' | 'post';
};

/**
 * Default simulation ENGINE children for each execution template (D-189).
 * pre = gate, post = training. Create-form trims to `simCount` (default 2).
 */
export const EXECUTION_ENGINE_SIM_DEPENDENCIES: Readonly<
  Record<string, readonly ExecutionSimDependency[]>
> = {
  engine_day_trading: [
    { templateId: 'sim_gate_strategy_spread', placement: 'pre' },
    { templateId: 'sim_train_policy_replay', placement: 'post' },
  ],
  engine_crypto: [
    { templateId: 'sim_gate_strategy_spread', placement: 'pre' },
    { templateId: 'sim_train_policy_replay', placement: 'post' },
  ],
  engine_prediction: [
    { templateId: 'sim_gate_strategy_spread', placement: 'pre' },
    { templateId: 'sim_train_policy_replay', placement: 'post' },
  ],
  engine_long_term: [
    { templateId: 'sim_gate_strategy_spread', placement: 'pre' },
    { templateId: 'sim_train_policy_replay', placement: 'post' },
  ],
  engine_hft: [
    { templateId: 'sim_gate_strategy_spread', placement: 'pre' },
    { templateId: 'sim_train_policy_replay', placement: 'post' },
  ],
};

export function engineCreateSection(template: EngineTemplate): EngineCreateSection {
  if (template.category === 'simulation') {
    return 'simulation';
  }
  if (template.category === 'research' || template.category === 'trend_research') {
    return 'research';
  }
  if (EXECUTION_CATEGORIES.has(template.category)) {
    return 'execution';
  }
  return 'research';
}

export function listEngineTemplatesForCreateSection(
  section: EngineCreateSection,
  sessionEnvelopeIds: ReadonlySet<string> = new Set(),
): EngineTemplate[] {
  return listResolvedEngineTemplates(sessionEnvelopeIds).filter(
    (template) => engineCreateSection(template) === section,
  );
}

export function researchDependenciesForExecutionEngine(templateId: string): string[] {
  return [...(EXECUTION_ENGINE_RESEARCH_DEPENDENCIES[templateId] ?? [])];
}

export function simDependenciesForExecutionEngine(
  templateId: string,
  simCount: number = DEFAULT_EXECUTION_SIM_COUNT,
): ExecutionSimDependency[] {
  const all = EXECUTION_ENGINE_SIM_DEPENDENCIES[templateId] ?? [];
  if (simCount <= 0) return [];
  return all.slice(0, simCount).map((dep) => ({ ...dep }));
}

export type EngineSeedRef = {
  templateId: string;
  inputs?: Record<string, string>;
  setup?: Record<string, unknown>;
  canvasOffset?: { x: number; y: number };
  /** D-189: carried on expanded sim seeds for create/API. */
  simulationPlacement?: 'pre' | 'post';
  simulationRole?: 'gate' | 'training' | 'adhoc';
};

/**
 * Expand create/insert engine lists so each execution seed is preceded by its
 * research dependency packs (deduped). Copies parent setup onto auto-deps.
 * D-153: server + UI share this so API fixtures and module-store inserts match create-form.
 */
export function expandEngineSeedsWithResearchDeps<T extends { templateId: string }>(
  seeds: readonly T[],
  options?: {
    /** When true, only add deps that exist in ENGINE_TEMPLATES and are available. */
    availableTemplateIds?: ReadonlySet<string>;
  },
): T[] {
  const available = options?.availableTemplateIds;
  const seen = new Set<string>();
  const out: T[] = [];

  for (const seed of seeds) {
    const deps = researchDependenciesForExecutionEngine(seed.templateId);
    for (const depId of deps) {
      if (seen.has(depId)) continue;
      if (available && !available.has(depId)) continue;
      if (!ENGINE_TEMPLATES.some((t) => t.id === depId)) continue;
      seen.add(depId);
      out.push({ ...seed, templateId: depId, inputs: {}, canvasOffset: undefined } as T);
    }
    if (!seen.has(seed.templateId)) {
      seen.add(seed.templateId);
      out.push(seed);
    }
  }
  return out;
}

/**
 * After research expansion, append default simulation ENGINE children for each
 * execution seed (D-189). Idempotent when sim template ids already present.
 */
export function expandEngineSeedsWithSimDeps(
  seeds: readonly CreateCompanyEngine[],
  options?: {
    availableTemplateIds?: ReadonlySet<string>;
    /** Override default count (2). Use 0 to skip sims. */
    simCount?: number;
  },
): CreateCompanyEngine[] {
  const available = options?.availableTemplateIds;
  const simCount = options?.simCount ?? DEFAULT_EXECUTION_SIM_COUNT;
  const existingSimIds = new Set(
    seeds
      .filter((seed) => {
        const template = ENGINE_TEMPLATES.find((entry) => entry.id === seed.templateId);
        return template ? engineCreateSection(template) === 'simulation' : false;
      })
      .map((seed) => seed.templateId),
  );
  const out: CreateCompanyEngine[] = [...seeds];

  for (const seed of seeds) {
    const template = ENGINE_TEMPLATES.find((entry) => entry.id === seed.templateId);
    if (!template || engineCreateSection(template) !== 'execution') continue;
    for (const dep of simDependenciesForExecutionEngine(seed.templateId, simCount)) {
      if (existingSimIds.has(dep.templateId)) continue;
      if (available && !available.has(dep.templateId)) continue;
      if (!ENGINE_TEMPLATES.some((entry) => entry.id === dep.templateId)) continue;
      const role = dep.placement === 'pre' ? 'gate' : 'training';
      existingSimIds.add(dep.templateId);
      out.push({
        templateId: dep.templateId,
        inputs: {},
        simulationPlacement: dep.placement,
        simulationRole: role,
      });
    }
  }
  return out;
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
    mathPosition: { x: 920, y: 1104 },
    modules: [
      {
        type: 'research',
        name: 'Desk specialty research (internal)',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'specialty_desk',
          curiosity: 'exploratory',
        },
        position: { x: 40, y: 300 },
      },
      {
        type: 'librarian',
        name: 'Session Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 40, y: 580 },
      },
      {
        type: 'library',
        name: 'Session Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'specialty_evidence',
          masterLibrary: false,
        },
        position: { x: 500, y: 300 },
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
        position: { x: 500, y: 852 },
      },
      {
        type: 'trend',
        name: 'Market Trend Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'session_intraday',
          maxActiveTrends: 10,
          cadenceMinutes: 30,
        },
        position: { x: 960, y: 576 },
      },
      {
        type: 'trading',
        name: 'Paper Day-Trade Execution',
        config: {
          subtype: 'day',
          // Product-spec day families: ORB + gap-and-go + VWAP reversion (agents pick at compile).
          strategyFamilies: ['strat-001', 'strat-002', 'strat-005'],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
        },
        position: { x: 1420, y: 576 },
      },
      {
        type: 'holding_fund',
        name: 'Paper Seed Holding Fund',
        config: {
          source: 'company_seed',
          allocationPolicyRef: 'paper_balanced_general_v1',
        },
        position: { x: 960, y: 1128 },
      },
      {
        type: 'fund_router',
        name: 'Day-Trade Fund Router',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          approvalMode: 'manual',
          targetModuleIds: [],
        },
        position: { x: 1420, y: 1128 },
      },
      {
        type: 'analyzer',
        name: 'Transaction Execution Monitor',
        config: {
          emitMode: 'verify_loopback',
          streamDescriptor: 'execution_verify_loopback',
        },
        position: { x: 1880, y: 576 },
      },
      {
        type: 'policy',
        name: 'Paper Trading Policy',
        config: {
          policyEnvelopeRef: 'paper_balanced_general_v1',
          notes: 'Fail-closed paper policy verification.',
        },
        position: { x: 1880, y: 1128 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'directive' },
      { fromIndex: 6, toIndex: 'math', linkKind: 'fund_route' },
      { fromIndex: 'math', toIndex: 7, linkKind: 'fund_route' },
      // fund_router → trading owner Math is provisioned at insert (not stubbed here).
      { fromIndex: 5, toIndex: 8, linkKind: 'verification' },
      { fromIndex: 8, toIndex: 9, linkKind: 'verification' },
      { fromIndex: 5, toIndex: 9, linkKind: 'directive' },
    ],
  },
  trend_research_lab: {
    id: 'trend_research_lab',
    label: 'Trend research lab',
    description:
      'Research and trend modules only — terminal analyzer concat → data_out. No trading desk until you add one.',
    modules: [
      {
        type: 'research',
        name: 'Scoped Market Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'specialty_desk',
          curiosity: 'balanced',
        },
        position: { x: 20, y: 240 },
      },
      {
        type: 'librarian',
        name: 'Trend Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 20, y: 520 },
      },
      {
        type: 'library',
        name: 'Research Evidence Library',
        config: {
          topicScope: 'pending_operator_scope',
          libraryClass: 'topic_runtime',
          masterLibrary: false,
        },
        position: { x: 280, y: 240 },
      },
      {
        type: 'trend',
        name: 'Scoped Trend Scanner',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'research_only',
          maxActiveTrends: 10,
          cadenceMinutes: 120,
        },
        position: { x: 540, y: 240 },
      },
      {
        type: 'analyzer',
        name: 'Trend Research Concat',
        config: {
          emitMode: 'to_desk_stream',
          streamDescriptor: 'trend_research_concat',
        },
        position: { x: 800, y: 240 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 0, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
    ],
  },
};
