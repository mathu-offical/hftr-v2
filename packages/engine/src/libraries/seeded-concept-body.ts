/**
 * Rich markdown bodies for catalog_seed concepts (D-079).
 * Qualitative only — leak-lint clean; sys chips for tools/levers/catalogs/fields/bands.
 * Stored as markdown in concepts.body; Obsidian export reuses the same text.
 */

import { leakLint } from '../calc/leak-lint';

export type SeededCatalogEntry = {
  catalog: string;
  entryKey: string;
  title: string;
  tier: string | null;
  payload?: unknown;
};

function humanize(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

function isLeakSafeText(value: string): boolean {
  return leakLint(value, []).ok;
}

/** Operator-facing label; strips digit runs when needed so bodies stay leak-clean. */
export function leakSafeLabel(value: string): string {
  const human = humanize(value);
  if (isLeakSafeText(human)) return human;
  const stripped = human.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length > 0 ? stripped : 'catalog mechanism';
}

function leakSafeEntryKey(value: string): string {
  const label = leakSafeLabel(value).replace(/-+$/g, '').replace(/\s+-/g, ' ').trim();
  if (label.length >= 2 && /[a-z]/i.test(label)) return label;
  return 'catalog entry';
}

function assertLeakClean(body: string): void {
  const lint = leakLint(body, []);
  if (!lint.ok) {
    throw new Error(
      `seeded concept body failed leakLint: ${lint.leaks.map((l) => l.path).join(', ')}`,
    );
  }
}

function asPayload(entry: SeededCatalogEntry): Record<string, unknown> {
  const payload = entry.payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function asStringList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = leakSafeLabel(item);
    if (!text || !isLeakSafeText(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/** Chip id must be leak-safe (no digit runs). Prefer snake tokens without digits. */
function sysChip(
  kind: 'tool' | 'lever' | 'catalog' | 'module' | 'band' | 'field' | 'symbol',
  id: string,
): string {
  const safeId = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, '_')
    .replace(/\d+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!safeId || !isLeakSafeText(safeId)) return leakSafeLabel(id);
  return `[[sys:${kind}:${safeId}]]`;
}

function pushSection(lines: string[], heading: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push('', `## ${heading}`, ...items.map((item) => `- ${item}`));
}

function pushChipSection(
  lines: string[],
  heading: string,
  kind: 'tool' | 'lever' | 'catalog' | 'band' | 'field' | 'symbol',
  ids: string[],
): void {
  if (ids.length === 0) return;
  const chips = ids.map((id) => `- ${sysChip(kind, id)} — ${leakSafeLabel(id)}`);
  lines.push('', `## ${heading}`, ...chips);
}

function pushKvSection(
  lines: string[],
  heading: string,
  rows: Array<{ key: string; value: string }>,
): void {
  if (rows.length === 0) return;
  lines.push('', `## ${heading}`, '', '| Field | Value |', '| --- | --- |');
  for (const row of rows) {
    const key = leakSafeLabel(row.key).replace(/\|/g, '/');
    const value = leakSafeLabel(row.value).replace(/\|/g, '/');
    if (!isLeakSafeText(key) || !isLeakSafeText(value)) continue;
    lines.push(`| ${key} | ${value} |`);
  }
}

function stringRecordKv(value: unknown, max = 16): Array<{ key: string; value: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const out: Array<{ key: string; value: string }> = [];
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (out.length >= max) break;
    if (typeof raw === 'string') {
      out.push({ key, value: raw });
      continue;
    }
    if (typeof raw === 'boolean') {
      out.push({ key, value: raw ? 'enabled' : 'disabled' });
      continue;
    }
    if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
      const joined = asStringList(raw, 6).join('; ');
      if (joined) out.push({ key, value: joined });
    }
  }
  return out;
}

function pushProse(lines: string[], heading: string, text: unknown): void {
  if (typeof text !== 'string') return;
  const trimmed = text.trim();
  if (!trimmed || !isLeakSafeText(trimmed)) return;
  lines.push('', `## ${heading}`, '', trimmed);
}

function collectObjectList(
  value: unknown,
  pick: (row: Record<string, unknown>) => string | null,
  max = 8,
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const label = pick(item as Record<string, unknown>);
    if (!label) continue;
    out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Tags for galaxy filters / Obsidian frontmatter — catalog + qualitative axes from payload.
 */
export function collectSeededConceptTags(entry: SeededCatalogEntry): string[] {
  const payload = asPayload(entry);
  const tags = new Set<string>();
  tags.add(entry.catalog);
  if (entry.tier) tags.add(entry.tier);
  tags.add('catalog_seed');

  for (const key of [
    'class',
    'assetClass',
    'horizon',
    'liquidityClass',
    'macroSensitivity',
  ] as const) {
    const raw = payload[key];
    if (typeof raw === 'string' && raw.trim()) tags.add(raw.trim());
  }
  for (const tag of asStringList(payload.regimeTags, 12)) {
    tags.add(tag.replace(/\s+/g, '_'));
  }
  for (const axis of asStringList(payload.knowledgeAxes, 8)) {
    tags.add(axis.replace(/\s+/g, '_'));
  }
  for (const session of asStringList(payload.sessions, 6)) {
    tags.add(session.replace(/\s+/g, '_'));
  }

  return [...tags].filter((t) => t.length > 0 && t.length < 64).slice(0, 24);
}

/**
 * Build operator-readable concept body from vendored catalog payload fields.
 */
export function buildSeededConceptBody(entry: SeededCatalogEntry): string {
  const payload = asPayload(entry);
  const titleLabel = leakSafeLabel(entry.title);
  const catalogLabel = leakSafeLabel(entry.catalog);
  const lines: string[] = [
    `# ${titleLabel}`,
    '',
    `> Seeded baseline article from ${sysChip('catalog', entry.catalog)} (${catalogLabel}).`,
    '',
    'Compile-time knowledge for operators and librarians. Values are qualitative descriptors only —',
    'no raw prices, sizes, or clocks. System refs render as chips in the inspector and survive Obsidian `.md` export.',
  ];

  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
  if (summary && isLeakSafeText(summary)) {
    lines.push('', '## Overview', '', summary);
  }

  const identityRows: Array<{ key: string; value: string }> = [
    { key: 'catalog', value: entry.catalog },
    { key: 'entry', value: leakSafeEntryKey(entry.entryKey) },
  ];
  if (entry.tier) identityRows.push({ key: 'activation tier', value: entry.tier });
  const mechanismClass =
    typeof payload.class === 'string'
      ? payload.class
      : typeof payload.assetClass === 'string'
        ? payload.assetClass
        : null;
  if (mechanismClass) identityRows.push({ key: 'mechanism class', value: mechanismClass });
  if (typeof payload.horizon === 'string')
    identityRows.push({ key: 'horizon', value: payload.horizon });
  if (typeof payload.liquidityClass === 'string') {
    identityRows.push({ key: 'liquidity class', value: payload.liquidityClass });
  }
  if (typeof payload.macroSensitivity === 'string') {
    identityRows.push({ key: 'macro sensitivity', value: payload.macroSensitivity });
  }
  if (typeof payload.sector === 'string')
    identityRows.push({ key: 'sector', value: payload.sector });
  if (typeof payload.behaviorProfile === 'string') {
    identityRows.push({ key: 'behavior profile', value: payload.behaviorProfile });
  }
  pushKvSection(lines, 'Identity', identityRows);

  pushSection(lines, 'Tags and regimes', asStringList(payload.regimeTags));
  pushSection(lines, 'Sessions', asStringList(payload.sessions));
  pushSection(lines, 'Knowledge axes', asStringList(payload.knowledgeAxes));
  pushSection(lines, 'Universe filters', asStringList(payload.universeFilters));
  pushSection(lines, 'Market structure checks', asStringList(payload.marketStructureChecks));
  pushSection(lines, 'Compliance overlays', asStringList(payload.complianceOverlays));
  pushSection(lines, 'Data dependencies', asStringList(payload.dataDependencies));

  // Trends / leads
  const trendBindings =
    payload.trendLeadBindings &&
    typeof payload.trendLeadBindings === 'object' &&
    !Array.isArray(payload.trendLeadBindings)
      ? (payload.trendLeadBindings as Record<string, unknown>)
      : null;
  if (trendBindings) {
    pushSection(lines, 'Trend inputs', asStringList(trendBindings.trendInputs));
    pushSection(
      lines,
      'Lead selection patterns',
      asStringList(trendBindings.leadSelectionPatterns),
    );
    pushProse(lines, 'Handoff expectation', trendBindings.handoffExpectation);
  }
  pushSection(lines, 'Trend vectors', asStringList(payload.trendVectors));
  pushSection(lines, 'Trend drivers', asStringList(payload.trendDrivers));
  pushSection(lines, 'Lead gathering patterns', asStringList(payload.leadGatheringPatterns));
  pushSection(lines, 'Preferred families', asStringList(payload.preferredFamilies));
  pushSection(lines, 'Bound strategies', asStringList(payload.boundStrategies));
  pushSection(lines, 'Trend requirements', asStringList(payload.trendRequirements));
  pushSection(lines, 'Lead requirements', asStringList(payload.leadRequirements));

  // Functions / controls / tools as sys chips
  pushChipSection(lines, 'Hard controls (tools)', 'tool', asStringList(payload.hardControls, 16));
  pushChipSection(lines, 'Recovery branches', 'tool', asStringList(payload.recoveryBranches, 12));
  pushChipSection(
    lines,
    'Platform guardrails',
    'tool',
    asStringList(payload.platformGuardrails, 12),
  );
  pushChipSection(lines, 'Primary triggers', 'tool', asStringList(payload.primaryTriggers, 12));
  pushChipSection(lines, 'Failure codes', 'tool', asStringList(payload.failureCodes, 12));
  pushChipSection(
    lines,
    'Order workflows',
    'tool',
    asStringList(payload.orderWorkflowCompatibility, 12),
  );
  pushChipSection(
    lines,
    'Bounded levers',
    'lever',
    asStringList(payload.boundedLevers ?? payload.boundedRangeFamilies, 16),
  );
  pushChipSection(
    lines,
    'Guardrail packages',
    'catalog',
    asStringList(payload.guardrailPackages, 8),
  );
  pushChipSection(lines, 'Family stack', 'catalog', asStringList(payload.familyStack, 8));

  // Verification fields / symbols / KV
  pushChipSection(
    lines,
    'Verification fields',
    'field',
    asStringList(payload.verificationFields, 16),
  );
  pushChipSection(
    lines,
    'Verification signals',
    'field',
    asStringList(payload.verificationSignals, 12),
  );
  pushChipSection(lines, 'Inputs', 'field', asStringList(payload.inputs, 12));
  pushChipSection(
    lines,
    'Confirmation signals',
    'field',
    asStringList(payload.confirmationSignals, 12),
  );
  pushSection(lines, 'Suppress when', asStringList(payload.suppressWhen));
  pushSection(lines, 'Modes', asStringList(payload.modes));
  pushSection(lines, 'Routing scope', asStringList(payload.routingScope));
  pushSection(lines, 'Failure handling', asStringList(payload.failureHandling));
  pushSection(lines, 'Special rules', asStringList(payload.specialRules, 8));
  pushSection(lines, 'Operator visibility', asStringList(payload.operatorVisibility));
  pushSection(lines, 'Subsectors', asStringList(payload.subsectors));
  pushSection(lines, 'Event drivers', asStringList(payload.eventDrivers));
  pushSection(lines, 'Baseline knowledge', asStringList(payload.baselineKnowledge));
  pushSection(lines, 'Applies to', asStringList(payload.appliesTo));
  pushSection(lines, 'Triggers', asStringList(payload.triggers));
  pushSection(lines, 'Phases', asStringList(payload.phases));
  pushSection(lines, 'Research modes', asStringList(payload.researchModes));

  const strategyBias =
    payload.strategyBias &&
    typeof payload.strategyBias === 'object' &&
    !Array.isArray(payload.strategyBias)
      ? (payload.strategyBias as Record<string, unknown>)
      : null;
  if (strategyBias) {
    pushSection(
      lines,
      'Preferred strategies',
      asStringList(strategyBias.preferred ?? strategyBias.amplify),
    );
    pushSection(
      lines,
      'Suppress strategies',
      asStringList(strategyBias.suppress ?? strategyBias.veto),
    );
  }

  // Research support as open KV
  pushKvSection(lines, 'Research support', stringRecordKv(payload.researchSupport));
  pushKvSection(lines, 'Runtime control surface', stringRecordKv(payload.runtimeControlSurface));

  // Sub-variants / compound bindings as nested articles
  if (Array.isArray(payload.subVariants)) {
    const blocks: string[] = [];
    for (const raw of payload.subVariants.slice(0, 6)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const row = raw as Record<string, unknown>;
      const name = leakSafeLabel(String(row.name ?? row.id ?? 'variant'));
      const parts = [`### ${name}`];
      if (typeof row.triggerProfile === 'string' && isLeakSafeText(row.triggerProfile)) {
        parts.push('', row.triggerProfile.trim());
      }
      const lead = typeof row.leadPattern === 'string' ? leakSafeLabel(row.leadPattern) : '';
      if (lead) parts.push('', `- Lead pattern: ${lead}`);
      const guards = asStringList(row.guardrailFocus, 6).map((g) => `${sysChip('tool', g)} (${g})`);
      if (guards.length) parts.push('', '- Guardrail focus:', ...guards.map((g) => `  - ${g}`));
      const research = asStringList(row.preferredResearch, 6);
      if (research.length) parts.push('', `- Preferred research: ${research.join('; ')}`);
      blocks.push(parts.join('\n'));
    }
    if (blocks.length) {
      lines.push('', '## Sub-variants', '', ...blocks);
    }
  }

  if (Array.isArray(payload.compoundBindings)) {
    const items = collectObjectList(
      payload.compoundBindings,
      (row) => {
        const compound = leakSafeLabel(String(row.compoundStrategy ?? row.id ?? ''));
        const role = typeof row.role === 'string' ? leakSafeLabel(row.role) : '';
        if (!compound) return null;
        return role ? `**${compound}** — role ${role}` : `**${compound}**`;
      },
      8,
    );
    pushSection(lines, 'Compound bindings', items);
  }

  if (Array.isArray(payload.phases) && payload.phases.some((p) => p && typeof p === 'object')) {
    const items = collectObjectList(
      payload.phases,
      (row) => {
        const name = leakSafeLabel(String(row.name ?? row.id ?? row.phase ?? ''));
        const rule = typeof row.rule === 'string' ? leakSafeLabel(row.rule) : '';
        if (!name) return null;
        return rule ? `**${name}** — ${rule}` : `**${name}**`;
      },
      8,
    );
    pushSection(lines, 'Ladder / phase plan', items);
  }

  if (typeof payload.rule === 'string' && isLeakSafeText(payload.rule)) {
    pushProse(lines, 'Rule', payload.rule);
  }

  const outcome =
    typeof payload.deterministicOutcome === 'string'
      ? leakSafeLabel(payload.deterministicOutcome)
      : '';
  if (outcome && isLeakSafeText(outcome)) {
    lines.push('', '## Deterministic outcome', '', outcome);
  }

  // Open-ended leftover qualitative keys (shallow) as KV when not already covered
  const covered = new Set([
    'id',
    'name',
    'summary',
    'class',
    'assetClass',
    'activationTier',
    'horizon',
    'sessions',
    'regimeTags',
    'trendLeadBindings',
    'dataDependencies',
    'verificationFields',
    'hardControls',
    'recoveryBranches',
    'knowledgeAxes',
    'complianceOverlays',
    'universeFilters',
    'marketStructureChecks',
    'subVariants',
    'researchSupport',
    'compoundBindings',
    'strategyBias',
    'liquidityClass',
    'macroSensitivity',
    'deterministicOutcome',
    'primaryTriggers',
    'failureCodes',
    'recoveryLadder',
    'boundStrategies',
    'inputs',
    'confirmationSignals',
    'suppressWhen',
    'preferredFamilies',
    'routingScope',
    'orderWorkflowCompatibility',
    'modes',
    'failureHandling',
    'platformGuardrails',
    'specialRules',
    'verificationSignals',
    'operatorVisibility',
    'subsectors',
    'leadGatheringPatterns',
    'eventDrivers',
    'trendVectors',
    'trendDrivers',
    'baselineKnowledge',
    'sector',
    'behaviorProfile',
    'guardrailPackages',
    'familyStack',
    'phases',
    'trendRequirements',
    'leadRequirements',
    'researchModes',
    'boundedLevers',
    'boundedRangeFamilies',
    'appliesTo',
    'triggers',
    'rule',
    'runtimeControlSurface',
  ]);
  const extras = stringRecordKv(
    Object.fromEntries(Object.entries(payload).filter(([k]) => !covered.has(k))),
    12,
  );
  pushKvSection(lines, 'Additional fields', extras);

  lines.push(
    '',
    '## System links',
    '',
    `- Catalog family: ${sysChip('catalog', entry.catalog)}`,
    `- Source entry: ${leakSafeEntryKey(entry.entryKey)}`,
    '- Export: Obsidian `.md` uses this body plus YAML frontmatter (title, tags, links).',
  );

  const body = lines.join('\n').trim();
  assertLeakClean(body);
  return body;
}

/** Hybrid topic synopsis for the Seeded trading mechanisms overview page. */
export function buildSeededTopicSynopsisMd(
  members: ReadonlyArray<{ title: string; catalog: string }>,
): string {
  const byCatalog = new Map<string, string[]>();
  for (const member of members) {
    const list = byCatalog.get(member.catalog) ?? [];
    list.push(member.title);
    byCatalog.set(member.catalog, list);
  }

  const lines = [
    '# Seeded trading mechanisms',
    '',
    'Compile-time baseline of trading mechanisms from vendored catalogs.',
    'Each member is a readable catalog article (strategies, guardrails, sessions, broker policy, trend leads, and related families) admitted into the company knowledge graph.',
    '',
    '## How to use',
    '',
    '- Open a member concept in the inspector for full markdown (tags, trends, tools, fields, KV tables, system chips).',
    '- Export a library to Obsidian for offline `.md` notes with wikilinks.',
    '',
    '## Catalogs in this article',
    '',
    ...[...byCatalog.keys()]
      .sort()
      .map((catalog) => `- ${sysChip('catalog', catalog)} — ${leakSafeLabel(catalog)}`),
    '',
    '## Member concepts by catalog',
  ];

  for (const [catalog, titles] of [...byCatalog.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push('', `### ${leakSafeLabel(catalog)}`, '');
    for (const title of titles) {
      lines.push(`- [[${title}]]`);
    }
  }

  const synopsisMd = lines.join('\n');
  assertLeakClean(synopsisMd);
  return synopsisMd;
}
