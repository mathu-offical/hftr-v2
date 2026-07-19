import { z } from 'zod';
import {
  CanvasPosition,
  CapitalAllocationInput,
  ModuleSetupInput,
  ModuleType,
  requiredModuleSetupFields,
  type ModuleSetupField,
} from './modules';
import { SimulationEngineBinding } from './paper-engine';
import {
  ResearchLibraryBinding,
} from './research-library-binding';
import {
  engineCreateSection,
  getEngineTemplateById,
  researchDependenciesForExecutionEngine,
} from './templates';

/**
 * Persisted ENGINE instance contracts (D-028 / D-035 / D-091).
 * An engine is an insertable template graph with master setup (topic, total
 * capital envelope, overall exit) that cascades to members unless overridden.
 * D-091: chrome exposes typed utility buses (motherboard I/O).
 */

/** D-091: engine chrome utility buses (motherboard ports). */
export const EngineUtilityBus = z.enum([
  'data_in',
  'data_out',
  'clock',
  'funds',
  'system_control',
]);
export type EngineUtilityBus = z.infer<typeof EngineUtilityBus>;

/** Which buses an engine template category exposes. */
export function engineUtilityBusesForCategory(
  category: string,
): readonly EngineUtilityBus[] {
  switch (category) {
    case 'research':
    case 'trend_research':
      return ['data_in', 'data_out', 'clock', 'system_control'];
    case 'day_trading':
    case 'crypto':
    case 'prediction':
    case 'long_term':
    case 'hft':
    case 'high_frequency':
    case 'execution':
    case 'simulation':
      return ['data_in', 'data_out', 'clock', 'funds', 'system_control'];
    default:
      return ['data_in', 'data_out', 'clock', 'system_control'];
  }
}

export const EngineUtilityLink = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  toEngineId: z.string().uuid(),
  bus: EngineUtilityBus,
  /** Upstream engine (inter-engine stream) XOR company module (e.g. Master Clock). */
  fromEngineId: z.string().uuid().nullable().optional(),
  fromModuleId: z.string().uuid().nullable().optional(),
  /** Opaque stream id for data_out→data_in (qualitative descriptors only). */
  streamId: z.string().max(80).nullable().optional(),
  streamDescriptor: z.string().max(200).nullable().optional(),
});
export type EngineUtilityLink = z.infer<typeof EngineUtilityLink>;

export const CreateEngineUtilityLinkInput = z
  .object({
    toEngineId: z.string().uuid(),
    bus: EngineUtilityBus,
    fromEngineId: z.string().uuid().optional(),
    fromModuleId: z.string().uuid().optional(),
    streamId: z.string().max(80).optional(),
    streamDescriptor: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    const hasEngine = Boolean(v.fromEngineId);
    const hasModule = Boolean(v.fromModuleId);
    if (hasEngine === hasModule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'exactly_one_of_fromEngineId_or_fromModuleId',
      });
    }
  });
export type CreateEngineUtilityLinkInput = z.infer<typeof CreateEngineUtilityLinkInput>;

/** React Flow handle id for an inbound (target) engine utility bus. */
export function engineUtilityTargetHandleId(bus: EngineUtilityBus): string {
  return `engine-util-${bus}`;
}

/** React Flow handle id for an outbound (source) engine utility bus. */
export function engineUtilitySourceHandleId(bus: EngineUtilityBus): string {
  return `engine-util-${bus}-out`;
}

/**
 * Parse an engine utility handle id into bus + direction.
 * Accepts legacy `engine-util-${bus}` as target for all buses, and
 * `engine-util-${bus}-out` as source (data_out / system_control).
 */
export function parseEngineUtilityHandle(
  handleId: string | null | undefined,
): { bus: EngineUtilityBus; direction: 'in' | 'out' } | null {
  if (!handleId || !handleId.startsWith('engine-util-')) return null;
  const rest = handleId.slice('engine-util-'.length);
  if (rest.endsWith('-out')) {
    const busName = rest.slice(0, -'-out'.length);
    const bus = EngineUtilityBus.safeParse(busName);
    if (!bus.success) return null;
    return { bus: bus.data, direction: 'out' };
  }
  const bus = EngineUtilityBus.safeParse(rest);
  if (!bus.success) return null;
  return { bus: bus.data, direction: 'in' };
}

/** Categories that expose a funds utility bus (execution desks). */
export function engineCategoryExposesFunds(category: string): boolean {
  return engineUtilityBusesForCategory(category).includes('funds');
}

export const DeleteEngineMode = z.enum(['cascade', 'ungroup']);
export type DeleteEngineMode = z.infer<typeof DeleteEngineMode>;

