import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import {
  isEngineMathHubModule,
  moduleProvisionsDedicatedMath,
  moduleRequiresMath,
  parseMathTypeFromConfig,
  preferredMathTypeForOwner,
  placeEngineMathHubPosition,
  placeEngineTimeHubPosition,
  CANVAS_LAYOUT,
  type ModuleType,
  composeModulePrimaryLabel,
  moduleFunctionLabel,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { engineInstances, moduleLinks, modules } from '@hftr/db/schema';

const OWNER_WIDTH = 280;
const MATH_WIDTH = 220;
const OWNER_HEIGHT = 220;
const ATTACHMENT_GAP = 24;

export interface MathOwnerSeed {
  id: string;
  type: ModuleType;
  /** Short owner Fn (or legacy name); used as Math focus token. */
  name: string;
  position: { x: number; y: number };
  config?: unknown;
}

export interface ProvisionedMathTool {
  id: string;
  ownerModuleId: string;
  position: { x: number; y: number };
  links: Array<{
    id: string;
    fromModuleId: string;
    toModuleId: string;
    linkKind: 'data_feed';
  }>;
}

export interface ProvisionEngineMathHubInput {
  companyId: string;
  engineInstanceId: string;
  origin: { x: number; y: number };
}

export interface ProvisionedEngineMathHub {
  id: string;
  engineInstanceId: string;
  position: { x: number; y: number };
}

/**
 * D-245: provision one engine Math hub per engine (symmetry with Time hubs).
 * Idempotent — refreshes canvas position on every call.
 */
export async function provisionEngineMathHub(
  db: Db,
  input: ProvisionEngineMathHubInput,
  now = new Date(),
): Promise<ProvisionedEngineMathHub> {
  const { companyId, engineInstanceId, origin } = input;

  const candidates = await db
    .select({
      id: modules.id,
      config: modules.config,
      canvasPosition: modules.canvasPosition,
    })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.engineInstanceId, engineInstanceId),
        eq(modules.type, 'math'),
        isNull(modules.toolOwnerModuleId),
      ),
    );

  const existing = candidates.find((row) =>
    isEngineMathHubModule({
      type: 'math',
      config: row.config,
      toolOwnerModuleId: null,
      engineInstanceId,
    }),
  );

  if (existing) {
    await db
      .update(modules)
      .set({ canvasPosition: origin, updatedAt: now })
      .where(eq(modules.id, existing.id));
    return { id: existing.id, engineInstanceId, position: origin };
  }

  const mathId = randomUUID();
  const name = composeModulePrimaryLabel('Math', 'Engine hub');
  await db.insert(modules).values({
    id: mathId,
    companyId,
    type: 'math',
    name,
    generatedNameBase: 'Math',
    nameCustomized: false,
    config: { mathType: 'engine_math_hub' },
    status: 'active',
    canvasPosition: origin,
    engineInstanceId,
    toolOwnerModuleId: null,
  });

  return { id: mathId, engineInstanceId, position: origin };
}

function mathPositionForOwner(owner: MathOwnerSeed): { x: number; y: number } {
  return {
    x: owner.position.x + (OWNER_WIDTH - MATH_WIDTH) / 2,
    y: owner.position.y + OWNER_HEIGHT + ATTACHMENT_GAP,
  };
}

/**
 * Provision dedicated Math tools:
 * - Model-bearing owners: Calc-ref data_feed (math → owner) — D-088.
 * - fund_router: fund_path Math ownership only (capital hops use fund_route) — D-221.
 */
export async function provisionDedicatedMathTools(
  db: Db,
  companyId: string,
  owners: readonly MathOwnerSeed[],
): Promise<ProvisionedMathTool[]> {
  const requiredOwners = owners.filter((owner) => moduleProvisionsDedicatedMath(owner.type));
  if (requiredOwners.length === 0) return [];

  const tools = requiredOwners.map((owner) => {
    const ownerFn =
      moduleFunctionLabel(owner.type, owner.config) || owner.name.split(' · ')[0] || owner.name;
    const mathType = preferredMathTypeForOwner(owner.type);
    const mathFn = moduleFunctionLabel('math', { mathType });
    const name = composeModulePrimaryLabel(mathFn, ownerFn);
    const withCalcRef = moduleRequiresMath(owner.type);
    return {
      id: randomUUID(),
      ownerModuleId: owner.id,
      ownerType: owner.type,
      position: mathPositionForOwner(owner),
      name,
      mathType,
      withCalcRef,
      mathToOwnerLinkId: withCalcRef ? randomUUID() : null,
    };
  });

  await db.insert(modules).values(
    tools.map((tool) => ({
      id: tool.id,
      companyId,
      type: 'math' as const,
      name: tool.name,
      generatedNameBase: moduleFunctionLabel('math', { mathType: tool.mathType }),
      nameCustomized: false,
      config: { mathType: tool.mathType },
      status: 'active' as const,
      canvasPosition: tool.position,
      engineInstanceId: null,
      toolOwnerModuleId: tool.ownerModuleId,
    })),
  );

  const calcRefTools = tools.filter(
    (tool): tool is (typeof tools)[number] & { mathToOwnerLinkId: string } =>
      tool.mathToOwnerLinkId != null,
  );
  if (calcRefTools.length > 0) {
    await db.insert(moduleLinks).values(
      calcRefTools.map((tool) => ({
        id: tool.mathToOwnerLinkId,
        companyId,
        fromModuleId: tool.id,
        toModuleId: tool.ownerModuleId,
        linkKind: 'data_feed' as const,
      })),
    );
  }

  return tools.map(({ id, ownerModuleId, position, mathToOwnerLinkId }) => ({
    id,
    ownerModuleId,
    position,
    links:
      mathToOwnerLinkId != null
        ? [
            {
              id: mathToOwnerLinkId,
              fromModuleId: id,
              toModuleId: ownerModuleId,
              linkKind: 'data_feed' as const,
            },
          ]
        : [],
  }));
}

