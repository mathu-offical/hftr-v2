import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { UpdateCompanyInput } from '@hftr/contracts';
import { companies } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const company = await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
    const linkRows = await scoping.listLinks(db, clerkUserId, companyId);
    return { company, modules: moduleRows, links: linkRows };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, UpdateCompanyInput);

    const updated = await db
      .update(companies)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(companies.id, companyId), eq(companies.clerkUserId, clerkUserId)))
      .returning();
    return { company: updated[0] };
  });
}

/** Archive (soft delete) — traces and ledgers are never destroyed. */
export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    await db
      .update(companies)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(companies.id, companyId), eq(companies.clerkUserId, clerkUserId)));
    return { archived: true };
  });
}
