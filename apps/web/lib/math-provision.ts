import { randomUUID } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import { moduleRequiresMath, preferredMathTypeForOwner, type ModuleType } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { moduleLinks, modules } from '@hftr/db/schema';

const OWNER_WIDTH = 280;
const MATH_WIDTH = 220;
const OWNER_HEIGHT = 220;
const ATTACHMENT_GAP = 24;

export interface MathOwnerSeed {
  id: string;
  type: ModuleType;
  name: string;
  position: { x: number; y: number };
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

function mathPositionForOwner(owner: MathOwnerSeed): { x: number; y: number } {
  return {
    x: owner.position.x + (OWNER_WIDTH - MATH_WIDTH) / 2,
    y: owner.position.y + OWNER_HEIGHT + ATTACHMENT_GAP,
  };
}

/**
 * Provision one explicitly owned deterministic Math tool and reciprocal data
 * links per required owner. Callers pass newly-created owners, so uniqueness
 * is guaranteed by modules_tool_owner_unique and the whole tool slice is a
 * single Neon HTTP batch.
 */
export async function provisionDedicatedMathTools(
  db: Db,
  companyId: string,
  owners: readonly MathOwnerSeed[],
): Promise<ProvisionedMathTool[]> {
  const requiredOwners = owners.filter((owner) => moduleRequiresMath(owner.type));
  if (requiredOwners.length === 0) return [];

  const tools = requiredOwners.map((owner) => ({
    id: randomUUID(),
    ownerModuleId: owner.id,
    ownerType: owner.type,
    position: mathPositionForOwner(owner),
    name: `Math · ${owner.name}`.slice(0, 80),
    ownerToMathLinkId: randomUUID(),
    mathToOwnerLinkId: randomUUID(),
  }));

  await db.batch([
    db.insert(modules).values(
      tools.map((tool) => ({
        id: tool.id,
        companyId,
        type: 'math' as const,
        name: tool.name,
        generatedNameBase: tool.name,
        nameCustomized: false,
        config: { mathType: preferredMathTypeForOwner(tool.ownerType) },
        status: 'active' as const,
        canvasPosition: tool.position,
        engineInstanceId: null,
        toolOwnerModuleId: tool.ownerModuleId,
      })),
    ),
    db.insert(moduleLinks).values(
      tools.flatMap((tool) => [
        {
          id: tool.ownerToMathLinkId,
          companyId,
          fromModuleId: tool.ownerModuleId,
          toModuleId: tool.id,
          linkKind: 'data_feed' as const,
        },
        {
          id: tool.mathToOwnerLinkId,
          companyId,
          fromModuleId: tool.id,
          toModuleId: tool.ownerModuleId,
          linkKind: 'data_feed' as const,
        },
      ]),
    ),
  ]);

  return tools.map(({ id, ownerModuleId, position, ownerToMathLinkId, mathToOwnerLinkId }) => ({
    id,
    ownerModuleId,
    position,
    links: [
      {
        id: ownerToMathLinkId,
        fromModuleId: ownerModuleId,
        toModuleId: id,
        linkKind: 'data_feed' as const,
      },
      {
        id: mathToOwnerLinkId,
        fromModuleId: id,
        toModuleId: ownerModuleId,
        linkKind: 'data_feed' as const,
      },
    ],
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
