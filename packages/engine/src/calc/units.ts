/**
 * Minimal unit algebra for calculator operations (number-handling.md §4).
 * Units are opaque strings with combination rules; incompatible operations
 * fail with `unit_error` instead of silently producing nonsense.
 */

export class UnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitError';
  }
}

/** add/sub/min/max/clamp require identical units. */
export function requireSameUnit(op: string, units: string[]): string {
  const first = units[0];
  if (first === undefined) throw new UnitError(`${op}: no operands`);
  for (const u of units) {
    if (u !== first) throw new UnitError(`${op}: mixed units ${units.join(', ')}`);
  }
  return first;
}

/**
 * mul: dimensionless ("ratio"/"pct_fraction") preserves the other unit;
 * anything else produces a composite unit "a*b".
 */
export function mulUnit(a: string, b: string): string {
  if (isDimensionless(a)) return b;
  if (isDimensionless(b)) return a;
  return `${a}*${b}`;
}

/** div: same units cancel to ratio; dividing by dimensionless preserves. */
export function divUnit(a: string, b: string): string {
  if (a === b) return 'ratio';
  if (isDimensionless(b)) return a;
  return `${a}/${b}`;
}

export function isDimensionless(unit: string): boolean {
  return unit === 'ratio' || unit === 'pct_fraction' || unit === 'count';
}
