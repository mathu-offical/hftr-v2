import type { ResearchTopicDetail } from '@hftr/contracts';

/** Title → entity id maps (keys normalized to lowercase trimmed). */
export interface WikilinkResolutionContext {
  conceptsByTitle: Map<string, string>;
  topicsByTitle: Map<string, string>;
  conceptTitlesById: Map<string, string>;
  topicTitlesById: Map<string, string>;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const TYPED_CONCEPT_RE = /^concept:([0-9a-f-]{36})$/i;
const TYPED_TOPIC_RE = /^topic:([0-9a-f-]{36})$/i;

function normTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function buildWikilinkContextFromTopic(
  topic: ResearchTopicDetail,
): WikilinkResolutionContext {
  const conceptsByTitle = new Map<string, string>();
  const conceptTitlesById = new Map<string, string>();
  for (const m of topic.memberships) {
    if (!m.title) continue;
    conceptsByTitle.set(normTitle(m.title), m.conceptId);
    conceptTitlesById.set(m.conceptId, m.title);
  }
  const topicsByTitle = new Map<string, string>();
  const topicTitlesById = new Map<string, string>();
  topicsByTitle.set(normTitle(topic.title), topic.id);
  topicTitlesById.set(topic.id, topic.title);
  return { conceptsByTitle, topicsByTitle, conceptTitlesById, topicTitlesById };
}

function displayForConcept(id: string, ctx: WikilinkResolutionContext): string {
  return ctx.conceptTitlesById.get(id) ?? 'concept';
}

function displayForTopic(id: string, ctx: WikilinkResolutionContext): string {
  return ctx.topicTitlesById.get(id) ?? 'topic';
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function resolveWikilinkTarget(
  raw: string,
  ctx: WikilinkResolutionContext,
): { kind: 'concept' | 'topic'; id: string; label: string } | null {
  const inner = raw.trim();
  const conceptMatch = TYPED_CONCEPT_RE.exec(inner);
  if (conceptMatch) {
    const id = conceptMatch[1]!;
    return { kind: 'concept', id, label: displayForConcept(id, ctx) };
  }
  const topicMatch = TYPED_TOPIC_RE.exec(inner);
  if (topicMatch) {
    const id = topicMatch[1]!;
    return { kind: 'topic', id, label: displayForTopic(id, ctx) };
  }
  const key = normTitle(inner);
  const conceptId = ctx.conceptsByTitle.get(key);
  if (conceptId) {
    return { kind: 'concept', id: conceptId, label: inner };
  }
  const topicId = ctx.topicsByTitle.get(key);
  if (topicId) {
    return { kind: 'topic', id: topicId, label: inner };
  }
  return null;
}

/**
 * Preprocess `[[Title]]`, `[[concept:uuid]]`, and `[[topic:uuid]]` into markdown
 * links (`#wikilink/concept/<id>` / `#wikilink/topic/<id>`). Unresolved titles
 * become plain emphasis.
 */
export function preprocessSynopsisWikilinks(
  markdown: string,
  ctx: WikilinkResolutionContext,
): string {
  return markdown.replace(WIKILINK_RE, (full, inner: string) => {
    const resolved = resolveWikilinkTarget(inner, ctx);
    if (!resolved) {
      return `*${inner.trim()}*`;
    }
    const label = escapeMarkdownLinkText(resolved.label);
    return `[${label}](#wikilink/${resolved.kind}/${resolved.id})`;
  });
}

export const WIKILINK_HREF_RE = /^#wikilink\/(concept|topic)\/([0-9a-f-]{36})$/i;

export function parseWikilinkHref(href: string): { kind: 'concept' | 'topic'; id: string } | null {
  const m = WIKILINK_HREF_RE.exec(href);
  if (!m) return null;
  return { kind: m[1] as 'concept' | 'topic', id: m[2]! };
}
