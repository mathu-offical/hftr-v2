import { z } from 'zod';
import seededStrategyCatalog from '../../db/src/seed/catalogs/seeded-strategy-catalog.json';
import { PHILOSOPHY_AXIS_CATALOG } from './philosophy';
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
]);
export type OptionAnchorKind = z.infer<typeof OptionAnchorKind>;

export const OptionAnchorPosition = z.enum(['min', 'typical', 'max']);
export type OptionAnchorPosition = z.infer<typeof OptionAnchorPosition>;

export const OptionAnchorLayer = z.enum(['strategic', 'tactical', 'execution', 'policy']);
export type OptionAnchorLayer = z.infer<typeof OptionAnchorLayer>;

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
});
export type OptionAnchorSpec = z.infer<typeof OptionAnchorSpec>;

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

function readStrategyFamilies(config: Record<string, unknown> | undefined): string[] {
  const raw = config?.strategyFamilies;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string');
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
    anchors.push(OptionAnchorSpec.parse(anchor));
  };

  const traders = membersOfType(parsed.members, 'trading');
  const researchers = membersOfType(parsed.members, 'research');
  const librarians = membersOfType(parsed.members, 'librarian');
  const libraries = membersOfType(parsed.members, 'library');
  const trends = membersOfType(parsed.members, 'trend');
  const analyzers = membersOfType(parsed.members, 'analyzer');
  const firstTrader = traders[0];
  const branchTypes = catalog.decisionTreeBranchTaxonomy?.branchTypes ?? [];

  for (const templateInput of template.inputs) {
    const catalogRef = templateInput.key;
    const ownerForInput =
      templateInput.key === 'topicScope' || templateInput.key === 'focus'
        ? (researchers[0]?.id ?? traders[0]?.id ?? librarians[0]?.id ?? null)
        : null;
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'template_input', catalogRef),
      kind: 'template_input',
      catalogRef,
      label: templateInput.label,
      layer: 'strategic',
      parentAnchorId: null,
      ownerModuleId: ownerForInput,
      ownerEngineId: parsed.engineId,
    });
  }

  // ── Trading execution tree (existing) ────────────────────────────────────
  for (const trader of traders) {
    const families = readStrategyFamilies(trader.config);
    for (const familyId of families) {
      const familyCatalogRef = `${trader.id}/${familyId}`;
      const familyAnchorId = buildOptionAnchorId(
        parsed.engineId,
        'strategy_family',
        familyCatalogRef,
      );

      pushAnchor({
        id: familyAnchorId,
        kind: 'strategy_family',
        catalogRef: familyCatalogRef,
        label: familyLabel(familyId),
        layer: 'tactical',
        parentAnchorId: null,
        ownerModuleId: trader.id,
        ownerEngineId: parsed.engineId,
      });

      for (const branch of branchTypes) {
        const branchCatalogRef = `${familyCatalogRef}/${branch.id}`;
        const branchAnchorId = buildOptionAnchorId(
          parsed.engineId,
          'branch_role',
          branchCatalogRef,
        );

        pushAnchor({
          id: branchAnchorId,
          kind: 'branch_role',
          catalogRef: branchCatalogRef,
          label: humanizeToken(branch.role),
          layer: 'tactical',
          parentAnchorId: familyAnchorId,
          ownerModuleId: trader.id,
          ownerEngineId: parsed.engineId,
        });

        for (const lever of branch.levers ?? []) {
          leverBandRefs.add(lever);
          pushAnchor({
            id: buildOptionAnchorId(parsed.engineId, 'lever_band', `${trader.id}/${lever}`),
            kind: 'lever_band',
            catalogRef: lever,
            label: humanizeToken(lever),
            layer: 'tactical',
            parentAnchorId: branchAnchorId,
            ownerModuleId: trader.id,
            ownerEngineId: parsed.engineId,
            defaultPosition: 'typical',
          });
        }
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
      });
    }

    const recoveryTemplate = catalog.recoveryLadderTemplates?.[0];
    if (recoveryTemplate) {
      let parentRecoveryId: string | null = null;
      for (const phase of recoveryTemplate.phases) {
        const phaseCatalogRef = `${recoveryTemplate.id}/${phase}`;
        const phaseAnchorId = buildOptionAnchorId(
          parsed.engineId,
          'recovery_phase',
          phaseCatalogRef,
        );
        pushAnchor({
          id: phaseAnchorId,
          kind: 'recovery_phase',
          catalogRef: phaseCatalogRef,
          label: humanizeToken(phase),
          layer: 'tactical',
          parentAnchorId: parentRecoveryId,
          ownerModuleId: firstTrader.id,
          ownerEngineId: parsed.engineId,
        });
        parentRecoveryId = phaseAnchorId;
      }
    }
  }

  // ── Research curator trees (D-180) ───────────────────────────────────────
  for (const researcher of researchers) {
    const subtype =
      readStringConfig(researcher.config, 'researchSubtype') ?? 'external_web';
    const subtypeRef = `${researcher.id}/${subtype}`;
    const subtypeId = buildOptionAnchorId(parsed.engineId, 'research_subtype', subtypeRef);
    pushAnchor({
      id: subtypeId,
      kind: 'research_subtype',
      catalogRef: subtypeRef,
      label: humanizeToken(subtype),
      layer: 'strategic',
      parentAnchorId: null,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
    });

    const curiosity = readStringConfig(researcher.config, 'curiosity') ?? 'balanced';
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'curiosity_band',
        `${researcher.id}/${curiosity}`,
      ),
      kind: 'curiosity_band',
      catalogRef: `${researcher.id}/${curiosity}`,
      label: humanizeToken(curiosity),
      layer: 'strategic',
      parentAnchorId: subtypeId,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
      defaultPosition:
        curiosity === 'conservative' ? 'min' : curiosity === 'exploratory' ? 'max' : 'typical',
    });

    const admission =
      readStringConfig(researcher.config, 'admissionMode') ?? 'auto_admit_validated';
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'admission_mode',
        `${researcher.id}/${admission}`,
      ),
      kind: 'admission_mode',
      catalogRef: `${researcher.id}/${admission}`,
      label: humanizeToken(admission),
      layer: 'policy',
      parentAnchorId: subtypeId,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
    });

    const cadence = cadenceBandForMinutes(
      readNumberConfig(researcher.config, 'cadenceMinutes'),
      'research',
    );
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'cadence_band',
        `${researcher.id}/${cadence.catalogRef}`,
      ),
      kind: 'cadence_band',
      catalogRef: `${researcher.id}/${cadence.catalogRef}`,
      label: cadence.label,
      layer: 'strategic',
      parentAnchorId: subtypeId,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
      defaultPosition: cadence.position,
    });

    const discoverId = buildOptionAnchorId(
      parsed.engineId,
      'branch_role',
      `${researcher.id}/discover`,
    );
    pushAnchor({
      id: discoverId,
      kind: 'branch_role',
      catalogRef: `${researcher.id}/discover`,
      label: 'Discover',
      layer: 'strategic',
      parentAnchorId: subtypeId,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
    });
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'branch_role',
        `${researcher.id}/verify_sanity`,
      ),
      kind: 'branch_role',
      catalogRef: `${researcher.id}/verify_sanity`,
      label: 'Verify Sanity',
      layer: 'strategic',
      parentAnchorId: discoverId,
      ownerModuleId: researcher.id,
      ownerEngineId: parsed.engineId,
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
        parentAnchorId: discoverId,
        ownerModuleId: researcher.id,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
      });
    }
  }

  // ── Librarian trees ──────────────────────────────────────────────────────
  for (const librarian of librarians) {
    const subtype =
      readStringConfig(librarian.config, 'librarianSubtype') ?? 'librarian_relevance';
    const subtypeRef = `${librarian.id}/${subtype}`;
    const subtypeId = buildOptionAnchorId(parsed.engineId, 'librarian_subtype', subtypeRef);
    pushAnchor({
      id: subtypeId,
      kind: 'librarian_subtype',
      catalogRef: subtypeRef,
      label: humanizeToken(subtype),
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: librarian.id,
      ownerEngineId: parsed.engineId,
    });

    const cadence = cadenceBandForMinutes(
      readNumberConfig(librarian.config, 'cadenceMinutes'),
      'librarian',
    );
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'cadence_band',
        `${librarian.id}/${cadence.catalogRef}`,
      ),
      kind: 'cadence_band',
      catalogRef: `${librarian.id}/${cadence.catalogRef}`,
      label: cadence.label,
      layer: 'tactical',
      parentAnchorId: subtypeId,
      ownerModuleId: librarian.id,
      ownerEngineId: parsed.engineId,
      defaultPosition: cadence.position,
    });

    const curateId = buildOptionAnchorId(
      parsed.engineId,
      'branch_role',
      `${librarian.id}/relevance_curate`,
    );
    pushAnchor({
      id: curateId,
      kind: 'branch_role',
      catalogRef: `${librarian.id}/relevance_curate`,
      label: 'Relevance Curate',
      layer: 'tactical',
      parentAnchorId: subtypeId,
      ownerModuleId: librarian.id,
      ownerEngineId: parsed.engineId,
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
        parentAnchorId: curateId,
        ownerModuleId: librarian.id,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
      });
    }
  }

  // ── Library class roots ──────────────────────────────────────────────────
  for (const library of libraries) {
    const klass = readStringConfig(library.config, 'libraryClass') ?? 'topic_runtime';
    if (klass === 'engine_data_hub') continue;
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'library_class',
        `${library.id}/${klass}`,
      ),
      kind: 'library_class',
      catalogRef: `${library.id}/${klass}`,
      label: humanizeToken(klass),
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: library.id,
      ownerEngineId: parsed.engineId,
    });
  }

  // ── Trend posture (research + hybrid packs) ──────────────────────────────
  for (const trend of trends) {
    const posture =
      readStringConfig(trend.config, 'trendPosture') ?? 'session_intraday';
    const postureRef = `${trend.id}/${posture}`;
    const postureId = buildOptionAnchorId(parsed.engineId, 'trend_posture', postureRef);
    pushAnchor({
      id: postureId,
      kind: 'trend_posture',
      catalogRef: postureRef,
      label: humanizeToken(posture),
      layer: 'tactical',
      parentAnchorId: null,
      ownerModuleId: trend.id,
      ownerEngineId: parsed.engineId,
    });

    const cadence = cadenceBandForMinutes(
      readNumberConfig(trend.config, 'cadenceMinutes'),
      'trend',
    );
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'cadence_band',
        `${trend.id}/${cadence.catalogRef}`,
      ),
      kind: 'cadence_band',
      catalogRef: `${trend.id}/${cadence.catalogRef}`,
      label: cadence.label,
      layer: 'tactical',
      parentAnchorId: postureId,
      ownerModuleId: trend.id,
      ownerEngineId: parsed.engineId,
      defaultPosition: cadence.position,
    });
  }

  // ── Analyzer emit mode ───────────────────────────────────────────────────
  for (const analyzer of analyzers) {
    const mode = readStringConfig(analyzer.config, 'emitMode') ?? 'verify_loopback';
    pushAnchor({
      id: buildOptionAnchorId(
        parsed.engineId,
        'emit_mode',
        `${analyzer.id}/${mode}`,
      ),
      kind: 'emit_mode',
      catalogRef: `${analyzer.id}/${mode}`,
      label: humanizeToken(mode),
      layer: 'policy',
      parentAnchorId: null,
      ownerModuleId: analyzer.id,
      ownerEngineId: parsed.engineId,
    });
  }

  // Strategic research levers (inspector-only) when research members exist
  if (researchers.length > 0) {
    const ownerId = researchers[0]!.id;
    const strategicTools =
      catalog.deterministicToolCatalog?.leverToolsByScope?.strategic ?? [];
    for (const tool of strategicTools) {
      const bandRef = tool.bandRef;
      if (!bandRef || leverBandRefs.has(bandRef)) continue;
      leverBandRefs.add(bandRef);
      pushAnchor({
        id: buildOptionAnchorId(parsed.engineId, 'lever_band', bandRef),
        kind: 'lever_band',
        catalogRef: bandRef,
        label: humanizeToken(bandRef),
        layer: 'strategic',
        parentAnchorId: null,
        ownerModuleId: ownerId,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
      });
    }
  }

  const hasPhilosophyInput = template.inputs.some((entry) =>
    entry.key.toLowerCase().includes('philosophy'),
  );
  const isResearchHeavy =
    researchers.length > 0 ||
    template.category === 'research' ||
    template.category === 'trend_research';

  if (hasPhilosophyInput || traders.length > 0 || isResearchHeavy) {
    for (const axis of PHILOSOPHY_AXIS_CATALOG) {
      if (isResearchHeavy && !hasPhilosophyInput && traders.length === 0) {
        if (!RESEARCH_PHILOSOPHY_AXIS_IDS.has(axis.id)) continue;
      }
      pushAnchor({
        id: buildOptionAnchorId(parsed.engineId, 'philosophy_axis', axis.id),
        kind: 'philosophy_axis',
        catalogRef: axis.id,
        label: axis.label,
        layer: axis.layer,
        parentAnchorId: null,
        // Engine-level axes live in the free right column (not a single member).
        ownerModuleId: null,
        ownerEngineId: parsed.engineId,
        defaultPosition: 'typical',
      });
    }
  }

  return anchors;
}

/**
 * Canvas-visible decision anchors. Lever bands stay inspector-only.
 */
export function canvasVisibleOptionAnchors(
  anchors: readonly OptionAnchorSpec[],
): OptionAnchorSpec[] {
  return anchors.filter(
    (anchor) =>
      anchor.kind === 'template_input' ||
      anchor.kind === 'strategy_family' ||
      anchor.kind === 'branch_role' ||
      anchor.kind === 'recovery_phase' ||
      anchor.kind === 'philosophy_axis' ||
      anchor.kind === 'research_subtype' ||
      anchor.kind === 'curiosity_band' ||
      anchor.kind === 'librarian_subtype' ||
      anchor.kind === 'library_class' ||
      anchor.kind === 'trend_posture' ||
      anchor.kind === 'cadence_band' ||
      anchor.kind === 'admission_mode' ||
      anchor.kind === 'emit_mode',
  );
}
