import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PhilosophyBandPosition } from '@hftr/contracts';

/**
 * Catalog-backed bounded-range bands (v1 parity).
 * Values consumed from packages/db seed catalogs — not rewritten here.
 */

export interface NumericBand {
  min: number;
  typical: number;
  max: number;
  unit?: string;
}

const CATALOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../db/src/seed/catalogs');

let cachedBands: ReadonlyMap<string, NumericBand> | null = null;

function isNumericBandEntry(value: unknown): value is NumericBand {
  if (value == null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.min === 'number' &&
    typeof o.typical === 'number' &&
    typeof o.max === 'number' &&
    Number.isFinite(o.min) &&
    Number.isFinite(o.typical) &&
    Number.isFinite(o.max)
  );
}

/** Default nested profile keys for composite catalog bands (v1 parity). */
const NESTED_BAND_PROFILES: Readonly<Record<string, string>> = {
  max_slippage_bps_band: 'liquid_regular',
  fill_timeout_ms_band: 'liquid_intraday',
  reentry_band: 'max_reentry_count',
  limit_offset_bps_band: 'aggressive',
};

function readNestedProfile(
  raw: Record<string, unknown>,
  profileKey: string,
): NumericBand | undefined {
  const nested = raw[profileKey];
  return isNumericBandEntry(nested) ? nested : undefined;
}

/** Load min/typical/max bands from seeded-strategy-catalog.json. */
export function loadBoundedRangeBands(): ReadonlyMap<string, NumericBand> {
  if (cachedBands) return cachedBands;
  const source = JSON.parse(
    readFileSync(join(CATALOG_DIR, 'seeded-strategy-catalog.json'), 'utf8'),
  ) as {
    runtimeControlSurface?: { boundedRangeFamilyDefinitions?: Record<string, unknown> };
  };
  const defs = source.runtimeControlSurface?.boundedRangeFamilyDefinitions ?? {};
  const entries: [string, NumericBand][] = [];
  for (const [bandId, raw] of Object.entries(defs)) {
    if (bandId === 'note') continue;
    if (!isNumericBandEntry(raw)) continue;
    const band: NumericBand = { min: raw.min, typical: raw.typical, max: raw.max };
    if (typeof raw.unit === 'string') band.unit = raw.unit;
    entries.push([bandId, Object.freeze(band)]);
  }
  cachedBands = Object.freeze(new Map(entries)) as ReadonlyMap<string, NumericBand>;
  return cachedBands;
}

export function getBoundedRangeBand(bandId: string, profileKey?: string): NumericBand | undefined {
  const flat = loadBoundedRangeBands().get(bandId);
  if (flat) return flat;

  const source = JSON.parse(
    readFileSync(join(CATALOG_DIR, 'seeded-strategy-catalog.json'), 'utf8'),
  ) as {
    runtimeControlSurface?: { boundedRangeFamilyDefinitions?: Record<string, unknown> };
  };
  const raw = source.runtimeControlSurface?.boundedRangeFamilyDefinitions?.[bandId];
  if (raw == null || typeof raw !== 'object') return undefined;
  const key = profileKey ?? NESTED_BAND_PROFILES[bandId];
  if (!key) return undefined;
  return readNestedProfile(raw as Record<string, unknown>, key);
}

export function clampToBand(b: NumericBand, value: number): number {
  if (!Number.isFinite(value)) return b.typical;
  return Math.min(b.max, Math.max(b.min, value));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(0.999999, n));
}

function roundTo(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Deterministically pick a value inside a band, biased toward `typical`.
 * `u` in [0,1) maps onto [min,max] with triangular weight around typical.
 */
export function pickInBand(b: NumericBand, u: number, dp = 4): number {
  const t = clamp01(u);
  const lowSpan = b.typical - b.min;
  const highSpan = b.max - b.typical;
  const value = t < 0.5 ? b.min + (t / 0.5) * lowSpan : b.typical + ((t - 0.5) / 0.5) * highSpan;
  return roundTo(Math.min(b.max, Math.max(b.min, value)), dp);
}

/** Map a qualitative band position to its seeded numeric anchor. */
export function bandValueAtPosition(b: NumericBand, position: PhilosophyBandPosition): number {
  switch (position) {
    case 'min':
      return b.min;
    case 'typical':
      return b.typical;
    case 'max':
      return b.max;
    default: {
      const _exhaustive: never = position;
      return _exhaustive;
    }
  }
}

/** Reset catalog cache (tests only). */
export function resetBoundedRangeBandCache(): void {
  cachedBands = null;
}
