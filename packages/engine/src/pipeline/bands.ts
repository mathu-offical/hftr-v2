import type { PhilosophyBandPosition } from '@hftr/contracts';
import seededStrategyCatalog from '../../../db/src/seed/catalogs/seeded-strategy-catalog.json';

/**
 * Catalog-backed bounded-range bands (v1 parity).
 * Values consumed from packages/db seed catalogs — bundled via static import
 * (no filesystem reads; Vercel serverless safe).
 */

export interface NumericBand {
  min: number;
  typical: number;
  max: number;
  unit?: string;
}

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

function strategyCatalogSource(): {
  runtimeControlSurface?: { boundedRangeFamilyDefinitions?: Record<string, unknown> };
} {
  return seededStrategyCatalog as {
    runtimeControlSurface?: { boundedRangeFamilyDefinitions?: Record<string, unknown> };
  };
}

/** Load min/typical/max bands from seeded-strategy-catalog.json. */
export function loadBoundedRangeBands(): ReadonlyMap<string, NumericBand> {
  if (cachedBands) return cachedBands;
  const source = strategyCatalogSource();
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

  const source = strategyCatalogSource();
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

/** Catalog `rr_target_ladder` (composite — not a NumericBand). */
export interface RrTargetLadder {
  tp1R: number;
  tp1ScalePct: number;
  tp2R: number;
  tp2ScalePct: number;
  tp3R: number;
  breakevenOnTp1: boolean;
}

const DEFAULT_RR_LADDER: RrTargetLadder = Object.freeze({
  tp1R: 1.0,
  tp1ScalePct: 50,
  tp2R: 2.0,
  tp2ScalePct: 25,
  tp3R: 3.0,
  breakevenOnTp1: true,
});

function readRrTargetLadder(raw: unknown): RrTargetLadder | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const tp1R = o.tp1_r;
  const tp1ScalePct = o.tp1_scale_pct;
  const tp2R = o.tp2_r;
  const tp2ScalePct = o.tp2_scale_pct;
  const tp3R = o.tp3_r;
  if (
    typeof tp1R !== 'number' ||
    typeof tp1ScalePct !== 'number' ||
    typeof tp2R !== 'number' ||
    typeof tp2ScalePct !== 'number' ||
    typeof tp3R !== 'number'
  ) {
    return undefined;
  }
  return Object.freeze({
    tp1R,
    tp1ScalePct,
    tp2R,
    tp2ScalePct,
    tp3R,
    breakevenOnTp1: o.breakeven_on_tp1 === true,
  });
}

/** Load RR ladder from seeded-strategy-catalog; falls back to catalog defaults. */
export function getRrTargetLadder(): RrTargetLadder {
  const source = strategyCatalogSource();
  const raw = source.runtimeControlSurface?.boundedRangeFamilyDefinitions?.rr_target_ladder;
  return readRrTargetLadder(raw) ?? DEFAULT_RR_LADDER;
}

/**
 * Catalog `time_stop_band.typical_min` (minutes). Composite shape — not NumericBand.
 * Falls back to 60 when absent.
 */
export function getTimeStopTypicalMinutes(): number {
  const source = strategyCatalogSource();
  const raw = source.runtimeControlSurface?.boundedRangeFamilyDefinitions?.time_stop_band;
  if (raw != null && typeof raw === 'object') {
    const typical = (raw as Record<string, unknown>).typical_min;
    if (typeof typical === 'number' && Number.isFinite(typical) && typical > 0) {
      return typical;
    }
  }
  return 60;
}

/** Reset catalog cache (tests only). */
export function resetBoundedRangeBandCache(): void {
  cachedBands = null;
}
