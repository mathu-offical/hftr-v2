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
  fromIndex: number; // index into modules[]
  toIndex: number;
  linkKind: 'data_feed' | 'directive' | 'verification' | 'fund_route';
}

export interface CompanyTemplate {
  id: CompanyTemplateId;
  label: string;
  description: string;
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
      'Feed → trend scanner → day desk → analyzer verification loop. Paper venue, end to end.',
    available: true,
    modules: [
      {
        type: 'live_api',
        name: 'Engine Feed',
        config: {
          venue: 'paper_sim',
          instruments: ['AAPL', 'MSFT', 'NVDA', 'TSLA'],
          feedClass: 'synthetic_sim',
          pollSeconds: 60,
        },
        position: { x: 80, y: 420 },
      },
      {
        type: 'trend',
        name: 'Engine Scanner',
        config: { focus: 'large-cap momentum', maxActiveTrends: 10, cadenceMinutes: 30 },
        position: { x: 360, y: 420 },
      },
      {
        type: 'trading',
        name: 'Engine Day Desk',
        config: {
          subtype: 'day',
          strategyFamilies: ['strat-001'],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
        },
        position: { x: 640, y: 420 },
      },
      {
        type: 'analyzer',
        name: 'Engine Analyzer',
        config: {},
        position: { x: 360, y: 560 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'directive' },
      { fromIndex: 2, toIndex: 3, linkKind: 'verification' },
      { fromIndex: 3, toIndex: 1, linkKind: 'verification' },
    ],
    inputs: [
      {
        key: 'focus',
        label: 'Sector focus',
        kind: 'text',
        placeholder: 'e.g. large-cap tech momentum',
        target: { moduleIndex: 1, configKey: 'focus' },
      },
      {
        // Multiple inputs targeting the same configKey are joined with ' — '.
        key: 'philosophy',
        label: 'Trading philosophy',
        kind: 'select',
        options: ['momentum continuation', 'mean reversion', 'breakout capture'],
        target: { moduleIndex: 1, configKey: 'focus' },
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
        name: 'Engine Research',
        config: { topicScope: 'sector research', curiosity: 'balanced' },
        position: { x: 80, y: 560 },
      },
      {
        type: 'library',
        name: 'Engine Library',
        config: { topicScope: 'sector research' },
        position: { x: 360, y: 700 },
      },
      {
        type: 'trend',
        name: 'Engine Trend Watch',
        config: { focus: 'sector trends', maxActiveTrends: 10, cadenceMinutes: 120 },
        position: { x: 640, y: 560 },
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
    description: '24/7 crypto momentum engine on Coinbase.',
    available: false,
    unavailableReason: 'Requires the Coinbase adapter (broker milestone M5).',
    modules: [],
    links: [],
    inputs: [],
  },
  {
    id: 'engine_prediction',
    label: 'Prediction markets engine',
    category: 'prediction',
    description: 'Event-probability trading on Kalshi/Polymarket.',
    available: false,
    unavailableReason: 'Requires the Kalshi/Polymarket adapters (broker milestone M5).',
    modules: [],
    links: [],
    inputs: [],
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
    description: 'Live data feeding a trend scanner that informs a paper day-trading desk.',
    modules: [
      {
        type: 'live_api',
        name: 'Market Feed',
        config: {
          venue: 'paper_sim',
          instruments: ['AAPL', 'MSFT', 'NVDA', 'TSLA'],
          feedClass: 'synthetic_sim',
          pollSeconds: 60,
        },
        position: { x: 80, y: 240 },
      },
      {
        type: 'trend',
        name: 'Trend Scanner',
        config: { focus: 'large-cap tech momentum', maxActiveTrends: 10, cadenceMinutes: 30 },
        position: { x: 360, y: 240 },
      },
      {
        type: 'trading',
        name: 'Day Desk',
        config: {
          subtype: 'day',
          // strat-001 = opening_range_breakout in the seeded strategy catalog.
          strategyFamilies: ['strat-001'],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
        },
        position: { x: 640, y: 240 },
      },
    ],
    links: [
      { fromIndex: 0, toIndex: 1, linkKind: 'data_feed' },
      { fromIndex: 1, toIndex: 2, linkKind: 'data_feed' },
    ],
  },
  trend_research_lab: {
    id: 'trend_research_lab',
    label: 'Trend research lab',
    description: 'Research and trend modules only — no trading desk until you add one.',
    modules: [
      {
        type: 'research',
        name: 'Sector Research',
        config: { topicScope: 'semiconductors and AI infrastructure', curiosity: 'balanced' },
        position: { x: 80, y: 240 },
      },
      {
        type: 'trend',
        name: 'Trend Scanner',
        config: { focus: 'semiconductor supply chain', maxActiveTrends: 10, cadenceMinutes: 120 },
        position: { x: 360, y: 240 },
      },
    ],
    links: [{ fromIndex: 0, toIndex: 1, linkKind: 'data_feed' }],
  },
};
