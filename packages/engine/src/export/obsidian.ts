import type { ConceptLinkRelation } from '@hftr/contracts';
import { leakLint } from '../calc/leak-lint';

export interface ObsidianConceptInput {
  id: string;
  title: string;
  body: string;
  tags: string[];
  sourceClass: 'deterministic_placeholder' | 'model_generated' | 'operator';
  sourceRef?: string | null;
}

export interface ObsidianLinkInput {
  fromConceptId: string;
  toConceptId: string;
  relation: ConceptLinkRelation;
  weightBand: 'weak' | 'typical' | 'strong';
}

export interface ObsidianExportNote {
  filename: string;
  markdown: string;
}

function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug.length > 0 ? slug : 'concept';
}

function uniqueFilenames(concepts: ObsidianConceptInput[]): Map<string, string> {
  const used = new Map<string, number>();
  const result = new Map<string, string>();
  for (const concept of concepts) {
    const base = slugifyTitle(concept.title);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const filename = count === 1 ? `${base}.md` : `${base}-${count}.md`;
    result.set(concept.id, filename);
  }
  return result;
}

function yamlEscape(value: string): string {
  if (/[:#{}[\],&*?|>!%@`"']/.test(value) || value.trim() !== value) {
    return JSON.stringify(value);
  }
  return value;
}

function buildFrontmatter(opts: {
  concept: ObsidianConceptInput;
  outgoing: ObsidianLinkInput[];
  idToTitle: Map<string, string>;
  libraryName?: string;
}): string {
  const lines = ['---'];
  lines.push(`title: ${yamlEscape(opts.concept.title)}`);
  lines.push(`hftr_id: ${opts.concept.id}`);
  lines.push(`source_class: ${opts.concept.sourceClass}`);
  if (opts.concept.sourceRef) {
    lines.push(`source_ref: ${yamlEscape(opts.concept.sourceRef)}`);
  }
  if (opts.libraryName) {
    lines.push(`library: ${yamlEscape(opts.libraryName)}`);
  }
  if (opts.concept.tags.length > 0) {
    lines.push('tags:');
    for (const tag of opts.concept.tags) {
      lines.push(`  - ${yamlEscape(tag)}`);
    }
  }
  if (opts.outgoing.length > 0) {
    lines.push('links:');
    for (const link of opts.outgoing) {
      const targetTitle = opts.idToTitle.get(link.toConceptId);
      if (!targetTitle) continue;
      lines.push(
        `  - relation: ${link.relation}`,
        `    weight: ${link.weightBand}`,
        `    target: "[[${targetTitle.replace(/"/g, '\\"')}]]"`,
      );
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function buildLinksSection(outgoing: ObsidianLinkInput[], idToTitle: Map<string, string>): string {
  if (outgoing.length === 0) return '';
  const grouped = new Map<ConceptLinkRelation, string[]>();
  for (const link of outgoing) {
    const title = idToTitle.get(link.toConceptId);
    if (!title) continue;
    const bucket = grouped.get(link.relation) ?? [];
    bucket.push(`[[${title}]] (${link.weightBand})`);
    grouped.set(link.relation, bucket);
  }
  if (grouped.size === 0) return '';
  const lines = ['', '## Links'];
  for (const [relation, wikilinks] of grouped) {
    lines.push(`### ${relation}`, ...wikilinks.map((w) => `- ${w}`));
  }
  return lines.join('\n');
}

/**
 * Pure Obsidian export: one markdown note per concept with YAML frontmatter
 * and [[wikilinks]] for typed edges. Output is leak-linted before return.
 */
export function exportObsidianNotes(opts: {
  concepts: ObsidianConceptInput[];
  links: ObsidianLinkInput[];
  libraryName?: string;
}): ObsidianExportNote[] {
  const idToTitle = new Map(opts.concepts.map((c) => [c.id, c.title]));
  const filenames = uniqueFilenames(opts.concepts);
  const outgoingByConcept = new Map<string, ObsidianLinkInput[]>();
  for (const link of opts.links) {
    const bucket = outgoingByConcept.get(link.fromConceptId) ?? [];
    bucket.push(link);
    outgoingByConcept.set(link.fromConceptId, bucket);
  }

  const notes: ObsidianExportNote[] = [];
  for (const concept of opts.concepts) {
    const outgoing = outgoingByConcept.get(concept.id) ?? [];
    const frontmatter = buildFrontmatter({
      concept,
      outgoing,
      idToTitle,
      ...(opts.libraryName !== undefined ? { libraryName: opts.libraryName } : {}),
    });
    const linksSection = buildLinksSection(outgoing, idToTitle);
    const markdown = `${frontmatter}\n\n${concept.body.trim()}${linksSection}\n`;
    const lint = leakLint(markdown, []);
    if (!lint.ok) {
      throw new Error(`obsidian_export_numeric_leak:${concept.id}`);
    }
    notes.push({
      filename: filenames.get(concept.id) ?? `${slugifyTitle(concept.title)}.md`,
      markdown,
    });
  }
  return notes;
}
