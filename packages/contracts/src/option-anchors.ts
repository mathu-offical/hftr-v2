import { z } from 'zod';
import seededStrategyCatalog from '../../db/src/seed/catalogs/seeded-strategy-catalog.json';
import {
  AnalyzerEmitMode,
  LibrarianSubtype,
  LibraryClass,
  LiveApiQueryPolicy,
  LiveApiSchedulePolicy,
  ResearchSubtype,
  TrendPosture,
} from './modules';
import {
  applyDecisionSeedConstraints,
  resolveEngineDecisionSeeds,
  resolveStrategyFamiliesForTrader,
} from './engine-decision-seeds';
import { PHILOSOPHY_AXIS_CATALOG } from './philosophy';
import { PortNature } from './port-channels';
import { getEngineTemplateById } from './templates';

export const OptionAnchorKind = z.enum([
  'template_input',
  'strategy_family',
  'branch_role',
  'lever_band',
  'recovery_phase',
  'philosophy_axis',
  /** Research curator specialization (config.researchSubtype). */
  'research_subtype',
  /** Research curiosity envelope (conservative / balanced / exploratory). */
  'curiosity_band',
  /** Librarian agent kind. */
  'librarian_subtype',
  /** Library content class. */
  'library_class',
  /** Trend posture for research-led / hybrid packs. */
  'trend_posture',
  /** Cadence bucket (no raw minutes on the canvas). */
  'cadence_band',
  /** Research admission gate mode. */
  'admission_mode',
  /** Analyzer terminal emit mode. */
  'emit_mode',
  /** Live API feed class (iex_free / synthetic_sim / …). */
  'feed_class',
  /** Live API query policy mode (D-184). */
  'query_policy',
  /** Live API schedule policy (D-184). */
  'schedule_policy',
]);
export type OptionAnchorKind = z.infer<typeof OptionAnchorKind>;

export const OptionAnchorPosition = z.enum(['min', 'typical', 'max']);
export type OptionAnchorPosition = z.infer<typeof OptionAnchorPosition>;

export const OptionAnchorLayer = z.enum(['strategic', 'tactical', 'execution', 'policy']);
export type OptionAnchorLayer = z.infer<typeof OptionAnchorLayer>;

export const DecisionOption = z.object({
  id: z.string(),
  catalogRef: z.string(),
  label: z.string(),
  defaultPosition: OptionAnchorPosition.optional(),
  /** Info-type nature this option routes (D-217 / D-218) — matches PortNature. */
  routeNature: PortNature.optional(),
  /** Operator-facing stream role label (Findings, Trade path, …) — not peer names. */
  routeLabel: z.string().optional(),
});
export type DecisionOption = z.infer<typeof DecisionOption>;

export const DecisionIntakes = z.object({
  data: z.boolean(),
  systemControl: z.boolean(),
  clock: z.boolean(),
});
export type DecisionIntakes = z.infer<typeof DecisionIntakes>;

export const OptionAnchorSpec = z.object({
  id: z.string(),
  kind: OptionAnchorKind,
  catalogRef: z.string(),
  label: z.string(),
  layer: OptionAnchorLayer.optional(),
  parentAnchorId: z.string().nullable().optional(),
  ownerModuleId: z.string().nullable().optional(),
  ownerEngineId: z.string(),
  defaultPosition: OptionAnchorPosition.optional(),
  options: z.array(DecisionOption).default([]),
  selectedOptionId: z.string().nullable().optional(),
  intakes: DecisionIntakes.optional(),
});
export type OptionAnchorSpec = z.infer<typeof OptionAnchorSpec>;

/** D-192: unified decision node identity (evolved option anchor). */
export type DecisionNodeSpec = OptionAnchorSpec;

export const DECISION_HANDLE_DATA_IN = 'decision-data-in';
export const DECISION_HANDLE_SYSTEM_IN = 'decision-system-in';

export function decisionOptionOutHandle(optionId: string): string {
  return `option-out:${optionId}`;
}

export const BuildOptionAnchorsInput = z.object({
  engineId: z.string(),
  templateId: z.string(),
  members: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      config: z.record(z.unknown()).optional(),
    }),
  ),
});
export type BuildOptionAnchorsInput = z.infer<typeof BuildOptionAnchorsInput>;

type StrategyCatalog = {
  families?: Array<{ id: string; name: string }>;
  decisionTreeBranchTaxonomy?: {
    branchTypes?: Array<{
      id: string;
      role: string;
      levers?: string[];
    }>;
  };
  recoveryLadderTemplates?: Array<{
    id: string;
    name: string;
    phases: string[];
  }>;
  deterministicToolCatalog?: {
    leverToolsByScope?: {
      tactical?: Array<{ id: string; bandRef?: string }>;
      strategic?: Array<{ id: string; bandRef?: string }>;
    };
    researchAndTrainingTools?: Array<{ id: string; scope?: string }>;
  };
};

const catalog = seededStrategyCatalog as StrategyCatalog;

