/** Shared display helpers for panel components (client-side only). */

export function dollars(cents: string | number | bigint): string {
  const n = BigInt(cents);
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  return `${sign}$${(abs / 100n).toLocaleString()}.${String(abs % 100n).padStart(2, '0')}`;
}

export function scaled(valueInt: string, scale: number): string {
  if (scale === 0) return valueInt;
  const s = valueInt.replace('-', '').padStart(scale + 1, '0');
  const sign = valueInt.startsWith('-') ? '-' : '';
  return `${sign}${s.slice(0, -scale)}.${s.slice(-scale)}`;
}

export const OUTCOME_COLOR: Record<string, string> = {
  filled: 'var(--color-ok)',
  pass: 'var(--color-ok)',
  up: 'var(--color-ok)',
  blocked: 'var(--color-block)',
  fail: 'var(--color-block)',
  down: 'var(--color-block)',
  rejected: 'var(--color-warn)',
  flat: 'var(--color-ink-dim)',
};

export function toneFor(key: string): string {
  return OUTCOME_COLOR[key] ?? 'var(--color-ink)';
}

/** Canonical six-gate display order for scenario gate strips. */
export const GATE_KEYS = [
  'regime',
  'universe',
  'session',
  'broker',
  'structure',
  'evidence',
] as const;

/** Short display label for an admission gate name (e.g. "regime_filter" → "regime"). */
export function gateLabel(gate: string): string {
  const lower = gate.toLowerCase();
  for (const key of GATE_KEYS) {
    if (lower.includes(key)) return key;
  }
  return lower.replace(/[_-]+/g, ' ').slice(0, 12);
}

/** Tone for a gate result: pass ok, fail block, suppressed dim. */
export function gateTone(result: string): string {
  if (result === 'pass') return 'var(--color-ok)';
  if (result === 'fail') return 'var(--color-block)';
  return 'var(--color-ink-faint)';
}

/** First `max` characters of text with an ellipsis when truncated. */
export function snippet(text: string, max = 140): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/** Text-first provenance chip styling for concept/artifact source classes. */
export function provenanceChip(sourceClass: string): { label: string; color: string } {
  switch (sourceClass) {
    case 'deterministic_placeholder':
      return { label: 'placeholder', color: 'var(--color-warn)' };
    case 'model_generated':
      return { label: 'model', color: 'var(--color-accent)' };
    case 'operator':
      return { label: 'operator', color: 'var(--color-ink-dim)' };
    default:
      return { label: sourceClass.replace(/_/g, ' '), color: 'var(--color-ink-faint)' };
  }
}

/** Tone for a trace-timeline stage status dot. */
export function stageTone(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes('pass') || lower.includes('filled') || lower.includes('admitted')) {
    return 'var(--color-ok)';
  }
  if (lower.includes('block') || lower.includes('fail') || lower.includes('reject')) {
    return 'var(--color-block)';
  }
  return 'var(--color-ink-faint)';
}
