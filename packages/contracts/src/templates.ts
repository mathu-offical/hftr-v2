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
  category:
    | 'day_trading'
    | 'trend_research'
    | 'crypto'
    | 'prediction'
    | 'high_frequency'
    | 'long_term'
    | 'research';
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
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_market_news',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 0 },
      },
      {
        type: 'librarian',
        name: 'Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 0, y: 280 },
      },
      {
        type: 'library',
        name: 'Strategy Evidence Library',
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
          strategyFamilies: ['strat-001'],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
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
        name: 'Deterministic Fund Router',
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
        config: {},
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
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
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
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'crypto_onchain_context',
          curiosity: 'balanced',
        },
        position: { x: 40, y: 420 },
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
      // fund_router → trading owner Math is provisioned at insert (not stubbed here).
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
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'prediction_niche',
          curiosity: 'balanced',
        },
        position: { x: 40, y: 420 },
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
      // fund_router → trading owner Math is provisioned at insert (not stubbed here).
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
    id: 'engine_long_term',
    label: 'Long-term engine',
    category: 'long_term',
    description:
      'Full spine for horizon positioning: filings research, specialty evidence, low-cadence trend and execution.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Fundamentals Research',
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
        name: 'Event Catalyst Research',
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
          strategyFamilies: ['strat-003'],
          exitTimelineDays: 180,
          cadenceMinutes: 60,
        },
        position: { x: 1380, y: 276 },
      },
      {
        type: 'holding_fund',
        name: 'Paper Seed Holding Fund',
        config: { source: 'company_seed', allocationPolicyRef: 'paper_balanced_general_v1' },
        position: { x: 920, y: 828 },
      },
      {
        type: 'fund_router',
        name: 'Deterministic Fund Router',
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
        config: {},
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
      { fromIndex: 0, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 3, linkKind: 'data_feed' },
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
      },
      {
        key: 'focus',
        label: 'Trend focus',
        kind: 'text',
        placeholder: 'e.g. multi-week sector leadership',
        target: { moduleIndex: 5, configKey: 'focus' },
      },
    ],
  },
  {
    id: 'research_web_fabric',
    label: 'Web research fabric',
    category: 'research',
    description: 'Pure-data research ENGINE: web discover + librarian → topic libraries.',
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
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 1, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Research scope',
        kind: 'text',
        placeholder: 'e.g. semiconductor supply chain',
        target: { moduleIndex: 0, configKey: 'topicScope' },
      },
    ],
  },
  {
    id: 'research_filings_fundamentals',
    label: 'Filings & fundamentals',
    category: 'research',
    description: 'Pure-data ENGINE focused on SEC/EDGAR and fundamentals curation.',
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
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Filings scope',
        kind: 'text',
        placeholder: 'e.g. S&P 500 10-K themes',
        target: { moduleIndex: 0, configKey: 'topicScope' },
      },
    ],
  },
  {
    id: 'research_seed_mechanisms',
    label: 'Seeded mechanisms keeper',
    category: 'research',
    description: 'Protect and refresh compile-time seeded trading-mechanism libraries.',
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
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
    ],
    inputs: [],
  },
  {
    id: 'research_event_catalyst',
    label: 'Event catalyst research',
    category: 'research',
    description: 'Pure-data event/macro archetype curation for later desk promotion.',
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
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Event scope',
        kind: 'text',
        placeholder: 'e.g. earnings season, CPI prints',
        target: { moduleIndex: 0, configKey: 'topicScope' },
      },
    ],
  },
  {
    id: 'research_market_regime_lab',
    label: 'Market regime lab',
    category: 'research',
    description: 'Market-trend research ENGINE with live feed and research-only trend scanner.',
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
        name: 'Desk Specialty Research',
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
        name: 'Paper Market Feed',
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
    ],
    links: [
      { fromIndex: 0, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 3, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 5, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Regime scope',
        kind: 'text',
        placeholder: 'e.g. risk-on/risk-off equities',
        target: { moduleIndex: 0, configKey: 'topicScope' },
      },
      {
        key: 'focus',
        label: 'Scanner focus',
        kind: 'text',
        placeholder: 'e.g. breadth and leadership',
        target: { moduleIndex: 5, configKey: 'focus' },
      },
    ],
  },
  {
    id: 'research_crypto_context',
    label: 'Crypto context research',
    category: 'research',
    description: 'Crypto narrative + cross-cap trend lab (market_trend mode).',
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
        name: 'Alpaca Crypto Feed',
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
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'focus',
        label: 'Crypto focus',
        kind: 'text',
        placeholder: 'e.g. BTC/ETH regime + alts',
        target: { moduleIndex: 4, configKey: 'focus' },
      },
    ],
  },
  {
    id: 'research_prediction_niche',
    label: 'Prediction niche research',
    category: 'research',
    description: 'Event/probability research lab before prediction desk wiring.',
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
        name: 'Event Catalyst Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'event_catalyst',
          curiosity: 'balanced',
        },
        position: { x: 0, y: 280 },
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
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Event scope',
        kind: 'text',
        placeholder: 'e.g. elections, macro prints',
        target: { moduleIndex: 0, configKey: 'topicScope' },
      },
    ],
  },
  {
    id: 'research_desk_aligned',
    label: 'Desk-aligned research',
    category: 'research',
    description: 'Specialty-desk curator + evidence library + research-only trend feeder.',
    available: true,
    modules: [
      {
        type: 'research',
        name: 'Desk Specialty Research',
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
        name: 'Paper Market Feed',
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
        name: 'Desk Feeder Trend',
        config: {
          focus: 'pending_operator_scope',
          trendPosture: 'research_only',
          maxActiveTrends: 10,
          cadenceMinutes: 45,
        },
        position: { x: 920, y: 276 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Desk scope',
        kind: 'text',
        placeholder: 'e.g. day-trade large-cap tech',
        target: { moduleIndex: 0, configKey: 'topicScope' },
      },
    ],
  },
  {
    id: 'research_multi_curator',
    label: 'Multi-curator fabric',
    category: 'research',
    description:
      'Broad pure-data fabric with web, filings, and market-news curators plus librarian.',
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
    ],
    links: [
      { fromIndex: 0, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 2, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 4, linkKind: 'data_feed' },
      { fromIndex: 3, toIndex: 5, linkKind: 'data_feed' },
      { fromIndex: 4, toIndex: 3, linkKind: 'data_feed' },
    ],
    inputs: [
      {
        key: 'topicScope',
        label: 'Fabric scope',
        kind: 'text',
        placeholder: 'e.g. company-wide market knowledge',
        target: { moduleIndex: 0, configKey: 'topicScope' },
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
  const alreadyOrdered = links.length === template.links.length && links.every((link, i) => link === template.links[i]);
  return alreadyOrdered ? template : { ...template, links };
}

/** Create-form sections: research engines vs execution (full-spine) engines. */
export type EngineCreateSection = 'research' | 'execution';

const EXECUTION_CATEGORIES = new Set<EngineTemplate['category']>([
  'day_trading',
  'crypto',
  'prediction',
  'long_term',
  'high_frequency',
]);

/**
 * When an execution ENGINE is added at company create, also seed these research
 * ENGINE templates if not already present (D-042 specialty packs + D-043 UX).
 */
export const EXECUTION_ENGINE_RESEARCH_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  engine_day_trading: ['research_market_regime_lab', 'research_desk_aligned'],
  engine_crypto: ['research_crypto_context'],
  engine_prediction: ['research_prediction_niche'],
  engine_long_term: ['research_filings_fundamentals', 'research_desk_aligned'],
  engine_hft: ['research_market_regime_lab'],
};

export function engineCreateSection(template: EngineTemplate): EngineCreateSection {
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
        name: 'Market Regime Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_market_news',
          curiosity: 'balanced',
        },
        position: { x: 40, y: 300 },
      },
      {
        type: 'librarian',
        name: 'Evidence Librarian',
        config: {
          topicScope: 'pending_operator_scope',
          librarianSubtype: 'librarian_relevance',
        },
        position: { x: 40, y: 580 },
      },
      {
        type: 'library',
        name: 'Strategy Evidence Library',
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
          // strat-001 = opening_range_breakout in the seeded strategy catalog.
          strategyFamilies: ['strat-001'],
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
        name: 'Deterministic Fund Router',
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
        config: {},
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
      { fromIndex: 0, toIndex: 2, linkKind: 'data_feed' },
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
    description: 'Research and trend modules only — no trading desk until you add one.',
    modules: [
      {
        type: 'research',
        name: 'Scoped Market Research',
        config: {
          topicScope: 'pending_operator_scope',
          researchSubtype: 'external_web',
          curiosity: 'balanced',
        },
        position: { x: 20, y: 240 },
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
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
    ],
  },
};
