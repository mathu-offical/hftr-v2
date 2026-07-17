import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { MODULE_CONFIG_SCHEMAS, UpdateModuleInput } from '@hftr/contracts';
import { moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const row = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    return { module: row };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    const input = await parseBody(req, UpdateModuleInput);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (input.canvasPosition !== undefined) patch.canvasPosition = input.canvasPosition;
    if (input.config !== undefined) {
      patch.config = MODULE_CONFIG_SCHEMAS[existing.type].parse(input.config);
    }

    const updated = await db
      .update(modules)
      .set(patch)
      .where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)))
      .returning();
    return { module: updated[0] };
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (existing.type === 'math') {
      throw new ApiError(422, 'math_module_not_deletable'); // D-008
    }
    // Remove edges first, then the node.
    await db
      .delete(moduleLinks)
      .where(
        and(
          eq(moduleLinks.companyId, companyId),
          or(eq(moduleLinks.fromModuleId, moduleId), eq(moduleLinks.toModuleId, moduleId)),
        ),
      );
    await db.delete(modules).where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)));
    return { deleted: true };
  });
}
