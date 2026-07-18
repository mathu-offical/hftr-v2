import { SECTOR_FOCUS_PRESETS, type SectorFocusPreset } from './sector-focus';

/**
 * Maps company sector-focus presets → vendored `sector_seeds` catalog keys
 * (`sector-behavior-seed-catalog.json` coarse sectors + optional subsector ids).
 */

export type SectorSeedTarget = {
  /** Coarse key matching `payload.sector` / catalog title (e.g. `technology`). */
  sectorKey: string;
  /** Optional subsector profile name inside that sector package. */
  subsectorKey?: string;
};

/** Preset group → primary sector_seeds sector key. */
const GROUP_TO_SECTOR: Record<SectorFocusPreset['group'], string> = {
  technology: 'technology',
  finance: 'financials',
  healthcare: 'health_care',
  energy: 'energy',
  consumer: 'consumer_discretionary',
  industrial: 'industrials',
  macro: 'real_estate',
  alt: 'crypto_equities_and_proxies',
};

/** Preset id overrides when group mapping is too coarse. */
const PRESET_ID_OVERRIDES: Partial<Record<SectorFocusPreset['id'], SectorSeedTarget>> = {
  semiconductors: { sectorKey: 'technology', subsectorKey: 'semiconductors' },
  ai_software: { sectorKey: 'technology', subsectorKey: 'software_infrastructure' },
  cloud_saas: { sectorKey: 'technology', subsectorKey: 'software_infrastructure' },
  cybersecurity: { sectorKey: 'technology', subsectorKey: 'cybersecurity' },
  fintech_payments: { sectorKey: 'financials' },
  banks_financials: { sectorKey: 'financials' },
  insurance: { sectorKey: 'financials' },
  biotech_life_science: { sectorKey: 'health_care' },
  pharma: { sectorKey: 'health_care' },
  healthcare_providers: { sectorKey: 'health_care' },
  clean_energy: { sectorKey: 'utilities' },
  oil_gas: { sectorKey: 'energy' },
  commodities_ag: { sectorKey: 'materials' },
  climate_carbon: { sectorKey: 'utilities' },
  consumer_discretionary: { sectorKey: 'consumer_discretionary' },
  consumer_staples: { sectorKey: 'consumer_staples' },
  ecommerce_retail: { sectorKey: 'consumer_discretionary' },
  media_entertainment: { sectorKey: 'communication_services' },
  industrials: { sectorKey: 'industrials' },
  aerospace_defense: { sectorKey: 'industrials' },
  automotive_ev: { sectorKey: 'industrials' },
  transport_logistics: { sectorKey: 'industrials' },
  materials_mining: { sectorKey: 'materials' },
  real_estate_reits: { sectorKey: 'real_estate' },
  telecom: { sectorKey: 'communication_services' },
  macro_rates_fx: { sectorKey: 'financials' },
  emerging_markets: { sectorKey: 'industrials' },
  small_cap_growth: { sectorKey: 'technology' },
  dividend_value: { sectorKey: 'consumer_staples' },
  crypto_digital: { sectorKey: 'crypto_equities_and_proxies' },
  prediction_markets: { sectorKey: 'crypto_equities_and_proxies' },
};

export function resolveSectorSeedTarget(preset: SectorFocusPreset): SectorSeedTarget {
  const override = PRESET_ID_OVERRIDES[preset.id];
  if (override) return override;
  return { sectorKey: GROUP_TO_SECTOR[preset.group] };
}

/** Resolve by persisted company focus label (create wizard stores labels). */
export function resolveSectorSeedTargetFromLabel(label: string): SectorSeedTarget | null {
  const preset = SECTOR_FOCUS_PRESETS.find((p) => p.label === label.trim());
  if (!preset) return null;
  return resolveSectorSeedTarget(preset);
}

/** Unique sector keys (+ optional subsectors) for a company focus list. */
export function collectSectorSeedTargets(focuses: readonly string[]): {
  sectorKeys: string[];
  subsectorKeysBySector: Map<string, Set<string>>;
} {
  const sectorKeys = new Set<string>();
  const subsectorKeysBySector = new Map<string, Set<string>>();

  for (const label of focuses) {
    const target = resolveSectorSeedTargetFromLabel(label);
    if (!target) continue;
    sectorKeys.add(target.sectorKey);
    if (target.subsectorKey) {
      const set = subsectorKeysBySector.get(target.sectorKey) ?? new Set<string>();
      set.add(target.subsectorKey);
      subsectorKeysBySector.set(target.sectorKey, set);
    }
  }

  return { sectorKeys: [...sectorKeys], subsectorKeysBySector };
}

/** Concept tag for sector subfolder grouping under Baseline → Sector knowledge. */
export function sectorFolderTag(sectorKey: string): string {
  return `sector_${sectorKey}`;
}

export function isSectorFolderTag(tag: string): boolean {
  return tag.startsWith('sector_') && !tag.startsWith('sector_seeds');
}
