/**
 * Fixed-point arithmetic over bigint (value + decimal scale).
 * All money/quantity math routes through here — never floats.
 */

export interface Fixed {
  valueInt: bigint;
  scale: number;
}

const POW10: bigint[] = Array.from({ length: 19 }, (_, i) => 10n ** BigInt(i));

export function pow10(scale: number): bigint {
  const p = POW10[scale];
  if (p === undefined) throw new RangeError(`scale out of range: ${scale}`);
  return p;
}

/** Rescale, truncating toward zero when reducing precision. */
export function rescale(f: Fixed, toScale: number): Fixed {
  if (f.scale === toScale) return f;
  if (toScale > f.scale) {
    return { valueInt: f.valueInt * pow10(toScale - f.scale), scale: toScale };
  }
  return { valueInt: f.valueInt / pow10(f.scale - toScale), scale: toScale };
}

export function add(a: Fixed, b: Fixed): Fixed {
  const scale = Math.max(a.scale, b.scale);
  return { valueInt: rescale(a, scale).valueInt + rescale(b, scale).valueInt, scale };
}

export function sub(a: Fixed, b: Fixed): Fixed {
  const scale = Math.max(a.scale, b.scale);
  return { valueInt: rescale(a, scale).valueInt - rescale(b, scale).valueInt, scale };
}

/** Product keeps the max input scale (truncating). */
export function mul(a: Fixed, b: Fixed): Fixed {
  const scale = Math.max(a.scale, b.scale);
  const raw = a.valueInt * b.valueInt; // scale = a.scale + b.scale
  return rescale({ valueInt: raw, scale: a.scale + b.scale }, scale);
}

/** Division at explicit output scale, truncating toward zero. */
export function div(a: Fixed, b: Fixed, outScale: number): Fixed {
  if (b.valueInt === 0n) throw new RangeError('division by zero');
  const numerator = a.valueInt * pow10(outScale + b.scale);
  const denominator = b.valueInt * pow10(a.scale);
  return { valueInt: numerator / denominator, scale: outScale };
}

export function cmp(a: Fixed, b: Fixed): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale);
  const av = rescale(a, scale).valueInt;
  const bv = rescale(b, scale).valueInt;
  return av < bv ? -1 : av > bv ? 1 : 0;
}

export function min(a: Fixed, b: Fixed): Fixed {
  return cmp(a, b) <= 0 ? a : b;
}

export function max(a: Fixed, b: Fixed): Fixed {
  return cmp(a, b) >= 0 ? a : b;
}

export function abs(a: Fixed): Fixed {
  return a.valueInt < 0n ? { valueInt: -a.valueInt, scale: a.scale } : a;
}

export function neg(a: Fixed): Fixed {
  return { valueInt: -a.valueInt, scale: a.scale };
}

export function clamp(v: Fixed, lo: Fixed, hi: Fixed): Fixed {
  return max(lo, min(v, hi));
}

/** Display only — never feed back into calculations. */
export function toDisplayString(f: Fixed): string {
  const negative = f.valueInt < 0n;
  const absVal = negative ? -f.valueInt : f.valueInt;
  const s = absVal.toString().padStart(f.scale + 1, '0');
  const whole = s.slice(0, s.length - f.scale) || '0';
  const frac = f.scale > 0 ? `.${s.slice(s.length - f.scale)}` : '';
  return `${negative ? '-' : ''}${whole}${frac}`;
}
