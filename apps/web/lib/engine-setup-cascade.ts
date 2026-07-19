import { eq } from 'drizzle-orm';
import {
  requiredModuleSetupFields,
  seedEngineDecisionSnapshot,
  splitAllocationValues,
  type EngineSetupSnapshot,
  type ModuleSetupInput,
  type ModuleType,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { engineInstances, modules } from '@hftr/db/schema';
import { calcStore, createSystemClock, type Clock } from '@hftr/engine';
import { cascadeEngineMasterTopic } from '@/lib/engine-topic-cascade';
import { recordModuleSetup } from '@/lib/module-setup';

const CONFIG_TTL_MS = Number.MAX_SAFE_INTEGER;
const PERCENT_SCALE = 4;

function decimalToScaledInt(value: string, scale: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  const normalizedFraction = fraction.padEnd(scale, '0').slice(0, scale);
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(normalizedFraction || '0');
}

export { splitAllocationValues } from '@hftr/contracts';

export function engineSetupSnapshotFromInput(
  setup: ModuleSetupInput | undefined,
  previous?: EngineSetupSnapshot | null,
  extras?: {
    simulationBinding?: EngineSetupSnapshot['simulationBinding'];
    researchLibraryBinding?: EngineSetupSnapshot['researchLibraryBinding'];
  },
): EngineSetupSnapshot {
  const prev = previous ?? {
    topicSectors: [],
    allocationMode: 'amount' as const,
    allocationValue: '',
    targetExitLocal: '',
  };
  const topicSectors = setup?.topicSectors ?? prev.topicSectors;
  const allocationMode = setup?.capitalAllocation?.mode ?? prev.allocationMode;
  const allocationValue = setup?.capitalAllocation?.value ?? prev.allocationValue;
  let targetExitLocal = prev.targetExitLocal;
  if (setup?.targetExitAt) {
    const ms = Date.parse(setup.targetExitAt);
    if (Number.isFinite(ms)) {
      const d = new Date(ms);
      const pad = (n: number) => n.toString().padStart(2, '0');
      targetExitLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  const simulationBinding =
    extras?.simulationBinding ?? previous?.simulationBinding ?? undefined;
  const researchLibraryBinding =
    extras?.researchLibraryBinding ?? previous?.researchLibraryBinding ?? undefined;
  return {
    topicSectors,
    allocationMode,
    allocationValue,
    targetExitLocal,
    ...(previous?.optionAnchors ? { optionAnchors: previous.optionAnchors } : {}),
    ...(previous?.optionAnchorPositions
      ? { optionAnchorPositions: previous.optionAnchorPositions }
      : {}),
    ...(previous?.decisionNodes ? { decisionNodes: previous.decisionNodes } : {}),
    ...(previous?.decisionOptionSelections
      ? { decisionOptionSelections: previous.decisionOptionSelections }
      : {}),
    ...(simulationBinding ? { simulationBinding } : {}),
    ...(researchLibraryBinding ? { researchLibraryBinding } : {}),
  };
}

/**
 * Persist ENGINE-level capital/exit ValueRefs (D-035). Topic stays on
 * master_topic_sectors; snapshot holds operator-visible draft strings.
 */
export async function recordEngineSetupRefs(
  db: Db,
  clock: Clock,
  companyId: string,
  engineId: string,
  setup: ModuleSetupInput | undefined,
): Promise<{ capitalAllocationRef?: string; targetExitRef?: string }> {
  if (!setup) return {};
  const out: { capitalAllocationRef?: string; targetExitRef?: string } = {};

  if (setup.capitalAllocation) {
    const amount = setup.capitalAllocation;
    const isFixedAmount = amount.mode === 'amount';
    out.capitalAllocationRef = await calcStore.record(db, clock, {
      kind: isFixedAmount ? 'usd_cents' : 'pct',
      unit: isFixedAmount ? 'USD_cents' : 'pct',
      scale: isFixedAmount ? 0 : PERCENT_SCALE,
      valueInt: decimalToScaledInt(amount.value, isFixedAmount ? 2 : PERCENT_SCALE),
      sourceClass: 'operator_input',
      sourceId: `engine_setup:${engineId}:capital_allocation`,
      ttlMs: CONFIG_TTL_MS,
      companyId,
      moduleId: null,
      sanity: {
        minInt: '0',
        maxInt: isFixedAmount ? null : (100n * 10n ** BigInt(PERCENT_SCALE)).toString(),
        maxAgeMs: null,
        mustBePositive: false,
      },
    });
  }

  if (setup.targetExitAt) {
    const targetMs = Date.parse(setup.targetExitAt);
    if (!Number.isFinite(targetMs) || targetMs <= clock.nowMs()) {
      throw new Error('target_exit_must_be_future');
    }
    out.targetExitRef = await calcStore.record(db, clock, {
      kind: 'timestamp_ms',
      unit: 'epoch_ms',
      scale: 0,
      valueInt: BigInt(targetMs),
      timezone: setup.timezone ?? 'UTC',
      sourceClass: 'operator_input',
      sourceId: `engine_setup:${engineId}:target_exit`,
      ttlMs: CONFIG_TTL_MS,
      companyId,
      moduleId: null,
      sanity: {
        minInt: clock.nowMs().toString(),
        maxInt: null,
        maxAgeMs: null,
        mustBePositive: true,
      },
    });
  }

  return out;
}

/**
 * Fan-out ENGINE master setup to members (D-035):
 * - topic → non-overridden topic-bearing members (existing cascade)
 * - capital → equal split across capital-bearing members
 * - exit → same overall deadline on exit-bearing members
 */
export async function cascadeEngineSetup(
  db: Db,
  companyId: string,
  engineInstanceId: string,
  setup: ModuleSetupInput,
): Promise<number> {
  const clock = createSystemClock();
  let updated = 0;

  if (setup.topicSectors !== undefined) {
    updated += await cascadeEngineMasterTopic(db, companyId, engineInstanceId, setup.topicSectors);
  }

  const members = await db
    .select()
    .from(modules)
    .where(eq(modules.engineInstanceId, engineInstanceId));

  const capitalMembers = members.filter(
    (member) =>
      member.type !== 'math' &&
      requiredModuleSetupFields(member.type as ModuleType).includes('capital_allocation'),
  );
  const exitMembers = members.filter(
    (member) =>
      member.type !== 'math' &&
      requiredModuleSetupFields(member.type as ModuleType).includes('target_exit'),
  );

  if (setup.capitalAllocation && capitalMembers.length > 0) {
    const splitValues = splitAllocationValues(
      setup.capitalAllocation.mode,
      setup.capitalAllocation.value,
      capitalMembers.length,
    );
    for (let index = 0; index < capitalMembers.length; index += 1) {
      const member = capitalMembers[index]!;
      const value = splitValues[index]!;
      const setupPatch = await recordModuleSetup(
        db,
        clock,
        companyId,
        member.id,
        member.type as ModuleType,
        (member.config ?? {}) as Record<string, unknown>,
        {
          capitalAllocation: {
            mode: setup.capitalAllocation.mode,
            value,
          },
        },
      );
      if (Object.keys(setupPatch).length === 0) continue;
      await db
        .update(modules)
        .set({ ...setupPatch, updatedAt: new Date() })
        .where(eq(modules.id, member.id));
      updated += 1;
    }
  }

  if (setup.targetExitAt && exitMembers.length > 0) {
    for (const member of exitMembers) {
      const setupPatch = await recordModuleSetup(
        db,
        clock,
        companyId,
        member.id,
        member.type as ModuleType,
        (member.config ?? {}) as Record<string, unknown>,
        {
          targetExitAt: setup.targetExitAt,
          timezone: setup.timezone,
        },
      );
      if (Object.keys(setupPatch).length === 0) continue;
      await db
        .update(modules)
        .set({ ...setupPatch, updatedAt: new Date() })
        .where(eq(modules.id, member.id));
      updated += 1;
    }
  }

  return updated;
}

/** Persist decisionNodes + decisionOptionSelections after engine members exist (D-210). */
export async function persistEngineDecisionSeed(
  db: Db,
  engineId: string,
  templateId: string,
  members: Array<{ id: string; type: string; config: Record<string, unknown> }>,
  currentSnapshot: EngineSetupSnapshot,
): Promise<EngineSetupSnapshot> {
  const seed = seedEngineDecisionSnapshot({ engineId, templateId, members });
  const next: EngineSetupSnapshot = {
    ...currentSnapshot,
    decisionNodes: seed.decisionNodes,
    decisionOptionSelections: seed.decisionOptionSelections,
  };
  await db
    .update(engineInstances)
    .set({ setupSnapshot: next, updatedAt: new Date() })
    .where(eq(engineInstances.id, engineId));
  return next;
}
