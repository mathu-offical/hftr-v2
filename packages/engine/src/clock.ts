/**
 * Clock authority (D-009). The ONLY legal source of "now" in the codebase —
 * a lint rule bans direct Date.now()/new Date() outside this file so replay
 * and simulation can inject deterministic time.
 */

export interface Clock {
  /** Milliseconds since epoch, UTC. */
  nowMs(): number;
  nowIso(): string;
}

export function createSystemClock(): Clock {
  return {
    nowMs: () => Date.now(),
    nowIso: () => new Date().toISOString(),
  };
}

/** Deterministic clock for tests, replay, and simulation runs. */
export function createFixedClock(atMs: number): Clock {
  let current = atMs;
  return {
    nowMs: () => current,
    nowIso: () => new Date(current).toISOString(),
  };
}

/** Advanceable clock for simulations. */
export function createSteppingClock(startMs: number) {
  let current = startMs;
  const clock: Clock = {
    nowMs: () => current,
    nowIso: () => new Date(current).toISOString(),
  };
  return {
    clock,
    advance(byMs: number) {
      current += byMs;
    },
  };
}
