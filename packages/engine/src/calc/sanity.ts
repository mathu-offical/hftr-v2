import { SanityEnvelope } from '@hftr/contracts';
import type { Clock } from '../clock';
import type { StoredRow } from './store';
import { isExpired } from './store';

/**
 * Sanity gauntlet (number-handling.md §5): checked when a value is recorded,
 * used as calc input, and again at the dispatch boundary. A failed check is a
 * BLOCK, never a warning.
 */

export type SanityCheckResult =
  { ok: true } | { ok: false; code: 'stale_input' | 'sanity_block'; detail: string };

export function checkInput(row: StoredRow, clock: Clock): SanityCheckResult {
  if (isExpired(row, clock)) {
    return { ok: false, code: 'stale_input', detail: `${row.ref} expired (ttl ${row.ttlMs}ms)` };
  }
  return checkEnvelope(row.valueInt, row.sanityEnvelope as SanityEnvelope, row.ref);
}

export function checkEnvelope(
  valueInt: bigint,
  envelope: SanityEnvelope | Record<string, never>,
  ref: string,
): SanityCheckResult {
  const env = envelope as Partial<SanityEnvelope>;
  if (env.mustBePositive && valueInt <= 0n) {
    return { ok: false, code: 'sanity_block', detail: `${ref}: must be positive` };
  }
  if (env.minInt != null && valueInt < BigInt(env.minInt)) {
    return { ok: false, code: 'sanity_block', detail: `${ref}: below min ${env.minInt}` };
  }
  if (env.maxInt != null && valueInt > BigInt(env.maxInt)) {
    return { ok: false, code: 'sanity_block', detail: `${ref}: above max ${env.maxInt}` };
  }
  return { ok: true };
}