export const EngineCanvasBounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type EngineCanvasBounds = z.infer<typeof EngineCanvasBounds>;

/** Operator-visible setup draft stored on the ENGINE for group chrome. */
export const EngineSetupSnapshot = z.object({
  topicSectors: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  allocationMode: z.enum(['amount', 'percentage']).default('amount'),
  allocationValue: z.string().default(''),
  targetExitLocal: z.string().default(''),
  /**
   * D-173 option-tree decoration: last-synced catalog anchors (rebuild on load;
   * positions map is the mutable operator state).
   */
  optionAnchors: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        catalogRef: z.string(),
        label: z.string(),
        layer: z.string().optional(),
        parentAnchorId: z.string().nullable().optional(),
        ownerModuleId: z.string().nullable().optional(),
        ownerEngineId: z.string(),
        defaultPosition: z.enum(['min', 'typical', 'max']).optional(),
      }),
    )
    .optional(),
  optionAnchorPositions: z
    .record(z.string(), z.enum(['min', 'typical', 'max']))
    .optional(),
  /**
   * D-189: simulation ENGINE binding (adhoc vs child gate/training on a parent exec).
   */
  simulationBinding: SimulationEngineBinding.optional(),
});
export type EngineSetupSnapshot = z.infer<typeof EngineSetupSnapshot>;

export const EngineInstance = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  templateId: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  masterTopicSectors: z.array(z.string().trim().min(1).max(80)).max(20),
  capitalAllocationRef: z.string().nullable().optional(),
  targetExitRef: z.string().nullable().optional(),
  setupSnapshot: EngineSetupSnapshot.optional(),
  templateInputs: z.record(z.string(), z.string()).optional(),
  canvasBounds: EngineCanvasBounds.nullable(),
  memberModuleIds: z.array(z.string().uuid()).optional(),
});
export type EngineInstance = z.infer<typeof EngineInstance>;

/** Execution engine that declares `researchTemplateId` as a child research dependency. */
export function findParentExecutionForResearchPack(
  researchTemplateId: string,
  existingEngines: ReadonlyArray<{ id: string; templateId: string }>,
): { id: string; templateId: string } | undefined {
  return existingEngines.find((row) => {
    const template = getEngineTemplateById(row.templateId);
    if (!template || engineCreateSection(template) !== 'execution') return false;
    return researchDependenciesForExecutionEngine(row.templateId).includes(researchTemplateId);
  });
}

/**
 * Default research library binding for engine insert / company create when the client
 * omits an explicit chooser payload.
 */
export function resolveResearchLibraryBindingForInsert(opts: {
  explicit?: ResearchLibraryBinding;
  researchTemplateId: string;
  existingEngines: ReadonlyArray<{ id: string; templateId: string }>;
}): ResearchLibraryBinding {
  if (opts.explicit) {
    if (opts.explicit.mode === 'attach_execution' && !opts.explicit.engineInstanceId) {
      const parent = findParentExecutionForResearchPack(
        opts.researchTemplateId,
        opts.existingEngines,
      );
      if (parent) {
        return { ...opts.explicit, engineInstanceId: parent.id };
      }
    }
    return opts.explicit;
  }

  const parent = findParentExecutionForResearchPack(
    opts.researchTemplateId,
    opts.existingEngines,
  );
  if (parent) {
    return { mode: 'attach_execution', engineInstanceId: parent.id };
  }

  return { mode: 'create_internal' };
}

export const InsertEngineInput = z.object({
  templateId: z.string().min(1).max(80),
  /** Engine-specific template inputs (philosophy, etc.) keyed by EngineTemplateInput.key. */
  inputs: z.record(z.string(), z.string()).default({}),
  /** Master topic/sector + shared capital/exit applied per required module type. */
  setup: ModuleSetupInput.optional(),
  /**
   * When true (default), fill empty topic from company.sectorFocuses and capital
   * from company.seedCreditsCents before applying withDefaultEngineSetup (D-176).
   */
  cascadeFromCompany: z.boolean().default(true),
  /** Absolute canvas offset applied to template module positions. */
  canvasOffset: CanvasPosition.optional(),
  /**
   * D-189: when inserting a linked simulation ENGINE, stamp setup_snapshot.simulationBinding.
   * Omit for adhoc sims and non-sim templates.
   */
  simulationBinding: SimulationEngineBinding.optional(),
  /** D-184 §1 / D-191: research pack library + hub attach chooser. */
  researchLibraryBinding: ResearchLibraryBinding.optional(),
});
export type InsertEngineInput = z.infer<typeof InsertEngineInput>;