const RESEARCH_PHILOSOPHY_AXIS_IDS = new Set([
  'evidence_bar',
  'research_breadth',
  'regime_bias',
]);

const CURIOSITY_BANDS = ['conservative', 'balanced', 'exploratory'] as const;

const RESEARCH_ADMISSION_MODES = [
  'auto_admit_validated',
  'require_operator_approval',
] as const;

const LIVE_API_FEED_CLASSES = [
  'iex_free',
  'synthetic_sim',
  'paper_sim',
  'alpaca_iex',
] as const;

const RESEARCH_CADENCE_OPTION_DEFS = [
  { id: 'active', suffix: 'research_active', label: 'Active cadence', position: 'min' as const },
  { id: 'standard', suffix: 'research_standard', label: 'Standard cadence', position: 'typical' as const },
  { id: 'slow', suffix: 'research_slow', label: 'Slow cadence', position: 'max' as const },
] as const;

const LIBRARIAN_CADENCE_OPTION_DEFS = [
  { id: 'active', suffix: 'librarian_active', label: 'Active cadence', position: 'min' as const },
  { id: 'standard', suffix: 'librarian_standard', label: 'Standard cadence', position: 'typical' as const },
  { id: 'slow', suffix: 'librarian_slow', label: 'Slow cadence', position: 'max' as const },
] as const;

const TREND_CADENCE_OPTION_DEFS = [
  { id: 'microstructure', suffix: 'trend_microstructure', label: 'Microstructure cadence', position: 'min' as const },
  { id: 'intraday', suffix: 'trend_intraday', label: 'Intraday cadence', position: 'typical' as const },
  { id: 'research', suffix: 'trend_research', label: 'Research cadence', position: 'max' as const },
] as const;

const PHILOSOPHY_POSITION_OPTIONS: DecisionOption[] = [
  { id: 'min', catalogRef: 'min', label: 'Min', defaultPosition: 'min' },
  { id: 'typical', catalogRef: 'typical', label: 'Typical', defaultPosition: 'typical' },
  { id: 'max', catalogRef: 'max', label: 'Max', defaultPosition: 'max' },
];

const DEFAULT_DECISION_INTAKES: DecisionIntakes = {
  data: true,
  systemControl: false,
  clock: false,
};

/**
 * Intake ports by **info type** (D-208 / D-217) — not “show every port.”
 * Data = payload / path routing; system = policy / control; clock = cadence / schedule.
 */
export function intakesForDecisionKind(kind: OptionAnchorKind): DecisionIntakes {
  switch (kind) {
    case 'strategy_family':
    case 'branch_role':
    case 'emit_mode':
    case 'feed_class':
    case 'research_subtype':
    case 'librarian_subtype':
    case 'library_class':
    case 'trend_posture':
    case 'template_input':
    case 'lever_band':
    case 'philosophy_axis':
      return { data: true, systemControl: false, clock: false };
    case 'recovery_phase':
    case 'curiosity_band':
    case 'admission_mode':
    case 'query_policy':
      return { data: false, systemControl: true, clock: false };
    case 'cadence_band':
    case 'schedule_policy':
      return { data: false, systemControl: false, clock: true };
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return DEFAULT_DECISION_INTAKES;
    }
  }
}

/**
 * Default route nature + stream label for a decision kind (info type, not peer name).
 */
export function routeMetaForDecisionKind(kind: OptionAnchorKind): {
  nature: PortNature;
  label: string;
} {
  switch (kind) {
    case 'strategy_family':
      return { nature: 'data', label: 'Trade path' };
    case 'branch_role':
      return { nature: 'data', label: 'Branch' };
    case 'recovery_phase':
      return { nature: 'system', label: 'Recovery' };
    case 'emit_mode':
      return { nature: 'data', label: 'Analysis' };
    case 'feed_class':
      return { nature: 'data', label: 'Market feed' };
    case 'research_subtype':
      return { nature: 'data', label: 'Findings' };
    case 'librarian_subtype':
      return { nature: 'system', label: 'Curation' };
    case 'library_class':
      return { nature: 'data', label: 'Library class' };
    case 'trend_posture':
      return { nature: 'data', label: 'Signals' };
    case 'curiosity_band':
    case 'admission_mode':
    case 'query_policy':
      return { nature: 'system', label: 'Policy' };
    case 'cadence_band':
    case 'schedule_policy':
      return { nature: 'time', label: 'Cadence' };
    case 'lever_band':
    case 'template_input':
    case 'philosophy_axis':
      return { nature: 'data', label: 'Tuning' };
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return { nature: 'data', label: 'Out' };
    }
  }
}

/** Per-option route label when the option id itself is an info-type fork. */
function routeLabelForOptionId(kind: OptionAnchorKind, optionId: string): string | null {
  if (kind === 'emit_mode') {
    switch (optionId) {
      case 'to_library':
        return 'Library';
      case 'to_desk_stream':
        return 'Desk stream';
      case 'verify_loopback':
        return 'Verify';
      default:
        return null;
    }
  }
  return null;
}

