// RegimeSnapshot artifact (M1 seed_synthetic). See agent-docs/research/regime-and-market-state-spec.md

import { seededRng } from "../rng";
import { loadRegimeRouterThresholds, type RegimeRouterThresholds } from "./bands";

export type RegimeClassification = "momentum" | "mean_reversion" | "risk_off" | "neutral";

export interface RegimeDrivers {
  hurstExponent: number;
  adx14: number;
  hurstRegime: "trend" | "revert" | "ambiguous";
  adxRegime: "trend" | "range" | "ambiguous";
  disagreement: boolean;
  realizedVolShock?: boolean;
}

export interface RegimeSnapshot {
  snapshotId: string;
  workspaceId: string;
  asOf: string;
  classification: RegimeClassification;
  drivers: RegimeDrivers;
  symbolScope: {
    indexProxies: string[];
    sectorLeaders: string[];
    breadthSummary: { advancers_pct: number; sector_dispersion: number; correlation_health: number };
    dominantTrendIds: string[];
    consensusClassification: RegimeClassification;
  };
  familyBias: string[];
  thresholdPackageRef: string;
  sourceMode: "seed_synthetic" | "feed_backed";
  regimeTags: string[];
}

const REGIME_FAMILIES: Record<RegimeClassification, string[]> = {
  momentum: [
    "opening_range_breakout",
    "gap_and_go",
    "pullback_continuation",
    "lead_lag_propagation",
    "volatility_compression_breakout",
    "systematic_momentum_burst",
  ],
  mean_reversion: ["vwap_reversion", "liquidity_sweep_reversal", "pairs_stat_arb"],
  risk_off: [],
  neutral: [],
};

const REGIME_TAGS: Record<RegimeClassification, string[]> = {
  momentum: ["regime_momentum", "hurst_trend", "adx_trend"],
  mean_reversion: ["regime_mean_reversion", "hurst_revert", "adx_range"],
  risk_off: ["regime_risk_off", "vol_shock"],
  neutral: ["regime_neutral", "router_disagreement"],
};

export function preferredFamiliesForClassification(classification: RegimeClassification): string[] {
  return REGIME_FAMILIES[classification];
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function deterministicIso(seed: string): string {
  const rng = seededRng(`regime-asof:${seed}`);
  const ms = 1_704_000_000_000 + Math.floor(rng() * 86_400_000);
  return new Date(ms).toISOString();
}

function deriveDrivers(seed: string, t: RegimeRouterThresholds, realizedVolShock: boolean): RegimeDrivers {
  const rng = seededRng(`regime:${seed}`);
  const hurstExponent = round(0.35 + rng() * 0.4, 3);
  const adx14 = round(12 + rng() * 26, 2);
  const hurstRegime =
    hurstExponent > t.hurstTrend ? "trend" : hurstExponent < t.hurstRevert ? "revert" : "ambiguous";
  const adxRegime = adx14 > t.adxTrend ? "trend" : adx14 <= t.adxRange ? "range" : "ambiguous";
  const disagreement =
    (hurstRegime === "trend" && adxRegime === "range") ||
    (hurstRegime === "revert" && adxRegime === "trend");
  return { hurstExponent, adx14, hurstRegime, adxRegime, disagreement, realizedVolShock };
}

export function classifyFromDrivers(
  drivers: RegimeDrivers,
  t: RegimeRouterThresholds,
  opts: { macroBlackout?: boolean } = {}
): RegimeClassification {
  if (drivers.realizedVolShock || opts.macroBlackout) return "risk_off";
  if (drivers.disagreement) return "neutral";
  if (drivers.hurstRegime === "trend" && drivers.adxRegime === "trend") return "momentum";
  if (drivers.hurstRegime === "revert" && drivers.adxRegime === "range") return "mean_reversion";
  if (drivers.hurstRegime === "ambiguous" && drivers.adxRegime === "ambiguous") return "neutral";
  return "neutral";
}

export function buildRegimeSnapshot(args: {
  workspaceId: string;
  seed: string;
  sectorRefs: string[];
  macroBlackout?: boolean;
  trendIds?: string[];
}): RegimeSnapshot {
  const t = loadRegimeRouterThresholds();
  const rng = seededRng(`regime-vol:${args.seed}`);
  const realizedVolShock = rng() < 0.08;
  const drivers = deriveDrivers(args.seed, t, realizedVolShock);
  const classification = classifyFromDrivers(drivers, t, { macroBlackout: args.macroBlackout });
  const snapshotId = `regime-${args.seed.slice(0, 24)}`;

  return {
    snapshotId,
    workspaceId: args.workspaceId,
    asOf: deterministicIso(args.seed),
    classification,
    drivers,
    symbolScope: {
      indexProxies: ["SPY", "QQQ", "IWM"],
      sectorLeaders: args.sectorRefs.slice(0, 3),
      breadthSummary: {
        advancers_pct: round(0.35 + rng() * 0.3, 3),
        sector_dispersion: round(0.1 + rng() * 0.25, 3),
        correlation_health: round(t.correlationHealthTypical, 3),
      },
      dominantTrendIds: args.trendIds ?? [],
      consensusClassification: classification,
    },
    familyBias: REGIME_FAMILIES[classification],
    thresholdPackageRef: "trend-lead-pattern-library.json#regimeRouterThresholds",
    sourceMode: "seed_synthetic",
    regimeTags: REGIME_TAGS[classification],
  };
}

export interface LegacyRegimeClassification {
  regime: Exclude<RegimeClassification, "neutral"> | "neutral";
  hurst: number;
  adx: number;
  directionBias: "long" | "short" | "neutral";
  preferredFamilies: string[];
  snapshot: RegimeSnapshot;
}

/** Router output used by trend/lead materialization (includes full snapshot). */
export function regimeSnapshotEvidenceRef(snapshot: RegimeSnapshot): string {
  return `regime_snapshot:${snapshot.snapshotId}`;
}

export function classifyRegimeWithSnapshot(
  seed: string,
  workspaceId: string,
  sectorRefs: string[],
  opts: { macroBlackout?: boolean; trendIds?: string[] } = {}
): LegacyRegimeClassification {
  const snapshot = buildRegimeSnapshot({
    workspaceId,
    seed,
    sectorRefs,
    macroBlackout: opts.macroBlackout,
    trendIds: opts.trendIds,
  });
  const rng = seededRng(`regime-dir:${seed}`);
  const classification = snapshot.classification;
  const directionBias: LegacyRegimeClassification["directionBias"] =
    classification === "momentum"
      ? "long"
      : classification === "risk_off"
        ? "neutral"
        : classification === "mean_reversion"
          ? rng() < 0.5
            ? "long"
            : "short"
          : "neutral";

  return {
    regime: classification,
    hurst: snapshot.drivers.hurstExponent,
    adx: snapshot.drivers.adx14,
    directionBias,
    preferredFamilies: snapshot.familyBias,
    snapshot,
  };
}
