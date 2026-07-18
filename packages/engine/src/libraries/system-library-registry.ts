import {
  SYSTEM_DOC_SHAPE_SPECS,
  SystemDocKind,
  SystemTopicScope,
  type SystemTopicScope as SystemTopicScopeType,
} from '@hftr/contracts';
import { leakLint } from '@hftr/contracts';
import { validateDocumentShape } from '../research/document-shape';

export interface SystemLibraryPlaceholderSeed {
  title: string;
  sourceRef: string;
  body: string;
  docKind: SystemDocKind;
}

export interface SystemLibraryRegistryEntry {
  topicScope: SystemTopicScopeType;
  name: string;
  kindTags: readonly string[];
  placeholderSeeds: readonly SystemLibraryPlaceholderSeed[];
  scheduleKind?: string;
  cadenceMinutes?: number;
}

const MOVERS_LENS_SEEDS: SystemLibraryPlaceholderSeed[] = [
  {
    title: 'relative_strength_leaders',
    sourceRef: 'system:movers/relative_strength_leaders',
    docKind: 'movers_lens',
    body: [
      '# Relative strength leaders',
      '',
      'Names showing unusual relative strength versus the broad market deserve a dedicated watch slot.',
      'Track leadership persistence, breadth of participation, and whether strength is isolated or thematic.',
      'Use this lens before promoting a mover into tactical research or trend nomination.',
    ].join('\n'),
  },
  {
    title: 'volume_expansion_watch',
    sourceRef: 'system:movers/volume_expansion_watch',
    docKind: 'movers_lens',
    body: [
      '# Volume expansion watch',
      '',
      'Participation expansion often precedes durable mover status when it aligns with a clear catalyst narrative.',
      'Contrast organic accumulation against one-off headline spikes; defer admission when liquidity is thin.',
      'Pair with session legality and broker policy envelopes before any downstream compile interest.',
    ].join('\n'),
  },
  {
    title: 'sector_rotation_signal',
    sourceRef: 'system:movers/sector_rotation_signal',
    docKind: 'movers_lens',
    body: [
      '# Sector rotation signal',
      '',
      'Leadership shifts across sectors can re-rank daily movers without a single-name story dominating.',
      'Note whether rotation is defensive, cyclical, or event-driven before linking concepts across libraries.',
      'Rotation context helps librarians sanity-check sympathy plays against the active sector tape.',
    ].join('\n'),
  },
];

const MOVERS_REPORT_SEED: SystemLibraryPlaceholderSeed = {
  title: 'daily_movers_report',
  sourceRef: 'system:movers/daily_movers_report',
  docKind: 'movers_report',
  body: [
    '# Daily movers report',
    '',
    '## Scan window',
    '',
    'Session-scoped leadership scan across linked modules. Qualitative bands only until live seals attach.',
    '',
    '## Leadership notes',
    '',
    'Relative strength and participation themes without raw tape figures.',
    'Cross-check [[relative_strength_leaders]] before admitting sympathy names.',
    '',
    '## Related lenses',
    '',
    'Pair with [[volume_expansion_watch]] and [[sector_rotation_signal]] when rotation context matters.',
  ].join('\n'),
};

function assertRegistrySeed(seed: SystemLibraryPlaceholderSeed): void {
  const lint = leakLint(seed.body, []);
  if (!lint.ok) {
    throw new Error(
      `system library seed failed leakLint (${seed.title}): ${lint.leaks.map((l) => l.path).join(', ')}`,
    );
  }

  const specTags = SYSTEM_DOC_SHAPE_SPECS[seed.docKind].requiredTags;

  const shape = validateDocumentShape({
    kind: seed.docKind,
    body: seed.body,
    tags: ['system_curated', ...specTags],
    sourceRef: seed.sourceRef,
  });
  if (!shape.ok) {
    throw new Error(
      `system library seed failed shape (${seed.title}): ${shape.failedChecks.join(', ')}`,
    );
  }
}