export const UpdateEngineInstanceInput = z.object({
  label: z.string().min(1).max(120).optional(),
  masterTopicSectors: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  /** Full shared setup (topic + total envelope + overall exit). Cascades to members. */
  setup: ModuleSetupInput.optional(),
  setupSnapshot: EngineSetupSnapshot.optional(),
  templateInputs: z.record(z.string(), z.string()).optional(),
  canvasBounds: EngineCanvasBounds.nullable().optional(),
});
export type UpdateEngineInstanceInput = z.infer<typeof UpdateEngineInstanceInput>;

export const DeleteEngineInstanceInput = z.object({
  mode: DeleteEngineMode,
});
export type DeleteEngineInstanceInput = z.infer<typeof DeleteEngineInstanceInput>;

/** Module types that may receive a Math tool attachment (n8n-style multi-attach). */
export const MATH_TOOL_CONSUMER_TYPES: ReadonlySet<ModuleType> = new Set([
  'research',
  'librarian',
  'library',
  'live_api',
  'trend',
  'trading',
  'simulator',
  'analyzer',
  'policy',
  'generator',
  'display',
]);

export function mathCanAttachTo(consumer: ModuleType): boolean {
  return MATH_TOOL_CONSUMER_TYPES.has(consumer);
}

/** True when a link represents a Math TOOL docked under a consumer. */
export function isMathToolAttachment(
  fromType: ModuleType,
  toType: ModuleType,
  linkKind: 'data_feed' | 'directive' | 'verification' | 'fund_route',
): boolean {
  return fromType === 'math' && mathCanAttachTo(toType) && linkKind === 'data_feed';
}

/**
 * Default group padding around member module cards (D-033 connection-safe +
 * D-035 / D-089 shared setup in header as inline bounded fields).
 */
export const ENGINE_GROUP_PADDING = {
  /** Clears motherboard utility ports + labeled side handles. */
  left: 88,
  /**
   * Clears right utility chrome + D-173 option-anchor column (D-176).
   * Must be ≥ CANVAS_LAYOUT.optionAnchorColumnWidth.
   */
  right: 168,
  /** Badge + title + one wrap row of bordered setup fields (D-089). */
  top: 92,
  /** Clears Math docks + bottom-left Time hub rail (D-091). */
  bottom: 132,
} as const;

export function computeEngineBoundsFromPositions(
  positions: readonly { x: number; y: number }[],
  nodeWidth = 220,
  /** Match CANVAS_LAYOUT.moduleHeight so create/reflow envelopes clear tall cards. */
  nodeHeight = 168,
): EngineCanvasBounds {
  if (positions.length === 0) {
    return {
      x: 0,
      y: 0,
      width: ENGINE_GROUP_PADDING.left + ENGINE_GROUP_PADDING.right + nodeWidth,
      height: ENGINE_GROUP_PADDING.top + ENGINE_GROUP_PADDING.bottom + nodeHeight,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pos of positions) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + nodeWidth);
    maxY = Math.max(maxY, pos.y + nodeHeight);
  }
  return {
    x: minX - ENGINE_GROUP_PADDING.left,
    y: minY - ENGINE_GROUP_PADDING.top,
    width: maxX - minX + ENGINE_GROUP_PADDING.left + ENGINE_GROUP_PADDING.right,
    height: maxY - minY + ENGINE_GROUP_PADDING.top + ENGINE_GROUP_PADDING.bottom,
  };
}

const PERCENT_SCALE = 4;

/** Deterministic equal split of a scaled integer across n parts (remainder to earliest). */
export function splitScaledInt(total: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  if (n === 1) return [total];
  const base = total / BigInt(n);
  const rem = total % BigInt(n);
  return Array.from({ length: n }, (_, index) => base + (BigInt(index) < rem ? 1n : 0n));
}

function decimalToScaledInt(value: string, scale: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  const normalizedFraction = fraction.padEnd(scale, '0').slice(0, scale);
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(normalizedFraction || '0');
}

