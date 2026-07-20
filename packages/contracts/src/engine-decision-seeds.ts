/**
 * D-202: resolve and apply engine template decision-node seeds.
 * Templates declare stable choice points; builder fills catalogs within bounds.
 * Category palettes map stock/crypto/event desks onto seeded-strategy-catalog families.
 */
import { MODULE_REQUIRED_DECISION_KINDS, type ModuleType } from './modules';
import type {
  DecisionOption,
  OptionAnchorKind,
  OptionAnchorSpec,
} from './option-anchors';
import type { EngineTemplate, EngineTemplateDecisionSeed } from './templates';

/**
 * Catalog strategy families preferred per engine category (D-174 / D-202).
 * Grounded in seeded-strategy-catalog horizons and desk intent:
 * - day: ORB + gap-and-go + VWAP fade
 * - HFT: market making / microstructure
 * - crypto: intraday trend + reversion + pairs/relative value
 * - long_term: multi-day trend + compression + lead-lag themes
 * - prediction: reversion + relative value until dedicated event families ship
 * - simulation: day palette (gate) unless parent mimic overrides
 */
export const CATEGORY_STRATEGY_PALETTE: Readonly<
  Record<EngineTemplate['category'], readonly string[]>
> = {
  day_trading: ['strat-001', 'strat-002', 'strat-005'],
  high_frequency: ['strat-007'],
  crypto: ['strat-003', 'strat-005', 'strat-008'],
  prediction: ['strat-005', 'strat-008'],
  long_term: ['strat-003', 'strat-004', 'strat-009'],
  simulation: ['strat-001', 'strat-002', 'strat-005'],
  trend_research: [],
  research: [],
};

/** Research pipeline branch options (discover → verify). */
export const RESEARCH_PIPELINE_OPTION_REFS = ['discover', 'verify_sanity'] as const;

function isModuleTypeKey(
  type: string,
): type is keyof typeof MODULE_REQUIRED_DECISION_KINDS {
  return type in MODULE_REQUIRED_DECISION_KINDS;
}

/**
 * Derive decision seeds from template modules + required kinds.
 * Explicit `template.decisionNodes` overrides when present.
 */
export function deriveDecisionSeedsFromModules(
  template: EngineTemplate,
): EngineTemplateDecisionSeed[] {
  const seeds: EngineTemplateDecisionSeed[] = [];
  const palette = CATEGORY_STRATEGY_PALETTE[template.category] ?? [];

  template.modules.forEach((mod, index) => {
    if (!isModuleTypeKey(mod.type)) return;
    const kinds = MODULE_REQUIRED_DECISION_KINDS[mod.type];
    for (const kind of kinds) {
      if (kind === 'branch_role' && mod.type === 'research') {
        seeds.push({
          kind,
          ownerModuleIndex: index,
          optionRefs: [...RESEARCH_PIPELINE_OPTION_REFS],
          defaultSelectedRef: 'discover',
        });
        continue;
      }
      if (kind === 'strategy_family' && palette.length > 0) {
        seeds.push({
          kind,
          ownerModuleIndex: index,
          optionRefs: [...palette],
        });
        continue;
      }
      if (kind === 'branch_role' && mod.type === 'librarian') {
        seeds.push({
          kind,
          ownerModuleIndex: index,
          optionRefs: ['relevance_curate'],
          defaultSelectedRef: 'relevance_curate',
        });
        continue;
      }
      seeds.push({ kind, ownerModuleIndex: index });
    }
  });

  return seeds;
}

/** Explicit template seeds win; otherwise derive from modules. */
export function resolveEngineDecisionSeeds(
  template: EngineTemplate,
): EngineTemplateDecisionSeed[] {
  if (template.decisionNodes && template.decisionNodes.length > 0) {
    return template.decisionNodes;
  }
  return deriveDecisionSeedsFromModules(template);
}

export function strategyPaletteForCategory(
  category: EngineTemplate['category'],
): readonly string[] {
  return CATEGORY_STRATEGY_PALETTE[category] ?? [];
}

