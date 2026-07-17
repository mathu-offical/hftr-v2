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
