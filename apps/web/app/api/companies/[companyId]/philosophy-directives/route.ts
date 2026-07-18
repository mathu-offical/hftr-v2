import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppendPhilosophyDirectiveInput,
  OperatorPhilosophyDirective,
  PhilosophyDirectivesListResponse,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { modules, operatorPhilosophyDirectives } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * List append-only operator philosophy directives (D-082).
 * Agents never write these rows — operator POST only.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const rows = await db
      .select()
      .from(operatorPhilosophyDirectives)
      .where(eq(operatorPhilosophyDirectives.companyId, companyId))
      .orderBy(desc(operatorPhilosophyDirectives.createdAt))
      .limit(200);

    return PhilosophyDirectivesListResponse.parse({
      directives: rows.map((r) =>
        OperatorPhilosophyDirective.parse({
          id: r.id,
          companyId: r.companyId,
          moduleId: r.moduleId,
          body: r.body,
          createdByClerkUserId: r.createdByClerkUserId,
          createdAt: r.createdAt.toISOString(),
        }),
      ),
    });
  });
}

/**
 * Append an operator philosophy directive. No PATCH/DELETE — immutable ledger.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, AppendPhilosophyDirectiveInput);

    if (input.moduleId) {
      await scoping.getOwnedModule(db, clerkUserId, companyId, input.moduleId);
      const [mod] = await db
        .select({ id: modules.id })
        .from(modules)
        .where(eq(modules.id, input.moduleId))
        .limit(1);
      if (!mod) throw new ApiError(404, 'module_not_found');
    }

    const [row] = await db
      .insert(operatorPhilosophyDirectives)
      .values({
        companyId,
        moduleId: input.moduleId ?? null,
        body: input.body.trim(),
        createdByClerkUserId: clerkUserId,
      })
      .returning();

    if (!row) throw new ApiError(500, 'directive_insert_failed');

    return OperatorPhilosophyDirective.parse({
      id: row.id,
      companyId: row.companyId,
      moduleId: row.moduleId,
      body: row.body,
      createdByClerkUserId: row.createdByClerkUserId,
      createdAt: row.createdAt.toISOString(),
    });
  });
}