/** Stamp routeNature / routeLabel onto options (idempotent). */
export function withDecisionOptionRouteMeta(
  kind: OptionAnchorKind,
  options: readonly DecisionOption[],
): DecisionOption[] {
  const base = routeMetaForDecisionKind(kind);
  return options.map((option) => ({
    ...option,
    routeNature: option.routeNature ?? base.nature,
    routeLabel: option.routeLabel ?? routeLabelForOptionId(kind, option.id) ?? base.label,
  }));
}

/**
 * Emit modes relevant to this analyzer’s **output path** (D-216 / D-217).
 * Dual hub feeds stamp `hubFeedClass`; canvas shows only the matching route.
 */
export function emitModesForAnalyzerOutput(
  config: Record<string, unknown> | undefined,
): readonly AnalyzerEmitMode[] {
  const feed = readStringConfig(config, 'hubFeedClass');
  if (feed === 'direct') return ['to_library'] as const;
  if (feed === 'analyzed') return ['to_desk_stream'] as const;
  const mode = readStringConfig(config, 'emitMode');
  if (mode === 'to_library' || mode === 'to_desk_stream' || mode === 'verify_loopback') {
    return [mode] as const;
  }
  return AnalyzerEmitMode.options;
}

/** Estimated decision card height from intakes + option rows (parent-relative). */
export function estimateDecisionNodeHeight(
  anchor: Pick<OptionAnchorSpec, 'intakes' | 'options'>,
): number {
  const intakes = anchor.intakes ?? { data: true, systemControl: false, clock: false };
  const intakeCount =
    (intakes.data ? 1 : 0) + (intakes.systemControl ? 1 : 0) + (intakes.clock ? 1 : 0);
  const optionCount = Math.max(anchor.options?.length ?? 0, 1);
  const rows = Math.max(intakeCount, optionCount, 1);
  return Math.max(64, 28 + rows * 18);
}

