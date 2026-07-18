/**
 * Bigint-safe USD formatting for materialized cents projections (company cards, headers).
 * Display only — authoritative values remain integer cents in storage and APIs.
 */

function formatIntegerWithCommas(value: bigint): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  const parts: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    parts.unshift(digits.slice(start, i));
  }
  return `${negative ? '-' : ''}${parts.join(',')}`;
}

/** Format integer cents as a USD string like `$10,245.30`, or null when input is null. */
export function formatUsdFromCents(cents: bigint | string | null): string | null {
  if (cents === null) return null;
  const value = typeof cents === 'bigint' ? cents : BigInt(cents);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const dollars = abs / 100n;
  const remainder = abs % 100n;
  const dollarsFormatted = formatIntegerWithCommas(dollars);
  const centsPart = remainder.toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${dollarsFormatted}.${centsPart}`;
}