/** Prefer configured families; fall back to category palette (empty prediction, etc.). */
export function resolveStrategyFamiliesForTrader(
  config: Record<string, unknown> | undefined,
  category: EngineTemplate['category'],
): string[] {
  const raw = config?.strategyFamilies;
  if (Array.isArray(raw)) {
    const listed = raw.filter((entry): entry is string => typeof entry === 'string');
    if (listed.length > 0) return listed;
  }
  return [...strategyPaletteForCategory(category)];
}

function optionMatchesRef(option: DecisionOption, ref: string): boolean {
  return (
    option.id === ref ||
    option.catalogRef === ref ||
    option.catalogRef.endsWith(`/${ref}`) ||
    option.catalogRef.endsWith(ref)
  );
}

/**
 * Apply seed optionRefs / defaultSelectedRef onto built decision nodes.
 * Does not invent missing kinds (builder owns emission); only constrains catalogs.
 */
export function applyDecisionSeedConstraints(
  anchors: OptionAnchorSpec[],
  seeds: readonly EngineTemplateDecisionSeed[],
  members: ReadonlyArray<{ id: string; type: string }>,
  templateModules: readonly { type: string }[],
): OptionAnchorSpec[] {
  if (seeds.length === 0) return anchors;

  const ownerIdForIndex = (index: number | null): string | null => {
    if (index == null) return null;
    if (members.length === templateModules.length) {
      return members[index]?.id ?? null;
    }
    const wantType = templateModules[index]?.type;
    if (!wantType) return null;
    return members.find((m) => m.type === wantType)?.id ?? null;
  };

  return anchors.map((anchor) => {
    const matching = seeds.filter((seed) => {
      if (seed.kind !== anchor.kind) return false;
      const ownerId = ownerIdForIndex(seed.ownerModuleIndex);
      if (seed.ownerModuleIndex == null) {
        return anchor.ownerModuleId == null;
      }
      return ownerId != null && anchor.ownerModuleId === ownerId;
    });
    if (matching.length === 0) return anchor;

    let next: OptionAnchorSpec = anchor;
    for (const seed of matching) {
      if (seed.optionRefs && seed.optionRefs.length > 0 && next.options.length > 0) {
        const filtered = next.options.filter((opt) =>
          seed.optionRefs!.some((ref) => optionMatchesRef(opt, ref)),
        );
        if (filtered.length > 0) {
          next = { ...next, options: filtered };
        }
      }
      if (seed.defaultSelectedRef) {
        const has =
          next.options.some((opt) => optionMatchesRef(opt, seed.defaultSelectedRef!)) ||
          next.selectedOptionId === seed.defaultSelectedRef;
        if (has || next.options.length === 0) {
          const selected =
            next.options.find((opt) => optionMatchesRef(opt, seed.defaultSelectedRef!))
              ?.id ?? seed.defaultSelectedRef;
          next = { ...next, selectedOptionId: selected };
        }
      }
      if (seed.connectionMode) {
        next = { ...next, connectionMode: seed.connectionMode };
      }
    }
    return next;
  });
}

/** Type guard helper for tests / UI. */
export function isDecisionKind(value: string): value is OptionAnchorKind {
  return (
    value === 'template_input' ||
    value === 'strategy_family' ||
    value === 'branch_role' ||
    value === 'lever_band' ||
    value === 'recovery_phase' ||
    value === 'philosophy_axis' ||
    value === 'research_subtype' ||
    value === 'curiosity_band' ||
    value === 'librarian_subtype' ||
    value === 'library_class' ||
    value === 'trend_posture' ||
    value === 'cadence_band' ||
    value === 'admission_mode' ||
    value === 'emit_mode' ||
    value === 'feed_class' ||
    value === 'query_policy' ||
    value === 'schedule_policy'
  );
}

/** Exhaustive module-type check used by derive (unused types stay silent). */
export function moduleTypesWithDecisionNeeds(): readonly ModuleType[] {
  return Object.keys(MODULE_REQUIRED_DECISION_KINDS) as ModuleType[];
}