/** Slug catalog references for stable anchor ids (no positional indices). */
export function slugCatalogRef(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildOptionAnchorId(
  engineId: string,
  kind: OptionAnchorKind,
  catalogRef: string,
): string {
  return `${engineId}:${kind}:${slugCatalogRef(catalogRef)}`;
}

function humanizeToken(token: string): string {
  return token
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function familyLabel(familyId: string): string {
  const family = catalog.families?.find((entry) => entry.id === familyId);
  return family?.name ? humanizeToken(family.name) : familyId;
}

function readStringConfig(
  config: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumberConfig(
  config: Record<string, unknown> | undefined,
  key: string,
): number | null {
  const value = config?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function enumDecisionOptions(
  ownerId: string,
  scope: string,
  values: readonly string[],
  labelFn: (value: string) => string = humanizeToken,
): DecisionOption[] {
  return values.map((value) => ({
    id: value,
    catalogRef: `${ownerId}/${scope}/${value}`,
    label: labelFn(value),
  }));
}

function cadenceOptionsForScope(
  ownerId: string,
  scope: 'research' | 'librarian' | 'trend',
): DecisionOption[] {
  const defs =
    scope === 'research'
      ? RESEARCH_CADENCE_OPTION_DEFS
      : scope === 'librarian'
        ? LIBRARIAN_CADENCE_OPTION_DEFS
        : TREND_CADENCE_OPTION_DEFS;
  return defs.map((entry) => ({
    id: entry.id,
    catalogRef: `${ownerId}/${entry.suffix}`,
    label: entry.label,
    defaultPosition: entry.position,
  }));
}

function selectedCadenceOptionId(
  ownerId: string,
  scope: 'research' | 'librarian' | 'trend',
  minutes: number | null,
): string {
  const band = cadenceBandForMinutes(minutes, scope);
  const defs =
    scope === 'research'
      ? RESEARCH_CADENCE_OPTION_DEFS
      : scope === 'librarian'
        ? LIBRARIAN_CADENCE_OPTION_DEFS
        : TREND_CADENCE_OPTION_DEFS;
  const match = defs.find((entry) => entry.suffix === band.catalogRef);
  return match?.id ?? 'standard';
}

/** Bucket cadenceMinutes into a text-first band (no raw minutes on canvas). */
export function cadenceBandForMinutes(
  minutes: number | null,
  scope: 'research' | 'librarian' | 'trend',
): { catalogRef: string; label: string; position: OptionAnchorPosition } {
  if (minutes == null) {
    return { catalogRef: `${scope}_standard`, label: 'Standard cadence', position: 'typical' };
  }
  if (scope === 'trend') {
    if (minutes <= 10) {
      return { catalogRef: 'trend_microstructure', label: 'Microstructure cadence', position: 'min' };
    }
    if (minutes <= 30) {
      return { catalogRef: 'trend_intraday', label: 'Intraday cadence', position: 'typical' };
    }
    return { catalogRef: 'trend_research', label: 'Research cadence', position: 'max' };
  }
  if (minutes <= 60) {
    return { catalogRef: `${scope}_active`, label: 'Active cadence', position: 'min' };
  }
  if (minutes <= 360) {
    return { catalogRef: `${scope}_standard`, label: 'Standard cadence', position: 'typical' };
  }
  return { catalogRef: `${scope}_slow`, label: 'Slow cadence', position: 'max' };
}

function membersOfType(
  members: BuildOptionAnchorsInput['members'],
  type: string,
): BuildOptionAnchorsInput['members'] {
  return members.filter((member) => member.type === type);
}

/**
 * Resolve template_input owner from `target.moduleIndex` (D-191).
 * Prefer index-aligned members when the full template set is present; otherwise
 * pick the Nth member of that module type.
 */
export function ownerModuleIdForTemplateInput(
  templateModules: readonly { type: string }[],
  members: BuildOptionAnchorsInput['members'],
  moduleIndex: number,
): string | null {
  const templateMod = templateModules[moduleIndex];
  if (!templateMod) return null;
  if (members.length === templateModules.length) {
    const aligned = members[moduleIndex];
    if (aligned && aligned.type === templateMod.type) return aligned.id;
  }
  let ordinal = 0;
  for (let i = 0; i < moduleIndex; i++) {
    if (templateModules[i]?.type === templateMod.type) ordinal += 1;
  }
  const ofType = membersOfType(members, templateMod.type);
  return ofType[ordinal]?.id ?? ofType[0]?.id ?? null;
}

export function optionAnchorCatalogSlice(): {
  branchTypes: NonNullable<StrategyCatalog['decisionTreeBranchTaxonomy']>['branchTypes'];
  leverToolsByScope: NonNullable<StrategyCatalog['deterministicToolCatalog']>['leverToolsByScope'];
  recoveryLadderTemplates: StrategyCatalog['recoveryLadderTemplates'];
  researchAndTrainingTools: NonNullable<
    StrategyCatalog['deterministicToolCatalog']
  >['researchAndTrainingTools'];
} {
  return {
    branchTypes: catalog.decisionTreeBranchTaxonomy?.branchTypes ?? [],
    leverToolsByScope: catalog.deterministicToolCatalog?.leverToolsByScope ?? {},
    recoveryLadderTemplates: catalog.recoveryLadderTemplates ?? [],
    researchAndTrainingTools:
      catalog.deterministicToolCatalog?.researchAndTrainingTools ?? [],
  };
}

export function buildOptionAnchorsForEngine(
  input: BuildOptionAnchorsInput,
): OptionAnchorSpec[] {
  const parsed = BuildOptionAnchorsInput.parse(input);
  const template = getEngineTemplateById(parsed.templateId);
  if (!template) return [];

  const anchors: OptionAnchorSpec[] = [];
  const leverBandRefs = new Set<string>();
  const seenIds = new Set<string>();

  const pushAnchor = (anchor: OptionAnchorSpec): void => {
    if (seenIds.has(anchor.id)) return;
    seenIds.add(anchor.id);
    anchors.push(
      OptionAnchorSpec.parse({
        ...anchor,
        options: withDecisionOptionRouteMeta(anchor.kind, anchor.options ?? []),
        // Always derive intakes from kind (info type) — ignore caller overrides (D-217).
        intakes: intakesForDecisionKind(anchor.kind),
      }),
    );
  };

  const traders = membersOfType(parsed.members, 'trading');
  const researchers = membersOfType(parsed.members, 'research');
  const librarians = membersOfType(parsed.members, 'librarian');
  const libraries = membersOfType(parsed.members, 'library');
  const trends = membersOfType(parsed.members, 'trend');
  const analyzers = membersOfType(parsed.members, 'analyzer');
  const liveApis = membersOfType(parsed.members, 'live_api');
  const firstTrader = traders[0];
  const branchTypes = catalog.decisionTreeBranchTaxonomy?.branchTypes ?? [];

  const hasPhilosophyInput = template.inputs.some((entry) =>
    entry.key.toLowerCase().includes('philosophy'),
  );

  for (const templateInput of template.inputs) {
    const catalogRef = templateInput.key;
    if (catalogRef.toLowerCase().includes('philosophy')) continue;
    const ownerForInput = ownerModuleIdForTemplateInput(
      template.modules,
      parsed.members,
      templateInput.target.moduleIndex,
    );
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'template_input', catalogRef),
      kind: 'template_input',
      catalogRef,
      label: templateInput.label,
      layer: 'strategic',
      parentAnchorId: null,
      ownerModuleId: ownerForInput,
      ownerEngineId: parsed.engineId,
      options: [],
      selectedOptionId: null,
      intakes: DEFAULT_DECISION_INTAKES,
    });
  }

  // ── Trading decisions (D-208): one strategy node + one branch node per trader ─
  for (const trader of traders) {
    const families = resolveStrategyFamiliesForTrader(trader.config, template.category);
    const strategyCatalogRef = `${trader.id}/strategy_palette`;
    const strategyAnchorId = buildOptionAnchorId(
      parsed.engineId,
      'strategy_family',
      strategyCatalogRef,
    );
    const familyOptions: DecisionOption[] = families.map((familyId) => ({
      id: familyId,
      catalogRef: `${trader.id}/${familyId}`,
      label: familyLabel(familyId),
    }));

    pushAnchor({
      id: strategyAnchorId,
      kind: 'strategy_family',
      catalogRef: strategyCatalogRef,
      label: 'Strategy family',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: trader.id,
      ownerEngineId: parsed.engineId,
      options: familyOptions,
      selectedOptionId: families[0] ?? null,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const branchOptions: DecisionOption[] = branchTypes.map((branch) => ({
      id: branch.id,
      catalogRef: `${trader.id}/${branch.id}`,
      label: humanizeToken(branch.role),
    }));
    if (branchOptions.length > 0) {
      pushAnchor({
        id: buildOptionAnchorId(parsed.engineId, 'branch_role', `${trader.id}/branch_palette`),
        kind: 'branch_role',
        catalogRef: `${trader.id}/branch_palette`,
        label: 'Decision branch',
        layer: 'tactical',
        parentAnchorId: null,
        ownerModuleId: trader.id,
        ownerEngineId: parsed.engineId,
        options: branchOptions,
        selectedOptionId: branchOptions[0]?.id ?? null,
        intakes: DEFAULT_DECISION_INTAKES,
      });
    }

    for (const branch of branchTypes) {
      for (const lever of branch.levers ?? []) {
        leverBandRefs.add(lever);
        pushAnchor({
          id: buildOptionAnchorId(parsed.engineId, 'lever_band', `${trader.id}/${lever}`),
          kind: 'lever_band',
          catalogRef: lever,
          label: humanizeToken(lever),
          layer: 'tactical',
          parentAnchorId: strategyAnchorId,
          ownerModuleId: trader.id,
          ownerEngineId: parsed.engineId,
          defaultPosition: 'typical',
          options: [],
          intakes: DEFAULT_DECISION_INTAKES,
        });
      }
    }
  }

  if (firstTrader) {
    const tacticalTools = catalog.deterministicToolCatalog?.leverToolsByScope?.tactical ?? [];
    for (const tool of tacticalTools) {
      const bandRef = tool.bandRef;
      if (!bandRef || leverBandRefs.has(bandRef)) continue;
      leverBandRefs.add(bandRef);
      pushAnchor({
        id: buildOptionAnchorId(parsed.engineId, 'lever_band', bandRef),
        kind: 'lever_band',
        catalogRef: bandRef,
        label: humanizeToken(bandRef),
        layer: 'tactical',
        parentAnchorId: null,
        ownerModuleId: firstTrader.id,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
        options: [],
        intakes: DEFAULT_DECISION_INTAKES,
      });
    }

    const recoveryTemplate = catalog.recoveryLadderTemplates?.[0];
    if (recoveryTemplate) {
      const recoveryCatalogRef = recoveryTemplate.id;
      const recoveryAnchorId = buildOptionAnchorId(
        parsed.engineId,
        'recovery_phase',
        recoveryCatalogRef,
      );
      const phaseOptions: DecisionOption[] = recoveryTemplate.phases.map((phase) => ({
        id: phase,
        catalogRef: `${recoveryTemplate.id}/${phase}`,
        label: humanizeToken(phase),
      }));
      pushAnchor({
        id: recoveryAnchorId,
        kind: 'recovery_phase',
        catalogRef: recoveryCatalogRef,
        label: recoveryTemplate.name ? humanizeToken(recoveryTemplate.name) : 'Recovery ladder',
        layer: 'tactical',
        parentAnchorId: null,
        ownerModuleId: firstTrader.id,
        ownerEngineId: parsed.engineId,
        options: phaseOptions,
        selectedOptionId: recoveryTemplate.phases[0] ?? null,
        intakes: DEFAULT_DECISION_INTAKES,
      });
    }
  }

  // ── Research curator trees (D-192 sibling roots) ────────────────────────
  for (const researcher of researchers) {
    const subtype =
      readStringConfig(researcher.config, 'researchSubtype') ?? 'external_web';
    const subtypeScopeRef = `${researcher.id}/research_subtype`;
    const subtypeId = buildOptionAnchorId(parsed.engineId, 'research_subtype', subtypeScopeRef);

    pushAnchor({
      id: subtypeId,
      kind: 'research_subtype',
      catalogRef: subtypeScopeRef,
      label: 'Research subtype',
      layer: 'strategic',
      parentAnchorId: null,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
      options: enumDecisionOptions(researcher.id, 'research_subtype', ResearchSubtype.options),
      selectedOptionId: subtype,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const curiosity =
      readStringConfig(researcher.config, 'curiosity') ?? 'balanced';
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'curiosity_band', `${researcher.id}/curiosity_band`),
      kind: 'curiosity_band',
      catalogRef: `${researcher.id}/curiosity_band`,
      label: 'Curiosity band',
      layer: 'strategic',
      parentAnchorId: null,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
      options: CURIOSITY_BANDS.map((band) => ({
        id: band,
        catalogRef: `${researcher.id}/${band}`,
        label: humanizeToken(band),
        defaultPosition:
          band === 'conservative' ? 'min' : band === 'exploratory' ? 'max' : 'typical',
      })),
      selectedOptionId: curiosity,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const admission =
      readStringConfig(researcher.config, 'admissionMode') ?? 'auto_admit_validated';
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'admission_mode', `${researcher.id}/admission_mode`),
      kind: 'admission_mode',
      catalogRef: `${researcher.id}/admission_mode`,
      label: 'Admission mode',
      layer: 'policy',
      parentAnchorId: null,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
      options: enumDecisionOptions(researcher.id, 'admission_mode', RESEARCH_ADMISSION_MODES),
      selectedOptionId: admission,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const cadenceMinutes = readNumberConfig(researcher.config, 'cadenceMinutes');
    const cadence = cadenceBandForMinutes(cadenceMinutes, 'research');
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'cadence_band', `${researcher.id}/cadence_band`),
      kind: 'cadence_band',
      catalogRef: `${researcher.id}/cadence_band`,
      label: 'Research cadence',
      layer: 'strategic',
      parentAnchorId: null,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
      options: cadenceOptionsForScope(researcher.id, 'research'),
      selectedOptionId: selectedCadenceOptionId(researcher.id, 'research', cadenceMinutes),
      defaultPosition: cadence.position,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const pipelineCatalogRef = `${researcher.id}/research_pipeline`;
    const pipelineId = buildOptionAnchorId(
      parsed.engineId,
      'branch_role',
      pipelineCatalogRef,
    );
    pushAnchor({
      id: pipelineId,
      kind: 'branch_role',
      catalogRef: pipelineCatalogRef,
      label: 'Research pipeline',
      layer: 'strategic',
      parentAnchorId: null,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
      options: [
        {
          id: 'discover',
          catalogRef: `${researcher.id}/discover`,
          label: 'Discover',
        },
        {
          id: 'verify_sanity',
          catalogRef: `${researcher.id}/verify_sanity`,
          label: 'Verify Sanity',
        },
      ],
      selectedOptionId: 'discover',
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const researchTools =
      catalog.deterministicToolCatalog?.researchAndTrainingTools?.filter(
        (tool) => tool.scope === 'research',
      ) ?? [];
    for (const tool of researchTools) {
      pushAnchor({
        id: buildOptionAnchorId(
          parsed.engineId,
          'lever_band',
          `${researcher.id}/${tool.id}`,
        ),
        kind: 'lever_band',
        catalogRef: tool.id,
        label: humanizeToken(tool.id),
        layer: 'strategic',
        parentAnchorId: pipelineId,
        ownerModuleId: researcher.id,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
        options: [],
        intakes: DEFAULT_DECISION_INTAKES,
      });
    }
  }

  // ── Librarian trees ──────────────────────────────────────────────────────
  for (const librarian of librarians) {
    const subtype =
      readStringConfig(librarian.config, 'librarianSubtype') ?? 'librarian_relevance';
    const subtypeScopeRef = `${librarian.id}/librarian_subtype`;
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'librarian_subtype', subtypeScopeRef),
      kind: 'librarian_subtype',
      catalogRef: subtypeScopeRef,
      label: 'Librarian subtype',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: librarian.id,
      ownerEngineId: parsed.engineId,
      options: enumDecisionOptions(librarian.id, 'librarian_subtype', LibrarianSubtype.options),
      selectedOptionId: subtype,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const cadenceMinutes = readNumberConfig(librarian.config, 'cadenceMinutes');
    const cadence = cadenceBandForMinutes(cadenceMinutes, 'librarian');
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'cadence_band', `${librarian.id}/cadence_band`),
      kind: 'cadence_band',
      catalogRef: `${librarian.id}/cadence_band`,
      label: 'Librarian cadence',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: librarian.id,
      ownerEngineId: parsed.engineId,
      options: cadenceOptionsForScope(librarian.id, 'librarian'),
      selectedOptionId: selectedCadenceOptionId(librarian.id, 'librarian', cadenceMinutes),
      defaultPosition: cadence.position,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const relevanceCatalogRef = `${librarian.id}/relevance`;
    const relevanceId = buildOptionAnchorId(
      parsed.engineId,
      'branch_role',
      relevanceCatalogRef,
    );
    pushAnchor({
      id: relevanceId,
      kind: 'branch_role',
      catalogRef: relevanceCatalogRef,
      label: 'Relevance pipeline',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: librarian.id,
      ownerEngineId: parsed.engineId,
      options: [
        {
          id: 'relevance_curate',
          catalogRef: `${librarian.id}/relevance_curate`,
          label: 'Relevance Curate',
        },
      ],
      selectedOptionId: 'relevance_curate',
      intakes: DEFAULT_DECISION_INTAKES,
    });

    for (const weight of ['topical', 'freshness', 'evidence_fit'] as const) {
      pushAnchor({
        id: buildOptionAnchorId(
          parsed.engineId,
          'lever_band',
          `${librarian.id}/relevance_${weight}`,
        ),
        kind: 'lever_band',
        catalogRef: `relevance_${weight}`,
        label: humanizeToken(`relevance_${weight}`),
        layer: 'tactical',
        parentAnchorId: relevanceId,
        ownerModuleId: librarian.id,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
        options: [],
        intakes: DEFAULT_DECISION_INTAKES,
      });
    }
  }

  // ── Library class roots ──────────────────────────────────────────────────
  const libraryClassOptions = LibraryClass.options.filter((klass) => klass !== 'engine_data_hub');
  for (const library of libraries) {
    const klass = readStringConfig(library.config, 'libraryClass') ?? 'topic_runtime';
    if (klass === 'engine_data_hub') continue;
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'library_class', `${library.id}/library_class`),
      kind: 'library_class',
      catalogRef: `${library.id}/library_class`,
      label: 'Library class',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: library.id,
      ownerEngineId: parsed.engineId,
      options: enumDecisionOptions(library.id, 'library_class', libraryClassOptions),
      selectedOptionId: klass,
      intakes: DEFAULT_DECISION_INTAKES,
    });
  }

  // ── Trend posture (research + hybrid packs) ──────────────────────────────
  for (const trend of trends) {
    const posture =
      readStringConfig(trend.config, 'trendPosture') ?? 'session_intraday';
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'trend_posture', `${trend.id}/trend_posture`),
      kind: 'trend_posture',
      catalogRef: `${trend.id}/trend_posture`,
      label: 'Trend posture',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: trend.id,
      ownerEngineId: parsed.engineId,
      options: enumDecisionOptions(trend.id, 'trend_posture', TrendPosture.options),
      selectedOptionId: posture,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const cadenceMinutes = readNumberConfig(trend.config, 'cadenceMinutes');
    const cadence = cadenceBandForMinutes(cadenceMinutes, 'trend');
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'cadence_band', `${trend.id}/cadence_band`),
      kind: 'cadence_band',
      catalogRef: `${trend.id}/cadence_band`,
      label: 'Trend cadence',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: trend.id,
      ownerEngineId: parsed.engineId,
      options: cadenceOptionsForScope(trend.id, 'trend'),
      selectedOptionId: selectedCadenceOptionId(trend.id, 'trend', cadenceMinutes),
      defaultPosition: cadence.position,
      intakes: DEFAULT_DECISION_INTAKES,
    });
  }

  // ── Analyzer emit mode (output-path options only — D-217) ────────────────
  for (const analyzer of analyzers) {
    const emitModes = emitModesForAnalyzerOutput(analyzer.config);
    const mode =
      readStringConfig(analyzer.config, 'emitMode') ?? emitModes[0] ?? 'verify_loopback';
    const selected = emitModes.includes(mode as AnalyzerEmitMode)
      ? mode
      : (emitModes[0] ?? mode);
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'emit_mode', `${analyzer.id}/emit_mode`),
      kind: 'emit_mode',
      catalogRef: `${analyzer.id}/emit_mode`,
      label: 'Emit mode',
      layer: 'policy',
      parentAnchorId: null,
      ownerModuleId: analyzer.id,
      ownerEngineId: parsed.engineId,
      options: enumDecisionOptions(analyzer.id, 'emit_mode', emitModes),
      selectedOptionId: selected,
      intakes: intakesForDecisionKind('emit_mode'),
    });
  }

  // ── Live API process anchors (D-184 sibling roots) ─────────────────────
  for (const live of liveApis) {
    const feed = readStringConfig(live.config, 'feedClass') ?? 'iex_free';
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'feed_class', `${live.id}/feed_class`),
      kind: 'feed_class',
      catalogRef: `${live.id}/feed_class`,
      label: 'Feed class',
      layer: 'execution',
      parentAnchorId: null,
      ownerModuleId: live.id,
      ownerEngineId: parsed.engineId,
      options: LIVE_API_FEED_CLASSES.map((feedClass) => ({
        id: feedClass,
        catalogRef: `${live.id}/${feedClass}`,
        label: humanizeToken(feedClass),
      })),
      selectedOptionId: feed,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const queryPolicy =
      readStringConfig(live.config, 'queryPolicy') ?? 'static_only';
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'query_policy', `${live.id}/query_policy`),
      kind: 'query_policy',
      catalogRef: `${live.id}/query_policy`,
      label: 'Query policy',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: live.id,
      ownerEngineId: parsed.engineId,
      options: enumDecisionOptions(live.id, 'query_policy', LiveApiQueryPolicy.options),
      selectedOptionId: queryPolicy,
      intakes: DEFAULT_DECISION_INTAKES,
    });

    const schedulePolicy =
      readStringConfig(live.config, 'schedulePolicy') ?? 'module_poll';
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'schedule_policy',
        `${live.id}/schedule_policy`,
      ),
      kind: 'schedule_policy',
      catalogRef: `${live.id}/schedule_policy`,
      label: 'Schedule policy',
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: live.id,
      ownerEngineId: parsed.engineId,
      options: enumDecisionOptions(live.id, 'schedule_policy', LiveApiSchedulePolicy.options),
      selectedOptionId: schedulePolicy,
      intakes: DEFAULT_DECISION_INTAKES,
    });
  }

  // Strategic research levers (inspector-only) — parent under research pipeline decision
  if (researchers.length > 0) {
    const ownerId = researchers[0]!.id;
    const pipelineParentId = buildOptionAnchorId(
      parsed.engineId,
      'branch_role',
      `${ownerId}/research_pipeline`,
    );
    const strategicTools =
      catalog.deterministicToolCatalog?.leverToolsByScope?.strategic ?? [];
    for (const tool of strategicTools) {
      const bandRef = tool.bandRef;
      if (!bandRef || leverBandRefs.has(bandRef)) continue;
      leverBandRefs.add(bandRef);
      pushAnchor({
        id: buildOptionAnchorId(parsed.engineId, 'lever_band', `${ownerId}/${bandRef}`),
        kind: 'lever_band',
        catalogRef: bandRef,
        label: humanizeToken(bandRef),
        layer: 'strategic',
        parentAnchorId: pipelineParentId,
        ownerModuleId: ownerId,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
        options: [],
        intakes: DEFAULT_DECISION_INTAKES,
      });
    }
  }

  // Training-scope levers (inspector-only) for simulation templates
  const isSimulation = template.category === 'simulation';
  if (isSimulation && firstTrader) {
    const trainingTools =
      catalog.deterministicToolCatalog?.researchAndTrainingTools?.filter(
        (tool) => tool.scope === 'training',
      ) ?? [];
    for (const tool of trainingTools) {
      pushAnchor({
        id: buildOptionAnchorId(
          parsed.engineId,
          'lever_band',
          `${firstTrader.id}/${tool.id}`,
        ),
        kind: 'lever_band',
        catalogRef: tool.id,
        label: humanizeToken(tool.id),
        layer: 'policy',
        parentAnchorId: null,
        ownerModuleId: firstTrader.id,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
        options: [],
        intakes: DEFAULT_DECISION_INTAKES,
      });
    }
  }

  const isResearchHeavy =
    researchers.length > 0 ||
    template.category === 'research' ||
    template.category === 'trend_research';

  if (hasPhilosophyInput || traders.length > 0 || isResearchHeavy) {
    for (const axis of PHILOSOPHY_AXIS_CATALOG) {
      if (
        (isResearchHeavy && !hasPhilosophyInput && traders.length === 0) ||
        isSimulation
      ) {
        if (!RESEARCH_PHILOSOPHY_AXIS_IDS.has(axis.id)) continue;
      }
      pushAnchor({
        id: buildOptionAnchorId(parsed.engineId, 'philosophy_axis', axis.id),
        kind: 'philosophy_axis',
        catalogRef: axis.id,
        label: axis.label,
        layer: axis.layer,
        parentAnchorId: null,
        ownerModuleId: null,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
        options: PHILOSOPHY_POSITION_OPTIONS.map((option) => ({
          ...option,
          catalogRef: `${axis.id}/${option.id}`,
        })),
        selectedOptionId: 'typical',
        intakes: DEFAULT_DECISION_INTAKES,
      });
    }
  }

  // Template seeds constrain option catalogs / defaults (D-202).
  const seeds = resolveEngineDecisionSeeds(template);
  return applyDecisionSeedConstraints(
    anchors,
    seeds,
    parsed.members,
    template.modules,
  );
}