export const SYSTEM_LIBRARY_REGISTRY: readonly SystemLibraryRegistryEntry[] = [
  {
    topicScope: SystemTopicScope.MOVERS,
    name: 'Daily movers watch',
    kindTags: ['system_curated', 'movers', 'daily'],
    placeholderSeeds: [...MOVERS_LENS_SEEDS, MOVERS_REPORT_SEED],
    scheduleKind: 'library.system_movers',
    cadenceMinutes: 1440,
  },
  {
    topicScope: SystemTopicScope.EXECUTION_LOGS,
    name: 'Execution logs',
    kindTags: ['system_curated', 'execution_logs'],
    placeholderSeeds: [
      {
        title: 'session_execution_log',
        sourceRef: 'system:execution_logs/session_execution_log',
        docKind: 'execution_log',
        body: [
          '# Session execution log',
          '',
          '## Session',
          '',
          'Regular-hours dispatch window with paper parity and policy envelopes active.',
          '',
          '## Actions',
          '',
          'Qualitative action ledger without order identifiers or fill quantities.',
          '',
          '## Outcomes',
          '',
          'Outcome bands reference verification records rather than raw performance figures.',
        ].join('\n'),
      },
    ],
  },
  {
    topicScope: SystemTopicScope.DAILY_SUMMARIES,
    name: 'Daily summaries',
    kindTags: ['system_curated', 'daily_summaries', 'daily'],
    placeholderSeeds: [
      {
        title: 'market_day_summary',
        sourceRef: 'system:daily_summaries/market_day_summary',
        docKind: 'daily_summary',
        body: [
          '# Market day summary',
          '',
          '## Pre-open',
          '',
          'Overnight narrative and gap context without price literals.',
          '',
          '## Midday',
          '',
          'Leadership rotation and sector sympathy themes.',
          '',
          '## Close',
          '',
          'Session tone and participation breadth in qualitative bands.',
          '',
          '## Post-analysis',
          '',
          'Link forward themes via [[sector_rotation_signal]] when movers shelves are active.',
        ].join('\n'),
      },
    ],
    scheduleKind: 'library.system_daily_summaries',
    cadenceMinutes: 1440,
  },
  {
    topicScope: SystemTopicScope.RUNTIME_POLICIES,
    name: 'Runtime policies',
    kindTags: ['system_curated', 'runtime_policies'],
    placeholderSeeds: [
      {
        title: 'paper_runtime_policy',
        sourceRef: 'system:runtime_policies/paper_runtime_policy',
        docKind: 'runtime_policy',
        body: [
          '# Paper runtime policy',
          '',
          '## Scope',
          '',
          'Company paper mode with fail-closed live gates and shared engine semantics.',
          '',
          '## Constraints',
          '',
          'Guardrail packages remain immutable; only bounded lever positions may move.',
          '',
          '## Escalation',
          '',
          'Operator review when verification or compliance posture degrades.',
        ].join('\n'),
      },
    ],
  },
  {
    topicScope: SystemTopicScope.TREND_LISTS,
    name: 'Trend lists',
    kindTags: ['system_curated', 'trend_lists'],
    placeholderSeeds: [
      {
        title: 'active_trend_roster',
        sourceRef: 'system:trend_lists/active_trend_roster',
        docKind: 'trend_list',
        body: [
          '# Active trend roster',
          '',
          '## Active trends',
          '',
          'Admitted trend candidates with qualitative strength bands only.',
          '',
          '## Watch',
          '',
          'Near-threshold names awaiting corroboration or operator review.',
          '',
          '## Deferred',
          '',
          'Candidates parked until sector or session context improves.',
        ].join('\n'),
      },
    ],
  },
  {
    topicScope: SystemTopicScope.SECTOR_NEWS,
    name: 'Sector news bulletins',
    kindTags: ['system_curated', 'sector_news', 'daily'],
    placeholderSeeds: [
      {
        title: 'sector_headlines_bulletin',
        sourceRef: 'system:sector_news/sector_headlines_bulletin',
        docKind: 'sector_bulletin',
        body: [
          '# Sector headlines bulletin',
          '',
          '## Sector focus',
          '',
          'Operator-configured sector focus tokens drive gather plans without model-invented tickers.',
          '',
          '## Headlines',
          '',
          'Corroborated headline clusters from independent news domains.',
          '',
          '## Cross-links',
          '',
          'Relate bulletin themes to [[relative_strength_leaders]] when leadership overlaps.',
        ].join('\n'),
      },
    ],
    scheduleKind: 'library.system_sector_news',
    cadenceMinutes: 1440,
  },
];

for (const entry of SYSTEM_LIBRARY_REGISTRY) {
  for (const seed of entry.placeholderSeeds) {
    assertRegistrySeed(seed);
  }
}

export function getSystemLibraryEntry(
  topicScope: SystemTopicScopeType,
): SystemLibraryRegistryEntry | undefined {
  return SYSTEM_LIBRARY_REGISTRY.find((entry) => entry.topicScope === topicScope);
}

/** Back-compat export: movers lens placeholders only (three qualitative lenses). */
export const MOVERS_LENS_PLACEHOLDER_SEEDS = MOVERS_LENS_SEEDS;
