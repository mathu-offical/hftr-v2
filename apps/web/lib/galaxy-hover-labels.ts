/**
 * Galaxy hover / tooltip copy helpers (text-first; no emoji).
 * Keeps label formatting out of GalaxyView render paths for unit tests.
 */

import { humanizeConceptTitle, shortLibraryLabel } from './research-library-shelves';

export type GalaxyHoverNodeKind = 'concept' | 'tag-sat' | 'nest-hull';

export interface GalaxyConceptHoverInput {
  kind: 'concept';
  title: string;
  tags: readonly string[];
  sourceClass?: string | null;
  curationStatus?: string | null;
  queryCount?: number | null;
  referenceCount?: number | null;
  libraryName?: string | null;
  folderLabel?: string | null;
  articleTitle?: string | null;
  degree?: number | null;
}

export interface GalaxyTagHoverInput {
  kind: 'tag-sat';
  title: string;
  parentTitle?: string | null;
}

export interface GalaxyNestHoverInput {
  kind: 'nest-hull';
  hullKind?: string | null;
  label: string;
  radius?: number | null;
}

export interface GalaxyLinkHoverInput {
  relation: string;
  weightBand: string;
  similarityBand?: string | null;
  fromTitle?: string | null;
  toTitle?: string | null;
}

function formatStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  return status.replace(/_/g, ' ');
}

function usageLine(queryCount?: number | null, referenceCount?: number | null): string | null {
  const q = queryCount ?? 0;
  const r = referenceCount ?? 0;
  if (q <= 0 && r <= 0) return null;
  const parts: string[] = [];
  if (q > 0) parts.push(`Queried ${q}`);
  if (r > 0) parts.push(`Referenced ${r}`);
  return parts.join(' · ');
}

/** Plain-text lines for aria / tests (one semantic fact per line). */
export function conceptHoverLines(input: GalaxyConceptHoverInput): string[] {
  const title = humanizeConceptTitle(input.title) || input.title;
  const lines = [title];
  const nestBits = [
    input.libraryName ? shortLibraryLabel(input.libraryName, 28) : null,
    input.folderLabel ? shortLibraryLabel(input.folderLabel, 24) : null,
    input.articleTitle ? shortLibraryLabel(input.articleTitle, 28) : null,
  ].filter((v): v is string => Boolean(v));
  if (nestBits.length > 0) lines.push(nestBits.join(' / '));

  const meta: string[] = [];
  const curation = formatStatus(input.curationStatus);
  if (curation) meta.push(curation);
  if (input.sourceClass) meta.push(formatStatus(input.sourceClass) ?? input.sourceClass);
  if (typeof input.degree === 'number' && input.degree > 0) {
    meta.push(`${input.degree} link${input.degree === 1 ? '' : 's'}`);
  }
  if (meta.length > 0) lines.push(meta.join(' · '));

  const usage = usageLine(input.queryCount, input.referenceCount);
  if (usage) lines.push(usage);

  if (input.tags.length > 0) {
    lines.push(input.tags.slice(0, 4).join(' · '));
  }
  return lines;
}

export function tagHoverLines(input: GalaxyTagHoverInput): string[] {
  const lines = [`Tag · ${input.title}`];
  if (input.parentTitle) {
    lines.push(`Orbit · ${humanizeConceptTitle(input.parentTitle) || input.parentTitle}`);
  }
  return lines;
}

export function nestHoverLines(input: GalaxyNestHoverInput): string[] {
  const kind =
    input.hullKind === 'company'
      ? 'Company envelope'
      : input.hullKind === 'library'
        ? 'Library nest'
        : input.hullKind === 'folder'
          ? 'Folder sphere'
          : input.hullKind === 'article' || input.hullKind === 'topic'
            ? 'Article orbit'
            : 'Nest';
  return [kind, input.label];
}

export function linkHoverLines(input: GalaxyLinkHoverInput): string[] {
  const relation = formatStatus(input.relation) ?? input.relation;
  const weight = formatStatus(input.weightBand) ?? input.weightBand;
  const lines = [`${relation} · ${weight} weight`];
  if (input.similarityBand) {
    lines.push(`Similarity · ${input.similarityBand}`);
  }
  const from = input.fromTitle ? humanizeConceptTitle(input.fromTitle) || input.fromTitle : null;
  const to = input.toTitle ? humanizeConceptTitle(input.toTitle) || input.toTitle : null;
  if (from && to) lines.push(`${from} → ${to}`);
  return lines;
}

/** Compact HTML for force-graph tooltip (escaped text only). */
export function escapeHoverHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function linesToHoverHtml(lines: readonly string[]): string {
  if (lines.length === 0) return '';
  const [title, ...rest] = lines;
  const body = rest
    .map(
      (line) =>
        `<div style="margin-top:3px;opacity:0.82;font-size:10px;line-height:1.35">${escapeHoverHtml(line)}</div>`,
    )
    .join('');
  return `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.35;max-width:16rem"><div style="font-weight:600;color:#e8ecf4">${escapeHoverHtml(title ?? '')}</div>${body}</div>`;
}
