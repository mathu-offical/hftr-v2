import type { SessionPhase } from '@hftr/contracts';

/**
 * Deterministic session legality helpers (v1 parity).
 * US-equities clock approximation; extended/overnight require explicit re-verify.
 */

export type TradingSessionClass = 'regular' | 'extended' | 'overnight';

export type ParsedVerifiedPatternRef = {
  treeId: string;
  version: number;
  sessionClass: TradingSessionClass;
};

/** Max wall-clock age of the tree version before analysis is treated as stale. */
export const TREE_VERSION_AGE_MS = 30 * 60 * 1000;

const OPEN_PHASES: ReadonlySet<SessionPhase> = new Set(['open', 'midday', 'power_hour']);

/** Regular-session open phases (matches gates.ts and limits/compute.ts). */
export function isRegularSessionOpen(phase: SessionPhase): boolean {
  return OPEN_PHASES.has(phase);
}

/**
 * Whether trading admission is allowed for the session phase and company mode.
 * Paper mode waives closed-session blocks; live mode requires regular-session open.
 */
export function isSessionTradingAllowed(phase: SessionPhase, mode: 'paper' | 'live'): boolean {
  if (isRegularSessionOpen(phase)) return true;
  return mode === 'paper';
}

/** Format stored on verified fills for session-aware reuse checks. */
export function formatVerifiedPatternRef(
  treeId: string,
  treeVersion: number,
  sessionClass: TradingSessionClass = 'regular',
): string {
  return `${treeId}:v${treeVersion}:${sessionClass}`;
}

export function parseVerifiedPatternRef(ref: string): ParsedVerifiedPatternRef | null {
  const match = /^([^:]+):v(\d+)(?::(regular|extended|overnight))?$/.exec(ref.trim());
  if (!match) return null;
  const version = Number(match[2]);
  if (!Number.isFinite(version) || version < 1) return null;
  return {
    treeId: match[1]!,
    version,
    sessionClass: (match[3] as TradingSessionClass | undefined) ?? 'regular',
  };
}

/**
 * Classify the active US-equities session from UTC wall clock (NYSE approximation).
 * Pre/after-hours share the extended bucket; overnight is 20:00–04:00 ET.
 */
export function classifyTradingSession(nowMs: number = Date.now()): TradingSessionClass {
  const et = new Date(nowMs).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  const timePart = et.split(', ')[1] ?? '09:30:00';
  const [hh, mm] = timePart.split(':').map(Number);
  const minutes = (hh ?? 0) * 60 + (mm ?? 0);
  if (minutes >= 20 * 60 || minutes < 4 * 60) return 'overnight';
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return 'regular';
  return 'extended';
}

export function isPatternReuseSessionLegal(
  patternRef: string,
  currentSession: TradingSessionClass,
): boolean {
  const parsed = parseVerifiedPatternRef(patternRef);
  if (!parsed) return false;
  if (parsed.sessionClass === currentSession) return true;
  if (currentSession !== 'regular') return false;
  return parsed.sessionClass === 'regular';
}

export function isPatternVersionCurrent(patternRef: string, currentTreeVersion: number): boolean {
  const parsed = parseVerifiedPatternRef(patternRef);
  if (!parsed) return false;
  return parsed.version === currentTreeVersion;
}

export function resolvePatternReuseResumeCondition(
  patternRef: string | null,
  currentTreeVersion: number,
  currentSession: TradingSessionClass,
): 'reuse_last_verified_pattern' | 'tier_retune' {
  if (!patternRef) return 'tier_retune';
  if (!isPatternVersionCurrent(patternRef, currentTreeVersion)) return 'tier_retune';
  if (!isPatternReuseSessionLegal(patternRef, currentSession)) return 'tier_retune';
  return 'reuse_last_verified_pattern';
}
