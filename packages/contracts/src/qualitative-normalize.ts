/**
 * Shared qualitative text prep for model-facing compare paths (D-008 / LLM substitute).
 * Same numeric + datetime regexes as leak-lint / llm substituteInput — digits and clocks
 * collapse to qualitative placeholders before token overlap so galaxy layout and librarian
 * relevance score the same normalized corpus the model is allowed to see.
 */

export const QUALITATIVE_NUMERIC_PLACEHOLDER = 'qualitative_numeric_descriptor';
export const QUALITATIVE_TEMPORAL_PLACEHOLDER = 'qualitative_temporal_descriptor';

/** Same patterns as contracts leak-lint + @hftr/llm substituteInput. */
export const LEAK_NUMERIC_PATTERN = /(?:\$\s?\d|\d+\.\d+|\b\d{2,}\b|\d\s?%)/g;
export const LEAK_DATETIME_PATTERN =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm|AM|PM)?\b|\b(19|20)\d{2}\b/g;

/**
 * Replace raw numerics/datetimes with qualitative placeholders for similarity compare.
 * ValueRef handles (`nv_*`) are left intact.
 */
export function qualitativeNormalizeForCompare(text: string): string {
  if (!text) return '';
  if (text.startsWith('nv_') && !/\s/.test(text)) return text;
  let out = text.replace(LEAK_DATETIME_PATTERN, ` ${QUALITATIVE_TEMPORAL_PLACEHOLDER} `);
  out = out.replace(LEAK_NUMERIC_PATTERN, ` ${QUALITATIVE_NUMERIC_PLACEHOLDER} `);
  return out.replace(/\s+/g, ' ').trim();
}
