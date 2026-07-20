import { z } from 'zod';
import {
  allowedLinkKinds,
  assertLinkArtifactKinds,
  CreateLinkInput,
  isLegalFundRoute,
  isLegalStreamPortPair,
  ModuleType,
} from '@hftr/contracts';
import { moduleLinks } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { refreshGeneratedModuleNames } from '@/lib/module-generated-name';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const rows = await scoping.listLinks(db, clerkUserId, companyId);
    return { links: rows };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const input = await parseBody(req, CreateLinkInput);

    if (input.fromModuleId === input.toModuleId) {
      throw new ApiError(422, 'self_link_not_allowed');
    }

    // Both endpoints must exist AND belong to this owned company.
    const from = await scoping.getOwnedModule(db, clerkUserId, companyId, input.fromModuleId);
    const to = await scoping.getOwnedModule(db, clerkUserId, companyId, input.toModuleId);

    const fromType = ModuleType.parse(from.type);
    const toType = ModuleType.parse(to.type);

    // Canvas edge validation against the LINK_RULES matrix.
    const allowed = allowedLinkKinds(fromType, toType);
    if (!allowed.includes(input.linkKind)) {
      throw new ApiError(422, 'link_kind_not_allowed');
    }
    if (input.linkKind === 'fund_route' && !isLegalFundRoute(fromType, toType)) {
      throw new ApiError(422, 'fund_route_must_traverse_math');
    }
    // D-108: Time schedule/bus → clock_in only (fail-closed when handles provided).
    if (
      !isLegalStreamPortPair({
        fromType,
        toType,
        sourceHandle: input.sourceHandle ?? null,
        targetHandle: input.targetHandle ?? null,
        linkKind: input.linkKind,
      })
    ) {
      throw new ApiError(422, 'port_slot_not_allowed');
    }
    // D-240: artifact-kind allowlist when resolvable for this pair.
    const artifactGate = assertLinkArtifactKinds({
      fromType,
      toType,
      linkKind: input.linkKind,
    });
    if (!artifactGate.ok) {
      throw new ApiError(422, artifactGate.reason);
    }

    const inserted = await db
      .insert(moduleLinks)
      .values({
        companyId,
        fromModuleId: input.fromModuleId,
        toModuleId: input.toModuleId,
        linkKind: input.linkKind,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      throw new ApiError(409, 'link_already_exists');
    }
    const link = inserted[0]!;
    const renamedModules = await refreshGeneratedModuleNames(db, companyId, [
      link.fromModuleId,
      link.toModuleId,
    ]);
    return { link, renamedModules };
  });
}
