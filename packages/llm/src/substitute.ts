import { leakLint } from '@hftr/contracts';

const NUMERIC_PATTERN = /(?:\$\s?\d|\d+\.\d+|\b\d{2,}\b|\d\s?%)/;
const DATETIME_PATTERN =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm|AM|PM)?\b|\b(19|20)\d{2}\b/;

const QUALITATIVE_NUMERIC = 'qualitative_numeric_descriptor';
const QUALITATIVE_TEMPORAL = 'qualitative_temporal_descriptor';

export interface SubstituteResult {
  ok: boolean;
  payload: unknown;
  failure?: 'numeric_leak';
}

/**
 * Replace raw numerics and datetimes in the input tree with qualitative placeholders.
 * ValueRef handles (`nv_*`) are preserved. The substituted tree is leak-linted before
 * any provider call — digits outside the whitelist fail closed.
 */
export function substituteInput(
  input: unknown,
  leakWhitelist: readonly string[] = [],
): SubstituteResult {
  const substituted = walkSubstitute(input);
  const lint = leakLint(substituted, leakWhitelist);
  if (!lint.ok) {
    return { ok: false, payload: substituted, failure: 'numeric_leak' };
  }
  return { ok: true, payload: substituted };
}

function walkSubstitute(node: unknown): unknown {
  if (typeof node === 'number') {
    return QUALITATIVE_NUMERIC;
  }
  if (typeof node === 'string') {
    if (node.startsWith('nv_')) {
      return node;
    }
    if (DATETIME_PATTERN.test(node)) {
      return QUALITATIVE_TEMPORAL;
    }
    if (NUMERIC_PATTERN.test(node)) {
      return QUALITATIVE_NUMERIC;
    }
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => walkSubstitute(item));
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = walkSubstitute(value);
    }
    return out;
  }
  return node;
}
