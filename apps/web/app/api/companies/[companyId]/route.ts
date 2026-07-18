import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { UpdateCompanyInput } from '@hftr/contracts';
import { companies, jobSchedules, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { bootstrapCompanyKnowledge } from '@hftr/engine';
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
    const now = new Date();

    const updated = await db
      .update(companies)
      .set({ ...input, updatedAt: now })
      .where(and(eq(companies.id, companyId), eq(companies.clerkUserId, clerkUserId)))
      .returning();

    // Re-materialize baseline Sector knowledge for new/changed focuses (idempotent).
    if (input.sectorFocuses !== undefined) {
      try {
        await bootstrapCompanyKnowledge({ db, companyId, now });
      } catch (err) {
        console.error('sector knowledge re-seed failed on company PATCH', err);
      }
    }

    return { company: updated[0] };
  });
}

/**
 * Archive (soft delete) — traces and ledgers are never destroyed.
 * Fail-closed: force paper, clear live arming/evidence, unbind broker,
 * disable company schedules, and pause active modules in one Neon batch.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const now = new Date();

    await db.batch([
      db
        .update(companies)
        .set({
          archivedAt: now,
          mode: 'paper',
          brokerConnectionId: null,
          liveArmedAt: null,
          liveGateEvidenceId: null,
          updatedAt: now,
        })
        .where(and(eq(companies.id, companyId), eq(companies.clerkUserId, clerkUserId))),
      db
        .update(jobSchedules)
        .set({ enabled: false, updatedAt: now })
        .where(eq(jobSchedules.companyId, companyId)),
      db
        .update(modules)
        .set({ status: 'paused', updatedAt: now })
        .where(and(eq(modules.companyId, companyId), eq(modules.status, 'active'))),
    ]);

    return { archived: true };
  });
}
