import { z } from 'zod';

/**
 * Predefined company sector focuses (create wizard + engine topic pre-seed).
 * Labels are the persisted topic/sector strings (comma-joined on drafts).
 */
export const SECTOR_FOCUS_PRESETS = [
  { id: 'semiconductors', label: 'Semiconductors', group: 'technology' },
  { id: 'ai_software', label: 'AI & enterprise software', group: 'technology' },
  { id: 'cloud_saas', label: 'Cloud & SaaS', group: 'technology' },
  { id: 'cybersecurity', label: 'Cybersecurity', group: 'technology' },
  { id: 'fintech_payments', label: 'Fintech & payments', group: 'finance' },
  { id: 'banks_financials', label: 'Banks & financials', group: 'finance' },
  { id: 'insurance', label: 'Insurance', group: 'finance' },
  { id: 'biotech_life_science', label: 'Biotech & life sciences', group: 'healthcare' },
  { id: 'pharma', label: 'Pharmaceuticals', group: 'healthcare' },
  { id: 'healthcare_providers', label: 'Healthcare providers', group: 'healthcare' },
  { id: 'clean_energy', label: 'Clean energy & utilities', group: 'energy' },
  { id: 'oil_gas', label: 'Oil & gas producers', group: 'energy' },
  { id: 'commodities_ag', label: 'Commodities & agriculture', group: 'energy' },
  { id: 'climate_carbon', label: 'Climate & carbon markets', group: 'energy' },
  { id: 'consumer_discretionary', label: 'Consumer discretionary', group: 'consumer' },
  { id: 'consumer_staples', label: 'Consumer staples', group: 'consumer' },
  { id: 'ecommerce_retail', label: 'E-commerce & retail', group: 'consumer' },
  { id: 'media_entertainment', label: 'Media & entertainment', group: 'consumer' },
  { id: 'industrials', label: 'Industrials & manufacturing', group: 'industrial' },
  { id: 'aerospace_defense', label: 'Aerospace & defense', group: 'industrial' },
  { id: 'automotive_ev', label: 'Automotive & EV', group: 'industrial' },
  { id: 'transport_logistics', label: 'Transportation & logistics', group: 'industrial' },
  { id: 'materials_mining', label: 'Materials & mining', group: 'industrial' },
  { id: 'real_estate_reits', label: 'Real estate & REITs', group: 'macro' },
  { id: 'telecom', label: 'Telecom & connectivity', group: 'macro' },
  { id: 'macro_rates_fx', label: 'Macro · rates & FX', group: 'macro' },
  { id: 'emerging_markets', label: 'Emerging markets equities', group: 'macro' },
  { id: 'small_cap_growth', label: 'Small-cap growth', group: 'macro' },
  { id: 'dividend_value', label: 'Dividend / value large-cap', group: 'macro' },
  { id: 'crypto_digital', label: 'Crypto & digital assets', group: 'alt' },
  { id: 'prediction_markets', label: 'Prediction markets', group: 'alt' },
] as const;

export type SectorFocusPreset = (typeof SECTOR_FOCUS_PRESETS)[number];
export type SectorFocusId = SectorFocusPreset['id'];
export type SectorFocusGroup = SectorFocusPreset['group'];

export const SECTOR_FOCUS_LABELS = SECTOR_FOCUS_PRESETS.map((preset) => preset.label);

const SECTOR_FOCUS_LABEL_SET = new Set<string>(SECTOR_FOCUS_LABELS);

export const SectorFocusLabel = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => SECTOR_FOCUS_LABEL_SET.has(value), {
    message: 'unknown sector focus',
  });

/** Ordered unique company sector focuses (max 12). */
export const CompanySectorFocuses = z
  .array(SectorFocusLabel)
  .max(12)
  .default([])
  .transform((values) => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const value of values) {
      if (seen.has(value)) continue;
      seen.add(value);
      unique.push(value);
    }
    return unique;
  });

export type CompanySectorFocuses = z.infer<typeof CompanySectorFocuses>;

export function sectorFocusDraftString(focuses: readonly string[]): string {
  return focuses
    .map((value) => value.trim())
    .filter(Boolean)
    .join(', ');
}

export function isSectorFocusLabel(value: string): boolean {
  return SECTOR_FOCUS_LABEL_SET.has(value.trim());
}
