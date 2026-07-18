import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { calcStore, createSystemClock } from '@hftr/engine';
import { scoping } from '@hftr/db';
import { trendCandidates } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const CreateTrendInput = z.object({
  moduleId: z.string().uuid(),
  symbol: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z.]+$/)
    .transform((s) => s.toUpperCase()),
  direction: z.enum(['up', 'down', 'flat']).default('flat'),
  strengthBand: z.enum(['weak', 'moderate', 'strong']).default('moderate'),
});

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select()
      .from(trendCandidates)
      .where(eq(trendCandidates.companyId, companyId))
      .orderBy(desc(trendCandidates.scannedAt))
      .limit(200);
    return { trends: rows };
  });
}

/**
 * Operator-entered trend candidate (ui-ux.spec BOTTOM/TRENDS). Drift is
 * recorded as a zero-bps ValueRef with sourceId marking operator origin —
 * the row itself stays sourceClass deterministic_scan until the schema
 * grows an explicit operator class (honest: no model nominated this).
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, CreateTrendInput);
    const mod = await scoping.getOwnedModule(db, clerkUserId, companyId, input.moduleId);
    if (mod.type !== 'trend') {
      throw new ApiError(422, 'module_type_not_trend');
    }

    const clock = createSystemClock();
    const driftRef = await calcStore.record(db, clock, {
      kind: 'bps',
      unit: 'bps',
      scale: 0,
      valueInt: 0n,
      sourceClass: 'operator_input',
      sourceId: `operator_manual:${input.symbol}`,
      ttlMs: 24 * 60 * 60_000,
      companyId,
      moduleId: input.moduleId,
    });

    const inserted = await db
      .insert(trendCandidates)
      .values({
        companyId,
        moduleId: input.moduleId,
        symbol: input.symbol,
        direction: input.direction,
        strengthBand: input.strengthBand,
        driftRef,
        sourceClass: 'deterministic_scan',
        status: 'candidate',
        scannedAt: new Date(clock.nowMs()),
      })
      .returning();

    return { trend: inserted[0] };
  });
}
