import type { SessionPhase } from '@hftr/contracts';

/**
 * Six-gate admission (v1 activation-validation.md). Pure and deterministic:
 * every gate returns explicit evidence text so admission truth is persisted,
 * never reinterpreted downstream. Regime, broker, and market-structure gates
 * are deterministic placeholders until the model tiers land — their evidence
 * strings say so honestly.
 */

export type GateName =
  | 'regime_fit'
  | 'symbol_universe_fit'
  | 'session_fit'
  | 'broker_fit'
  | 'market_structure_fit'
  | 'evidence_fit';

export interface GateEvidence {
  gate: GateName;
  result: 'pass' | 'fail' | 'suppressed';
  evidence: string;
}

export interface GateInput {
  symbol: string;
  direction: 'up' | 'down' | 'flat';
  /** When the supporting trend evidence was scanned (epoch ms). */
  scannedAtMs: number;
  nowMs: number;
  sessionPhase: SessionPhase;
  mode: 'paper' | 'live';
  /** Module-configured instrument universe; null/empty = unrestricted. */
  instruments?: string[] | null;
  freshnessWindowMs?: number;
}

export const DEFAULT_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

const SYMBOL_PATTERN = /^[A-Z.]{1,12}$/;
const OPEN_PHASES: ReadonlySet<SessionPhase> = new Set(['open', 'midday', 'power_hour']);

export function evaluateGates(input: GateInput): GateEvidence[] {
  const gates: GateEvidence[] = [];

  gates.push({
    gate: 'regime_fit',
    result: 'pass',
    evidence:
      'deterministic placeholder basis: regime classifier not yet model-backed; ' +
      'all directional candidates admitted pending regime snapshot integration',
  });

  const symbolOk = SYMBOL_PATTERN.test(input.symbol);
  const universe = input.instruments?.map((s) => s.toUpperCase()) ?? [];
  const inUniverse = universe.length === 0 || universe.includes(input.symbol.toUpperCase());
  gates.push({
    gate: 'symbol_universe_fit',
    result: symbolOk && inUniverse ? 'pass' : 'fail',
    evidence: !symbolOk
      ? `symbol fails universe pattern check (${input.symbol})`
      : inUniverse
        ? universe.length === 0
          ? 'symbol matches universe pattern; module instrument list unrestricted'
          : 'symbol matches universe pattern and module instrument list'
        : 'symbol not in module-configured instrument list',
  });

  const marketOpen = OPEN_PHASES.has(input.sessionPhase);
  gates.push({
    gate: 'session_fit',
    result: marketOpen || input.mode === 'paper' ? 'pass' : 'fail',
    evidence: marketOpen
      ? `session phase ${input.sessionPhase}: market open`
      : input.mode === 'paper'
        ? 'paper_mode_session_waiver'
        : `session phase ${input.sessionPhase}: market not open and mode is live`,
  });

  gates.push({
    gate: 'broker_fit',
    result: 'pass',
    evidence:
      'deterministic placeholder basis: paper_sim venue accepts market/limit day orders; ' +
      'broker overlay snapshot not yet wired',
  });

  gates.push({
    gate: 'market_structure_fit',
    result: 'pass',
    evidence:
      'deterministic placeholder basis: market-structure profile not yet model-backed; ' +
      'synthetic_sim feed treated as continuously quotable',
  });

  const windowMs = input.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS;
  const ageMs = input.nowMs - input.scannedAtMs;
  const fresh = ageMs >= 0 && ageMs <= windowMs;
  gates.push({
    gate: 'evidence_fit',
    result: fresh ? 'pass' : 'fail',
    evidence: fresh
      ? 'trend scan evidence within freshness window'
      : 'trend scan evidence outside freshness window (stale)',
  });

  return gates;
}

export function gatesPass(gates: GateEvidence[]): boolean {
  return gates.every((g) => g.result !== 'fail');
}
