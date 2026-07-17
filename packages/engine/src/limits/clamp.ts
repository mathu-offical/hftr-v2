/**
 * Clamp operating limits: min(calc, hard envelope, operator cap) on fixed-point integers.
 * Never widens beyond the hard envelope (immutable catalog cap).
 */
export function clampLimit(calcValue: bigint, hardCap: bigint, operatorCap: bigint): bigint {
  let result = calcValue;
  if (result > hardCap) result = hardCap;
  if (result > operatorCap) result = operatorCap;
  if (result < 0n) return 0n;
  return result;
}

/** For loss-remaining style limits where lower calc is tighter. */
export function clampLossRemaining(
  calcRemaining: bigint,
  hardFloor: bigint,
  operatorFloor: bigint,
): bigint {
  let result = calcRemaining;
  if (result < hardFloor) result = hardFloor;
  if (result < operatorFloor) result = operatorFloor;
  if (result < 0n) return 0n;
  return result;
}