function formatScaledDecimal(value: bigint, scale: number): string {
  if (scale <= 0) return value.toString();
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(scale, '0').replace(/0+$/, '');
  const body = fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${body}` : body;
}

/** Equal-split a capital envelope across n capital-bearing members (D-035). */
export function splitAllocationValues(
  mode: 'amount' | 'percentage',
  value: string,
  n: number,
): string[] {
  const scale = mode === 'amount' ? 2 : PERCENT_SCALE;
  const parts = splitScaledInt(decimalToScaledInt(value, scale), n);
  return parts.map((part) => formatScaledDecimal(part, scale));
}

/**
 * Default ENGINE capital envelope: paper seed dollars when available, else 100%.
 * Cascaded as an equal split across capital-bearing members.
 */
export function defaultEngineCapitalEnvelope(seedCreditsCents = 0): CapitalAllocationInput {
  if (seedCreditsCents > 0) {
    return { mode: 'amount', value: (seedCreditsCents / 100).toFixed(2) };
  }
  return { mode: 'percentage', value: '100' };
}

/**
 * Fill missing capital on an engine setup with the default envelope.
 * Always returns a setup object so insert/create paths can cascade defaults
 * even when the operator skips the setup form.
 */
export function withDefaultEngineCapital(
  setup: ModuleSetupInput | undefined,
  seedCreditsCents = 0,
): ModuleSetupInput {
  if (setup?.capitalAllocation) return setup;
  return {
    ...(setup ?? {}),
    capitalAllocation: defaultEngineCapitalEnvelope(seedCreditsCents),
  };
}

/** datetime-local string ~7 days ahead (default overall exit for engine seeds). */
export function defaultTargetExitLocal(nowMs = Date.now()): string {
  const d = new Date(nowMs + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO timestamp matching {@link defaultTargetExitLocal} (for API ModuleSetupInput). */
export function defaultTargetExitAt(nowMs = Date.now()): string {
  return new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Ensure create/insert engine setup has capital envelope + overall exit defaults.
 * Topic stays operator-required (not invented here).
 */
export function withDefaultEngineSetup(
  setup: ModuleSetupInput | undefined,
  seedCreditsCents = 0,
  nowMs = Date.now(),
): ModuleSetupInput {
  const withCapital = withDefaultEngineCapital(setup, seedCreditsCents);
  if (withCapital.targetExitAt) return withCapital;
  return {
    ...withCapital,
    targetExitAt: defaultTargetExitAt(nowMs),
  };
}

export type CompanyEngineCascadeSource = {
  sectorFocuses: readonly string[];
  seedCreditsCents: number | bigint | string;
};

/**
 * Merge company-level defaults into engine setup when cascadeFromCompany is on (D-176).
 * Operator-provided topic/capital/exit win; empty topic fills from sectorFocuses;
 * capital defaults use seedCreditsCents instead of a bare 100% envelope.
 */
export function resolveEngineSetupFromCompany(
  setup: ModuleSetupInput | undefined,
  company: CompanyEngineCascadeSource,
  cascadeFromCompany = true,
  nowMs = Date.now(),
): ModuleSetupInput {
  if (!cascadeFromCompany) {
    return withDefaultEngineSetup(setup, 0, nowMs);
  }
  const seedCents = Number(company.seedCreditsCents);
  const topicSectors =
    setup?.topicSectors && setup.topicSectors.length > 0
      ? setup.topicSectors
      : [...company.sectorFocuses];
  return withDefaultEngineSetup(
    {
      ...(setup ?? {}),
      ...(topicSectors.length > 0 ? { topicSectors } : {}),
    },
    Number.isFinite(seedCents) ? seedCents : 0,
    nowMs,
  );
}

export interface DefaultMemberSetupDraft {
  topicSectors: string;
  allocationMode: 'amount' | 'percentage';
  allocationValue: string;
  targetExitLocal: string;
}

/**
 * Default inline drafts for engine/company-template members: equal-split capital
 * from the seed envelope and a shared overall exit. Topic stays empty (operator).
 */
export function defaultMemberSetupDrafts(
  moduleTypes: readonly ModuleType[],
  seedCreditsCents = 0,
  nowMs = Date.now(),
): DefaultMemberSetupDraft[] {
  const capitalCount = moduleTypes.filter((type) =>
    requiredModuleSetupFields(type).includes('capital_allocation'),
  ).length;
  const envelope = defaultEngineCapitalEnvelope(seedCreditsCents);
  const splits =
    capitalCount > 0 ? splitAllocationValues(envelope.mode, envelope.value, capitalCount) : [];
  const exitLocal = defaultTargetExitLocal(nowMs);
  let capitalIndex = 0;
  return moduleTypes.map((type) => {
    const required = new Set<ModuleSetupField>(requiredModuleSetupFields(type));
    const draft: DefaultMemberSetupDraft = {
      topicSectors: '',
      allocationMode: envelope.mode,
      allocationValue: '',
      targetExitLocal: '',
    };
    if (required.has('capital_allocation')) {
      draft.allocationValue = splits[capitalIndex] ?? '';
      capitalIndex += 1;
    }
    if (required.has('target_exit')) {
      draft.targetExitLocal = exitLocal;
    }
    return draft;
  });
}
