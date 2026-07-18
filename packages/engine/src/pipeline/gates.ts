import type { SessionPhase, Venue } from '@hftr/contracts';

/**
 * Six-gate admission (v1 activation-validation.md). Pure and deterministic:
 * every gate returns explicit evidence text so admission truth is persisted,
 * never reinterpreted downstream. When `regimeTrendUp` is supplied (promote
 * wires seed_synthetic or live_bars), regime_fit is numeric alignment — not a
 * blanket placeholder pass. Broker/market-structure gates use venue + feedClass.
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
  /** Broker overlay when execution context is resolved. */
  venue?: Venue | null;
  brokerConnected?: boolean;
  brokerConnectionMode?: 'paper' | 'live' | null;
  /** Quote feed honesty for market-structure gate. */
  feedClass?: 'synthetic_sim' | 'broker_state' | 'delayed' | null;
  /** When present, tightens regime_fit beyond placeholder admission. */
  regimeTrendUp?: number | null;
  /**
   * Opaque refs from admitted library evidence/concepts (D-039).
   * When provided (including empty), evidence_fit requires freshness AND
   * at least one admitted ref — not freshness alone.
   * When omitted, freshness-only (legacy callers / unit tests).
   */
  admittedArtifactRefs?: string[] | null;
}

export const DEFAULT_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

const SYMBOL_PATTERN = /^[A-Z.]{1,12}$/;
const OPEN_PHASES: ReadonlySet<SessionPhase> = new Set(['open', 'midday', 'power_hour']);

export function evaluateGates(input: GateInput): GateEvidence[] {
  const gates: GateEvidence[] = [];

  if (input.regimeTrendUp != null && Number.isFinite(input.regimeTrendUp)) {
    const aligned =
      input.direction === 'flat' ||
      (input.direction === 'up' && input.regimeTrendUp >= 0.45) ||
      (input.direction === 'down' && input.regimeTrendUp <= 0.55);
    gates.push({
      gate: 'regime_fit',
      result: aligned ? 'pass' : 'fail',
      evidence: aligned
        ? `regime snapshot trendUp=${input.regimeTrendUp.toFixed(2)} aligns with ${input.direction} lead`
        : `regime snapshot trendUp=${input.regimeTrendUp.toFixed(2)} conflicts with ${input.direction} lead`,
    });
  } else {
    gates.push({
      gate: 'regime_fit',
      result: 'pass',
      evidence:
        'deterministic placeholder basis: regime classifier not yet model-backed; ' +
        'all directional candidates admitted pending regime snapshot integration',
    });
  }

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

  const venue = input.venue ?? 'paper_sim';
  const brokerConnected = input.brokerConnected === true;
  const connectionMode = input.brokerConnectionMode ?? null;

  if (input.mode === 'live') {
    if (!brokerConnected) {
      gates.push({
        gate: 'broker_fit',
        result: 'fail',
        evidence: 'live mode requires a connected broker adapter; none resolved',
      });
    } else if (connectionMode === 'live') {
      gates.push({
        gate: 'broker_fit',
        result: 'pass',
        evidence: `live broker connection on venue ${venue} accepts market/limit day orders when session is open`,
      });
    } else {
      gates.push({
        gate: 'broker_fit',
        result: 'fail',
        evidence: `live company mode cannot dispatch through ${connectionMode ?? 'unknown'} broker credentials`,
      });
    }
  } else if (venue === 'paper_sim' && !brokerConnected) {
    gates.push({
      gate: 'broker_fit',
      result: 'pass',
      evidence:
        'paper mode on paper_sim venue: synthetic_sim accepts market/limit day orders without broker overlay',
    });
  } else if (brokerConnected) {
    gates.push({
      gate: 'broker_fit',
      result: 'pass',
      evidence: `paper mode with ${connectionMode ?? 'paper'} broker overlay on venue ${venue}: market/limit day orders admitted when capital and session gates pass`,
    });
  } else {
    gates.push({
      gate: 'broker_fit',
      result: 'pass',
      evidence:
        'paper mode without broker overlay: paper_sim fallback accepts market/limit day orders',
    });
  }

  if (input.feedClass === 'broker_state') {
    gates.push({
      gate: 'market_structure_fit',
      result: 'pass',
      evidence: `broker_state quote feed on ${venue}; continuous quotability assumed for admission stub`,
    });
  } else if (input.feedClass === 'delayed') {
    gates.push({
      gate: 'market_structure_fit',
      result: input.mode === 'live' ? 'fail' : 'pass',
      evidence:
        input.mode === 'live'
          ? 'delayed feed class is not admitted for live dispatch in this stub'
          : 'paper_mode_feed_waiver: delayed feed admitted for research-only promotion',
    });
  } else if (input.feedClass === 'synthetic_sim' || venue === 'paper_sim') {
    gates.push({
      gate: 'market_structure_fit',
      result: 'pass',
      evidence:
        'synthetic_sim feed treated as continuously quotable for paper_sim admission (honest simulator gap)',
    });
  } else {
    gates.push({
      gate: 'market_structure_fit',
      result: 'pass',
      evidence:
        'deterministic placeholder basis: market-structure profile not yet model-backed; ' +
        'venue feed class unknown — admitted pending structure snapshot integration',
    });
  }

  const windowMs = input.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS;
  const ageMs = input.nowMs - input.scannedAtMs;
  const fresh = ageMs >= 0 && ageMs <= windowMs;
  const admittedRefs = input.admittedArtifactRefs;
  const consultAdmitted = admittedRefs != null;
  const hasAdmitted = consultAdmitted && admittedRefs.length > 0;

  let evidenceFitPass = fresh;
  let evidenceText = fresh
    ? 'trend scan evidence within freshness window'
    : 'trend scan evidence outside freshness window (stale)';

  if (consultAdmitted) {
    evidenceFitPass = fresh && hasAdmitted;
    if (!fresh) {
      evidenceText = 'trend scan evidence outside freshness window (stale)';
    } else if (!hasAdmitted) {
      evidenceText =
        'no admitted library evidence refs (accepted/auto_admitted) for this promote path';
    } else {
      evidenceText = `trend scan fresh; ${admittedRefs.length} admitted library evidence ref(s)`;
    }
  }

  gates.push({
    gate: 'evidence_fit',
    result: evidenceFitPass ? 'pass' : 'fail',
    evidence: evidenceText,
  });

  return gates;
}

export function gatesPass(gates: GateEvidence[]): boolean {
  return gates.every((g) => g.result !== 'fail');
}
