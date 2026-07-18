import { z } from 'zod';

/**
 * Company sector focuses (D-044 / D-106).
 *
 * Create wizard selects **broad groups**; those expand to all preset labels by default.
 * Company drawer **Sectors** tab refines by deselecting specifics (narrow only) and
 * curates a separate **universe exclude** symbol list.
 *
 * Overlaps: presets intentionally share seed targets / `overlapPeers` so co-coverage
 * is a confirmation signal for early picks — not duplicate persisted labels.
 */

export const SECTOR_FOCUS_GROUP_DEFS = [
  { id: 'technology', label: 'Technology' },
  { id: 'finance', label: 'Finance' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'energy', label: 'Energy' },
  { id: 'materials', label: 'Materials' },
  { id: 'consumer', label: 'Consumer' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'communication', label: 'Communication' },
  { id: 'macro', label: 'Macro & style' },
  { id: 'alt', label: 'Alternatives' },
] as const;

export type SectorFocusGroupId = (typeof SECTOR_FOCUS_GROUP_DEFS)[number]['id'];

export const SECTOR_FOCUS_PRESETS = [
  // technology
  {
    id: 'semiconductors',
    label: 'Semiconductors',
    group: 'technology',
    overlapPeers: ['ai_software', 'automotive_ev'],
  },
  {
    id: 'ai_software',
    label: 'AI & enterprise software',
    group: 'technology',
    overlapPeers: ['semiconductors', 'cloud_saas'],
  },
  {
    id: 'cloud_saas',
    label: 'Cloud & SaaS',
    group: 'technology',
    overlapPeers: ['ai_software', 'cybersecurity'],
  },
  {
    id: 'cybersecurity',
    label: 'Cybersecurity',
    group: 'technology',
    overlapPeers: ['cloud_saas', 'fintech_payments'],
  },
  {
    id: 'hardware_devices',
    label: 'Hardware & devices',
    group: 'technology',
    overlapPeers: ['semiconductors', 'telecom'],
  },
  // finance
  {
    id: 'fintech_payments',
    label: 'Fintech & payments',
    group: 'finance',
    overlapPeers: ['banks_financials', 'cybersecurity'],
  },
  {
    id: 'banks_financials',
    label: 'Banks & financials',
    group: 'finance',
    overlapPeers: ['fintech_payments', 'insurance', 'macro_rates_fx'],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    group: 'finance',
    overlapPeers: ['banks_financials'],
  },
  {
    id: 'asset_managers',
    label: 'Asset managers & brokers',
    group: 'finance',
    overlapPeers: ['banks_financials', 'dividend_value'],
  },
  // healthcare
  {
    id: 'biotech_life_science',
    label: 'Biotech & life sciences',
    group: 'healthcare',
    overlapPeers: ['pharma'],
  },
  {
    id: 'pharma',
    label: 'Pharmaceuticals',
    group: 'healthcare',
    overlapPeers: ['biotech_life_science', 'healthcare_providers'],
  },
  {
    id: 'healthcare_providers',
    label: 'Healthcare providers',
    group: 'healthcare',
    overlapPeers: ['pharma', 'healthcare_tech'],
  },
  {
    id: 'healthcare_tech',
    label: 'Health tech & devices',
    group: 'healthcare',
    overlapPeers: ['healthcare_providers', 'biotech_life_science'],
  },
  // energy
  {
    id: 'clean_energy',
    label: 'Clean energy & utilities',
    group: 'energy',
    overlapPeers: ['climate_carbon', 'oil_gas'],
  },
  {
    id: 'oil_gas',
    label: 'Oil & gas producers',
    group: 'energy',
    overlapPeers: ['clean_energy', 'commodities_ag'],
  },
  {
    id: 'climate_carbon',
    label: 'Climate & carbon markets',
    group: 'energy',
    overlapPeers: ['clean_energy'],
  },
  {
    id: 'energy_midstream',
    label: 'Energy midstream & services',
    group: 'energy',
    overlapPeers: ['oil_gas', 'commodities_ag'],
  },
  // materials
  {
    id: 'commodities_ag',
    label: 'Commodities & agriculture',
    group: 'materials',
    overlapPeers: ['oil_gas', 'materials_mining'],
  },
  {
    id: 'materials_mining',
    label: 'Materials & mining',
    group: 'materials',
    overlapPeers: ['commodities_ag', 'industrials'],
  },
  {
    id: 'specialty_chemicals',
    label: 'Specialty chemicals',
    group: 'materials',
    overlapPeers: ['materials_mining', 'industrials'],
  },
  // consumer
  {
    id: 'consumer_discretionary',
    label: 'Consumer discretionary',
    group: 'consumer',
    overlapPeers: ['ecommerce_retail', 'media_entertainment'],
  },
  {
    id: 'consumer_staples',
    label: 'Consumer staples',
    group: 'consumer',
    overlapPeers: ['dividend_value', 'commodities_ag'],
  },
  {
    id: 'ecommerce_retail',
    label: 'E-commerce & retail',
    group: 'consumer',
    overlapPeers: ['consumer_discretionary', 'transport_logistics'],
  },
  {
    id: 'travel_leisure',
    label: 'Travel & leisure',
    group: 'consumer',
    overlapPeers: ['consumer_discretionary', 'transport_logistics'],
  },
  // industrial
  {
    id: 'industrials',
    label: 'Industrials & manufacturing',
    group: 'industrial',
    overlapPeers: ['materials_mining', 'aerospace_defense'],
  },
  {
    id: 'aerospace_defense',
    label: 'Aerospace & defense',
    group: 'industrial',
    overlapPeers: ['industrials', 'semiconductors'],
  },
  {
    id: 'automotive_ev',
    label: 'Automotive & EV',
    group: 'industrial',
    overlapPeers: ['semiconductors', 'clean_energy'],
  },
  {
    id: 'transport_logistics',
    label: 'Transportation & logistics',
    group: 'industrial',
    overlapPeers: ['ecommerce_retail', 'industrials'],
  },
  {
    id: 'construction_infra',
    label: 'Construction & infrastructure',
    group: 'industrial',
    overlapPeers: ['industrials', 'materials_mining'],
  },
  // communication
  {
    id: 'media_entertainment',
    label: 'Media & entertainment',
    group: 'communication',
    overlapPeers: ['consumer_discretionary', 'telecom'],
  },
  {
    id: 'telecom',
    label: 'Telecom & connectivity',
    group: 'communication',
    overlapPeers: ['hardware_devices', 'media_entertainment'],
  },
  {
    id: 'internet_platforms',
    label: 'Internet platforms',
    group: 'communication',
    overlapPeers: ['media_entertainment', 'ai_software'],
  },
  // macro
  {
    id: 'real_estate_reits',
    label: 'Real estate & REITs',
    group: 'macro',
    overlapPeers: ['dividend_value', 'banks_financials'],
  },
  {
    id: 'macro_rates_fx',
    label: 'Macro · rates & FX',
    group: 'macro',
    overlapPeers: ['banks_financials', 'emerging_markets'],
  },
  {
    id: 'emerging_markets',
    label: 'Emerging markets equities',
    group: 'macro',
    overlapPeers: ['macro_rates_fx', 'commodities_ag'],
  },
  {
    id: 'small_cap_growth',
    label: 'Small-cap growth',
    group: 'macro',
    overlapPeers: ['ai_software', 'biotech_life_science'],
  },
  {
    id: 'dividend_value',
    label: 'Dividend / value large-cap',
    group: 'macro',
    overlapPeers: ['consumer_staples', 'banks_financials', 'real_estate_reits'],
  },
  // alt
  {
    id: 'crypto_digital',
    label: 'Crypto & digital assets',
    group: 'alt',
    overlapPeers: ['prediction_markets', 'fintech_payments'],
  },
  {
    id: 'prediction_markets',
    label: 'Prediction markets',
    group: 'alt',
    overlapPeers: ['crypto_digital', 'macro_rates_fx'],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  group: SectorFocusGroupId;
  overlapPeers: readonly string[];
}>;

export type SectorFocusPreset = (typeof SECTOR_FOCUS_PRESETS)[number];
export type SectorFocusId = SectorFocusPreset['id'];
/** @deprecated Use SectorFocusGroupId */
export type SectorFocusGroup = SectorFocusGroupId;

export const SECTOR_FOCUS_LABELS = SECTOR_FOCUS_PRESETS.map((preset) => preset.label);

const SECTOR_FOCUS_LABEL_SET = new Set<string>(SECTOR_FOCUS_LABELS);

/** Max active specific labels = full catalog (group expand may include all). */
export const COMPANY_SECTOR_FOCUS_MAX = SECTOR_FOCUS_PRESETS.length;

/** Max selected broad groups at create / drawer = all defined groups. */
export const COMPANY_SECTOR_GROUP_MAX = SECTOR_FOCUS_GROUP_DEFS.length;

export const SectorFocusLabel = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => SECTOR_FOCUS_LABEL_SET.has(value), {
    message: 'unknown sector focus',
  });

