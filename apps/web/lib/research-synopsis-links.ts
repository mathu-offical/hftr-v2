const TOPIC_TYPED = /\[\[topic:([0-9a-f-]{36})\]\]/gi;
const WIKI = /\[\[([^\]|:]+)\]\]/g;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SynopsisWikilinkParse {
  linkedTopicIds: string[];
  linkedTopicTitles: string[];
}

/** Extract topic UUIDs and plain wikilink titles from hybrid article synopsis markdown. */
export function parseSynopsisWikilinks(synopsisMd: string): SynopsisWikilinkParse {
  const linkedTopicIds: string[] = [];
  const linkedTopicTitles: string[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  TOPIC_TYPED.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOPIC_TYPED.exec(synopsisMd)) !== null) {
    const id = match[1];
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    linkedTopicIds.push(id);
  }

  WIKI.lastIndex = 0;
  while ((match = WIKI.exec(synopsisMd)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    if (UUID_RE.test(raw)) {
      if (!seenIds.has(raw)) {
        seenIds.add(raw);
        linkedTopicIds.push(raw);
      }
      continue;
    }
    const normalized = raw.toLowerCase();
    if (!seenTitles.has(normalized)) {
      seenTitles.add(normalized);
      linkedTopicTitles.push(normalized);
    }
  }

  return { linkedTopicIds, linkedTopicTitles };
}