/**
 * Delete an owner's dedicated Math tool only when no non-owner attachment
 * remains. Shared tools are retained and merely become unowned.
 */
export async function cleanupDedicatedMathForOwner(
  db: Db,
  companyId: string,
  ownerModuleId: string,
): Promise<void> {
  const [tool] = await db
    .select({ id: modules.id })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.type, 'math'),
        eq(modules.toolOwnerModuleId, ownerModuleId),
      ),
    )
    .limit(1);
  if (!tool) return;

  const incident = await db
    .select({
      fromModuleId: moduleLinks.fromModuleId,
      toModuleId: moduleLinks.toModuleId,
    })
    .from(moduleLinks)
    .where(
      and(
        eq(moduleLinks.companyId, companyId),
        or(eq(moduleLinks.fromModuleId, tool.id), eq(moduleLinks.toModuleId, tool.id)),
      ),
    );
  const hasNonOwnerAttachment = incident.some(
    (link) =>
      (link.fromModuleId === tool.id && link.toModuleId !== ownerModuleId) ||
      (link.toModuleId === tool.id && link.fromModuleId !== ownerModuleId),
  );

  if (hasNonOwnerAttachment) {
    await db
      .update(modules)
      .set({ toolOwnerModuleId: null, updatedAt: new Date() })
      .where(eq(modules.id, tool.id));
    return;
  }

  await db.batch([
    db
      .delete(moduleLinks)
      .where(
        and(
          eq(moduleLinks.companyId, companyId),
          or(eq(moduleLinks.fromModuleId, tool.id), eq(moduleLinks.toModuleId, tool.id)),
        ),
      ),
    db.delete(modules).where(and(eq(modules.companyId, companyId), eq(modules.id, tool.id))),
  ]);
}

export type BackfillEngineMathResult = {
  provisionedEngineIds: string[];
  retiredCompanyHubIds: string[];
};

/**
 * D-245 backfill: ensure each engine has `engine_math_hub`; retire unowned
 * company-rail `company_hub` Math when every engine is covered.
 */
export async function backfillCompanyEngineMathHubs(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<BackfillEngineMathResult> {
  const engines = await db
    .select({
      id: engineInstances.id,
      canvasBounds: engineInstances.canvasBounds,
    })
    .from(engineInstances)
    .where(eq(engineInstances.companyId, companyId));

  const provisionedEngineIds: string[] = [];
  for (const engine of engines) {
    const members = await db
      .select({ canvasPosition: modules.canvasPosition })
      .from(modules)
      .where(
        and(eq(modules.companyId, companyId), eq(modules.engineInstanceId, engine.id)),
      );
    const memberPositions = members.map((m) => {
      const pos = (m.canvasPosition ?? { x: 0, y: 0 }) as { x: number; y: number };
      return {
        x: pos.x,
        y: pos.y,
        width: CANVAS_LAYOUT.moduleWidth,
        height: CANVAS_LAYOUT.moduleHeight,
      };
    });
    const timeAnchor = placeEngineTimeHubPosition(memberPositions);
    const origin = placeEngineMathHubPosition(timeAnchor, 0);

    const before = await db
      .select({ id: modules.id, config: modules.config, engineInstanceId: modules.engineInstanceId })
      .from(modules)
      .where(
        and(
          eq(modules.companyId, companyId),
          eq(modules.engineInstanceId, engine.id),
          eq(modules.type, 'math'),
          isNull(modules.toolOwnerModuleId),
        ),
      );
    const hadHub = before.some((row) =>
      isEngineMathHubModule({
        type: 'math',
        config: row.config,
        toolOwnerModuleId: null,
        engineInstanceId: engine.id,
      }),
    );
    await provisionEngineMathHub(
      db,
      { companyId, engineInstanceId: engine.id, origin },
      now,
    );
    if (!hadHub) provisionedEngineIds.push(engine.id);
  }

  const retiredCompanyHubIds: string[] = [];
  if (engines.length === 0) {
    return { provisionedEngineIds, retiredCompanyHubIds };
  }

  const companyHubs = await db
    .select({
      id: modules.id,
      config: modules.config,
      engineInstanceId: modules.engineInstanceId,
    })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.type, 'math'),
        isNull(modules.toolOwnerModuleId),
      ),
    );

  for (const hub of companyHubs) {
    const mathType = parseMathTypeFromConfig(hub.config);
    if (mathType !== 'company_hub') continue;
    if (hub.engineInstanceId) continue; // already engine-bound legacy

    const incident = await db
      .select({
        fromModuleId: moduleLinks.fromModuleId,
        toModuleId: moduleLinks.toModuleId,
      })
      .from(moduleLinks)
      .where(
        and(
          eq(moduleLinks.companyId, companyId),
          or(eq(moduleLinks.fromModuleId, hub.id), eq(moduleLinks.toModuleId, hub.id)),
        ),
      );

    // Only retire when no canvas wires remain (safe delete).
    if (incident.length > 0) continue;

    await db
      .delete(modules)
      .where(and(eq(modules.companyId, companyId), eq(modules.id, hub.id)));
    retiredCompanyHubIds.push(hub.id);
  }

  return { provisionedEngineIds, retiredCompanyHubIds };
}