/** Ordered unique company sector focuses (refined actives; ⊆ expanded groups). */
export const CompanySectorFocuses = z
  .array(SectorFocusLabel)
  .max(COMPANY_SECTOR_FOCUS_MAX)
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

/**
 * Operator-curated symbol carve-outs (D-106). Separate from sector focuses —
 * further shapes the investable / research lens after group+specific selection.
 */
export const UniverseExcludeSymbol = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(1)
      .max(12)
      .regex(/^[A-Z][A-Z0-9.\-]*$/, { message: 'invalid symbol' }),
  );

export const COMPANY_UNIVERSE_EXCLUDE_MAX = 200;

export const CompanyUniverseExcludes = z
  .array(UniverseExcludeSymbol)
  .max(COMPANY_UNIVERSE_EXCLUDE_MAX)
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

export type CompanyUniverseExcludes = z.infer<typeof CompanyUniverseExcludes>;

export function sectorFocusDraftString(focuses: readonly string[]): string {
  return focuses
    .map((value) => value.trim())
    .filter(Boolean)
    .join(', ');
}

export function isSectorFocusLabel(value: string): boolean {
  return SECTOR_FOCUS_LABEL_SET.has(value.trim());
}

export function sectorFocusPresetByLabel(label: string): SectorFocusPreset | undefined {
  return SECTOR_FOCUS_PRESETS.find((preset) => preset.label === label.trim());
}

