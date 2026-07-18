import type { CompoundSymbolScore, ResolvedSuggestionThresholds } from '@hftr/contracts';
import { passesVerifyCorroboration } from './movers-compound';

const SYMBOL_PATTERN = /^[A-Z.]{1,12}$/;

export type SuggestionVerifyInput = {
  score: CompoundSymbolScore;
  thresholds: ResolvedSuggestionThresholds;
  universe: string[];
  /** Evidence package age for this symbol (epoch ms); omit when unknown. */
  evidenceScannedAtMs?: number | null;
  nowMs: number;
  /** When present, directional regime alignment is required. */
  regimeTrendUp?: number | null;
};

export type SuggestionVerifyGate = {
  gate: 'symbol_universe_fit' | 'evidence_fit' | 'regime_fit' | 'corroboration_floor';
  result: 'pass' | 'fail';
  evidence: string;
};

/**
 * Subset gates for suggestion verify (D-091).
 * Session / broker / market_structure are intentionally omitted.
 */
export function evaluateSuggestionVerifyGates(input: SuggestionVerifyInput): SuggestionVerifyGate[] {
  const gates: SuggestionVerifyGate[] = [];
  const symbol = input.score.symbol.toUpperCase();
  const inUniverse =
    SYMBOL_PATTERN.test(symbol) &&
    (input.universe.length === 0 || input.universe.map((s) => s.toUpperCase()).includes(symbol));

  gates.push({
    gate: 'symbol_universe_fit',
    result: inUniverse ? 'pass' : 'fail',
    evidence: inUniverse ? 'symbol in movers universe' : 'symbol outside movers universe',
  });

  if (input.evidenceScannedAtMs != null && Number.isFinite(input.evidenceScannedAtMs)) {
    const age = input.nowMs - input.evidenceScannedAtMs;
    const fresh = age >= 0 && age <= input.thresholds.freshnessWindowMs;
    gates.push({
      gate: 'evidence_fit',
      result: fresh ? 'pass' : 'fail',
      evidence: fresh ? 'evidence within freshness window' : 'evidence stale vs resolved freshness',
    });
  } else {
    gates.push({
      gate: 'evidence_fit',
      result: 'pass',
      evidence: 'no timed evidence stamp; freshness deferred to gather packages',
    });
  }

  if (input.regimeTrendUp != null && Number.isFinite(input.regimeTrendUp)) {
    const dir = input.score.direction;
    const aligned =
      dir === 'flat' ||
      (dir === 'up' && input.regimeTrendUp >= 0.45) ||
      (dir === 'down' && input.regimeTrendUp <= 0.55);
    gates.push({
      gate: 'regime_fit',
      result: aligned ? 'pass' : 'fail',
      evidence: aligned ? 'regime aligns with direction' : 'regime conflicts with direction',
    });
  } else {
    gates.push({
      gate: 'regime_fit',
      result: 'pass',
      evidence: 'regime numeric unavailable; gate deferred',
    });
  }

  const corrOk = passesVerifyCorroboration(input.score, input.thresholds);
  gates.push({
    gate: 'corroboration_floor',
    result: corrOk ? 'pass' : 'fail',
    evidence: corrOk
      ? `domains ${input.score.corroborationDomains} meet floor ${input.thresholds.corroborationMinDomains}`
      : `domains ${input.score.corroborationDomains} below floor ${input.thresholds.corroborationMinDomains}`,
  });

  return gates;
}

export function suggestionVerifyPasses(gates: SuggestionVerifyGate[]): boolean {
  return gates.every((g) => g.result === 'pass');
}
