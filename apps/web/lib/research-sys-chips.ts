/**
 * Inline system-reference chips for research markdown (D-047 / D-079).
 * Optional syntax: [[sys:kind:id]] → rendered as a chip-friendly markdown link.
 * Known kinds: tool, lever, catalog, module, band, field, symbol.
 */

export type SysChipKind = 'tool' | 'lever' | 'catalog' | 'module' | 'band' | 'field' | 'symbol';

export type SysChipTarget = {
  kind: SysChipKind;
  id: string;
  label: string;
};

const SYS_WIKILINK_RE = /\[\[sys:([a-z]+):([^\]]+)\]\]/gi;

const KIND_LABEL: Record<SysChipKind, string> = {
  tool: 'tool',
  lever: 'lever',
  catalog: 'catalog',
  module: 'module',
  band: 'band',
  field: 'field',
  symbol: 'symbol',
};

function isSysChipKind(value: string): value is SysChipKind {
  switch (value) {
    case 'tool':
    case 'lever':
    case 'catalog':
    case 'module':
    case 'band':
    case 'field':
    case 'symbol':
      return true;
    default:
      return false;
  }
}

export function parseSysChipHref(href: string | undefined): SysChipTarget | null {
  if (!href) return null;
  if (!href.startsWith('hftr-sys:')) return null;
  const rest = href.slice('hftr-sys:'.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) return null;
  const kindRaw = rest.slice(0, colon);
  const id = decodeURIComponent(rest.slice(colon + 1));
  if (!isSysChipKind(kindRaw) || !id) return null;
  return { kind: kindRaw, id, label: id.replace(/_/g, ' ') };
}

/** Rewrite [[sys:kind:id]] into markdown links consumed by ResearchMarkdown. */
export function preprocessSysChips(markdown: string): string {
  return markdown.replace(SYS_WIKILINK_RE, (_full, kindRaw: string, idRaw: string) => {
    const kind = kindRaw.toLowerCase();
    const id = idRaw.trim();
    if (!isSysChipKind(kind) || !id) return _full;
    const label = `${KIND_LABEL[kind]}:${id.replace(/_/g, ' ')}`;
    const href = `hftr-sys:${kind}:${encodeURIComponent(id)}`;
    return `[${label}](${href})`;
  });
}