export function sectorFocusPresetById(id: string): SectorFocusPreset | undefined {
  return SECTOR_FOCUS_PRESETS.find((preset) => preset.id === id);
}

export function groupLabel(groupId: SectorFocusGroupId): string {
  return SECTOR_FOCUS_GROUP_DEFS.find((g) => g.id === groupId)?.label ?? groupId;
}

export function presetsForGroup(groupId: SectorFocusGroupId): SectorFocusPreset[] {
  return SECTOR_FOCUS_PRESETS.filter((preset) => preset.group === groupId);
}

/** Expand selected groups → all preset labels (create default). */
export function expandSectorGroupsToFocuses(
  groupIds: readonly SectorFocusGroupId[],
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const groupId of groupIds) {
    for (const preset of presetsForGroup(groupId)) {
      if (seen.has(preset.label)) continue;
      seen.add(preset.label);
      labels.push(preset.label);
    }
  }
  return labels;
}

/** Groups implied by an active focus label list (any specific still selected). */
export function groupsFromSectorFocuses(
  focuses: readonly string[],
): SectorFocusGroupId[] {
  const groups = new Set<SectorFocusGroupId>();
  for (const label of focuses) {
    const preset = sectorFocusPresetByLabel(label);
    if (preset) groups.add(preset.group);
  }
  return SECTOR_FOCUS_GROUP_DEFS.map((g) => g.id).filter((id) => groups.has(id));
}

/** Active focuses partitioned by group (only groups with ≥1 active). */
export function sectorFocusesByGroup(
  focuses: readonly string[],
): Map<SectorFocusGroupId, string[]> {
  const map = new Map<SectorFocusGroupId, string[]>();
  for (const label of focuses) {
    const preset = sectorFocusPresetByLabel(label);
    if (!preset) continue;
    const list = map.get(preset.group) ?? [];
    list.push(label);
    map.set(preset.group, list);
  }
  return map;
}

/**
 * Add a group: union all of its presets into the active set (refine-down later).
 */
export function addSectorGroup(
  currentFocuses: readonly string[],
  groupId: SectorFocusGroupId,
): string[] {
  const next = new Set<string>(currentFocuses);
  for (const preset of presetsForGroup(groupId)) {
    next.add(preset.label);
  }
  return SECTOR_FOCUS_PRESETS.map((p) => p.label).filter((label) => next.has(label));
}

/** Remove every specific belonging to a group. */
export function removeSectorGroup(
  currentFocuses: readonly string[],
  groupId: SectorFocusGroupId,
): string[] {
  const drop = new Set<string>(presetsForGroup(groupId).map((p) => p.label));
  return currentFocuses.filter((label) => !drop.has(label));
}

/** Toggle one specific within an already-selected group (cannot add outside groups). */
export function toggleSectorFocusInGroups(
  currentFocuses: readonly string[],
  label: string,
  selectedGroups: readonly SectorFocusGroupId[],
): string[] {
  const preset = sectorFocusPresetByLabel(label);
  if (!preset || !selectedGroups.includes(preset.group)) {
    return [...currentFocuses];
  }
  if (currentFocuses.includes(label)) {
    return currentFocuses.filter((item) => item !== label);
  }
  const next = [...currentFocuses, label];
  const seen = new Set<string>();
  return next.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export function overlapPeerLabels(label: string): string[] {
  const preset = sectorFocusPresetByLabel(label);
  if (!preset) return [];
  const labels: string[] = [];
  for (const peerId of preset.overlapPeers) {
    const peer = sectorFocusPresetById(peerId);
    if (peer) labels.push(peer.label);
  }
  return labels;
}

export function parseUniverseExcludeDraft(text: string): string[] {
  const tokens = text
    .split(/[\s,;]+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  const parsed = CompanyUniverseExcludes.safeParse(tokens);
  return parsed.success ? parsed.data : [];
}
