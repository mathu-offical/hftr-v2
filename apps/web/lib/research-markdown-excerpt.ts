/**
 * Pure helpers for research markdown display (no React).
 */

/** Strip a single leading ATX H1 block (and following blank lines). */
export function stripLeadingMarkdownH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\n]+\n+(?:\s*\n)*/, '');
}

/** Prefer Overview / first paragraph; skip tables, headings, and chip-only lines. */
export function excerptResearchMarkdownBody(markdown: string, maxChars = 280): string {
  const withoutTitle = stripLeadingMarkdownH1(markdown).trim();
  if (!withoutTitle) return '';

  const lines = withoutTitle.split('\n');
  const prose: string[] = [];
  let inTable = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (prose.length > 0) break;
      continue;
    }
    if (/^\|/.test(trimmed) || /^\|?[\s-:|]+$/.test(trimmed)) {
      inTable = true;
      continue;
    }
    if (inTable) {
      inTable = false;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      if (/^##\s+Overview\b/i.test(trimmed)) continue;
      if (prose.length > 0) break;
      continue;
    }
    if (/^[-*+]\s+\[\[sys:/.test(trimmed)) continue;
    if (/^>\s*/.test(trimmed) && prose.length === 0) {
      prose.push(trimmed.replace(/^>\s*/, ''));
      continue;
    }
    prose.push(trimmed.replace(/^[-*+]\s+/, ''));
    if (prose.join(' ').length >= maxChars) break;
  }

  const joined = prose.join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) {
    const fallback = withoutTitle
      .replace(/\|[^\n]*\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return fallback.length > maxChars ? `${fallback.slice(0, maxChars - 1)}…` : fallback;
  }
  return joined.length > maxChars ? `${joined.slice(0, maxChars - 1)}…` : joined;
}
