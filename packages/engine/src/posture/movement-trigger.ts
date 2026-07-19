/**
 * Diversified movement trigger for auto Analyze (D-183).
 * Model-free — bands and counts only; never raw marks or LLM judgment.
 */

import type { QualitativeBand } from '@hftr/contracts';
import { bandRank } from '../libraries/suggestion-thresholds';

export type MovementSymbolSnap = {
  symbol: string;
  leadershipBand: QualitativeBand;
  volumeBand: QualitativeBand;
  newsLinkBand: QualitativeBand;
  macroLinkBand: QualitativeBand;
  libraryLinkBand: QualitativeBand;
  trendLinkBand: QualitativeBand;
  corroborationBand: QualitativeBand;
  linkCoverageBand: QualitativeBand;
  direction: 'up' | 'down' | 'flat';
  relStrengthAbsBps: number;
};

export type MovementSignalSnapshot = {
  asOfIso: string;
  symbols: MovementSymbolSnap[];
};

export type MovementTriggerResult = {
  shouldTrigger: boolean;
  /** Distinct signal families that fired (diversification gate). */
  familiesFired: string[];
  reasons: string[];
  /** 0–100 qualitative intensity (not a financial number for LLM). */
  intensity: number;
};

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;
/** Require ≥ this many independent families before auto-analyze. */
const MIN_FAMILIES = 3;

function bandUp(prev: QualitativeBand | undefined, next: QualitativeBand): boolean {
  if (!prev) return bandRank(next) >= bandRank('medium');
  return bandRank(next) > bandRank(prev);
}

function indexBySymbol(snap: MovementSignalSnapshot | null): Map<string, MovementSymbolSnap> {
  const map = new Map<string, MovementSymbolSnap>();
  if (!snap) return map;
  for (const row of snap.symbols) {
    map.set(row.symbol.toUpperCase(), row);
  }
  return map;
}

/**
 * Evaluate whether diversified baseline signals justify an Analyze pass.
 * Families: leadership_shift, volume_expansion, link_coverage, multi_lane_news_macro,
 * trend_alignment, breadth_nonflat, corroboration_jump.
 */
export function evaluateMovementTrigger(opts: {
  previous: MovementSignalSnapshot | null;
  current: MovementSignalSnapshot;
  nowMs: number;
  lastTriggeredMs?: number | null;
  cooldownMs?: number;
}): MovementTriggerResult {
  const cooldown = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  if (
    opts.lastTriggeredMs != null &&
    opts.nowMs - opts.lastTriggeredMs < cooldown
  ) {
    return {
      shouldTrigger: false,
      familiesFired: [],
      reasons: ['cooldown_active'],
      intensity: 0,
    };
  }

  const prev = indexBySymbol(opts.previous);
  const cur = opts.current.symbols;
  const families = new Set<string>();
  const reasons: string[] = [];

  let leadershipUpgrades = 0;
  let volumeExpansions = 0;
  let linkCoverageJumps = 0;
  let newsMacroPairs = 0;
  let trendAligned = 0;
  let corroborationJumps = 0;
  let nonFlat = 0;

  for (const row of cur) {
    const p = prev.get(row.symbol.toUpperCase());
    if (row.direction !== 'flat') nonFlat += 1;

    if (bandUp(p?.leadershipBand, row.leadershipBand) && bandRank(row.leadershipBand) >= 1) {
      leadershipUpgrades += 1;
    }
    if (bandUp(p?.volumeBand, row.volumeBand) && bandRank(row.volumeBand) >= 1) {
      volumeExpansions += 1;
    }
    if (bandUp(p?.linkCoverageBand, row.linkCoverageBand)) {
      linkCoverageJumps += 1;
    }
    if (
      bandRank(row.newsLinkBand) >= 1 &&
      bandRank(row.macroLinkBand) >= 1 &&
      bandRank(row.leadershipBand) >= 1
    ) {
      newsMacroPairs += 1;
    }
    if (
      bandRank(row.trendLinkBand) >= 1 &&
      row.direction !== 'flat' &&
      bandRank(row.leadershipBand) >= 1
    ) {
      trendAligned += 1;
    }
    if (bandUp(p?.corroborationBand, row.corroborationBand) && bandRank(row.corroborationBand) >= 1) {
      corroborationJumps += 1;
    }
  }

  if (leadershipUpgrades >= 2) {
    families.add('leadership_shift');
    reasons.push(`leadership_upgrades:${leadershipUpgrades}`);
  }
  if (volumeExpansions >= 2) {
    families.add('volume_expansion');
    reasons.push(`volume_expansions:${volumeExpansions}`);
  }
  if (linkCoverageJumps >= 2) {
    families.add('link_coverage');
    reasons.push(`link_coverage_jumps:${linkCoverageJumps}`);
  }
  if (newsMacroPairs >= 2) {
    families.add('multi_lane_news_macro');
    reasons.push(`news_macro_pairs:${newsMacroPairs}`);
  }
  if (trendAligned >= 2) {
    families.add('trend_alignment');
    reasons.push(`trend_aligned:${trendAligned}`);
  }
  if (corroborationJumps >= 2) {
    families.add('corroboration_jump');
    reasons.push(`corroboration_jumps:${corroborationJumps}`);
  }
  // Breadth: many non-flat names with at least medium corroboration.
  const breadth = cur.filter(
    (r) => r.direction !== 'flat' && bandRank(r.corroborationBand) >= 1,
  ).length;
  if (breadth >= 4 || (nonFlat >= 5 && cur.length >= 6)) {
    families.add('breadth_nonflat');
    reasons.push(`breadth:${breadth}/nonflat:${nonFlat}`);
  }

  const familiesFired = [...families].sort();
  const intensity = Math.min(100, familiesFired.length * 18 + leadershipUpgrades * 4 + breadth * 2);
  const shouldTrigger = familiesFired.length >= MIN_FAMILIES;

  return { shouldTrigger, familiesFired, reasons, intensity };
}