/** D-202 alias: unified decision nodes share the option-anchor builder. */
export const buildDecisionNodesForEngine = buildOptionAnchorsForEngine;

/**
 * Kinds shown as canvas decision cards (D-213 / D-217).
 * Only **output-routing** choices: strategy/branch/recovery path, analyzer emit,
 * live feed class. Module identity (subtype / library class / trend posture) stays
 * inspector-only — those classify the node, they do not route outs.
 */
export const CANVAS_PRIMARY_DECISION_KINDS = new Set<string>([
  'strategy_family',
  'branch_role',
  'recovery_phase',
  'emit_mode',
  'feed_class',
]);

/**
 * Canvas-visible decision nodes. Identity/tuning kinds (subtype, library class,
 * posture, curiosity, cadence, query/schedule) stay inspector-only (D-208, D-213, D-217).
 */
export function canvasVisibleOptionAnchors(
  anchors: readonly OptionAnchorSpec[],
): OptionAnchorSpec[] {
  return anchors.filter(
    (anchor) =>
      anchor.kind !== 'lever_band' &&
      anchor.kind !== 'template_input' &&
      anchor.kind !== 'philosophy_axis' &&
      CANVAS_PRIMARY_DECISION_KINDS.has(anchor.kind),
  );
}

/** D-202 alias for canvas-visible unified decision nodes. */
export const canvasVisibleDecisionNodes = canvasVisibleOptionAnchors;
