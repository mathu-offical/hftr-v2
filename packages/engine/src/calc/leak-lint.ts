/**
 * Numeric/temporal leak linter (number-handling.md §7).
 * Scans model output for raw numerics or datetime strings outside whitelisted
 * paths. Any hit rejects the entire output (failure code `numeric_leak`).
 */

export interface LeakLintResult {
  ok: boolean;
  leaks: Array<{ path: string; value: string; reason: 'numeric' | 'datetime' }>;
}

// Digits that look value-bearing: standalone numbers with 2+ digits, decimals,
// currency/percent adjacency. Single digits inside words (e.g. "tier2") pass.
const NUMERIC_PATTERN = /(?:\$\s?\d|\d+\.\d+|\b\d{2,}\b|\d\s?%)/;
const DATETIME_PATTERN =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm|AM|PM)?\b|\b(19|20)\d{2}\b/;

export function leakLint(output: unknown, whitelistPaths: readonly string[]): LeakLintResult {
  const leaks: LeakLintResult['leaks'] = [];
  walk(output, '$', new Set(whitelistPaths), leaks);
  return { ok: leaks.length === 0, leaks };
}

function isWhitelisted(path: string, whitelist: Set<string>): boolean {
  for (const w of whitelist) {
    if (path === w || path.startsWith(`${w}.`) || path.startsWith(`${w}[`)) return true;
  }
  return false;
}

function walk(
  node: unknown,
  path: string,
  whitelist: Set<string>,
  leaks: LeakLintResult['leaks'],
): void {
  if (isWhitelisted(path, whitelist)) return;

  if (typeof node === 'number') {
    leaks.push({ path, value: String(node), reason: 'numeric' });
    return;
  }
  if (typeof node === 'string') {
    // ValueRef handles are the legal way to mention a value.
    if (node.startsWith('nv_')) return;
    if (DATETIME_PATTERN.test(node)) {
      leaks.push({ path, value: truncate(node), reason: 'datetime' });
    } else if (NUMERIC_PATTERN.test(node)) {
      leaks.push({ path, value: truncate(node), reason: 'numeric' });
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}[${i}]`, whitelist, leaks));
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      walk(value, `${path}.${key}`, whitelist, leaks);
    }
  }
}

function truncate(s: string): string {
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}
