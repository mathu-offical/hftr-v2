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
    };
  };
};

const catalog = seededStrategyCatalog as StrategyCatalog;

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

function tradingMembers(
  members: BuildOptionAnchorsInput['members'],
): BuildOptionAnchorsInput['members'] {
  return members.filter((member) => member.type === 'trading');
}

export function optionAnchorCatalogSlice(): {
  branchTypes: NonNullable<StrategyCatalog['decisionTreeBranchTaxonomy']>['branchTypes'];
  leverToolsByScope: NonNullable<StrategyCatalog['deterministicToolCatalog']>['leverToolsByScope'];
  recoveryLadderTemplates: StrategyCatalog['recoveryLadderTemplates'];
} {
  return {
    branchTypes: catalog.decisionTreeBranchTaxonomy?.branchTypes ?? [],
    leverToolsByScope: catalog.deterministicToolCatalog?.leverToolsByScope ?? {},
    recoveryLadderTemplates: catalog.recoveryLadderTemplates ?? [],
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

  const pushAnchor = (anchor: OptionAnchorSpec): void => {
    anchors.push(OptionAnchorSpec.parse(anchor));
  };

  for (const templateInput of template.inputs) {
    const catalogRef = templateInput.key;
    pushAnchor({
      id: buildOptionAnchorId(parsed.engineId, 'template_input', catalogRef),
      kind: 'template_input',
      catalogRef,
      label: templateInput.label,
      layer: 'strategic',
      parentAnchorId: null,
      ownerModuleId: null,
      ownerEngineId: parsed.engineId,
    });
  }

  const traders = tradingMembers(parsed.members);
  const firstTrader = traders[0];
  const branchTypes = catalog.decisionTreeBranchTaxonomy?.branchTypes ?? [];

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
          const leverCatalogRef = lever;
          leverBandRefs.add(leverCatalogRef);
          pushAnchor({
            id: buildOptionAnchorId(parsed.engineId, 'lever_band', leverCatalogRef),
            kind: 'lever_band',
            catalogRef: leverCatalogRef,
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

  const hasPhilosophyInput = template.inputs.some((entry) =>
    entry.key.toLowerCase().includes('philosophy'),
  );
  if (hasPhilosophyInput || traders.length > 0) {
    for (const axis of PHILOSOPHY_AXIS_CATALOG) {
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
      });
    }
  }

  return anchors;
}

/**
 * Canvas-visible subset (D-169): decision anchors that belong on the engine
 * chrome. Lever bands stay inspector-only to avoid flooding the desk.
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
      anchor.kind === 'philosophy_axis',
  );
}
