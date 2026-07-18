import { SECTOR_FOCUS_PRESETS } from '@hftr/contracts';

const PRESET_BY_ID = new Map(SECTOR_FOCUS_PRESETS.map((preset) => [preset.id, preset]));
const PRESET_BY_LABEL = new Map(
  SECTOR_FOCUS_PRESETS.map((preset) => [preset.label.toLowerCase(), preset]),
);

/**
 * Map a sector id or label to deterministic provider query phrases.
 * Falls back to the raw sector string when no preset matches.
 */
export function mapSectorToQueryPhrases(sector: string): string[] {
  const trimmed = sector.trim();
  if (!trimmed) return [];

  const byId = PRESET_BY_ID.get(trimmed as (typeof SECTOR_FOCUS_PRESETS)[number]['id']);
  if (byId) {
    return uniquePhrases([byId.label, byId.id.replace(/_/g, ' ')]);
  }

  const byLabel = PRESET_BY_LABEL.get(trimmed.toLowerCase());
  if (byLabel) {
    return uniquePhrases([byLabel.label, byLabel.id.replace(/_/g, ' ')]);
  }

  return [trimmed];
}

function uniquePhrases(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const phrase = value.trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  return out;
}
