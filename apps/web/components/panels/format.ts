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
