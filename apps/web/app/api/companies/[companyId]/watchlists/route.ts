import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { modules, watchlistItems } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const CreateWatchlistItemInput = z.object({
  moduleId: z.string().uuid(),
  symbol: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z.]+$/)
    .transform((s) => s.toUpperCase()),
  bias: z.enum(['long', 'short', 'neutral']).default('neutral'),
  note: z.string().max(500).default(''),
});

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const items = await db
      .select({
        id: watchlistItems.id,
        moduleId: watchlistItems.moduleId,
        moduleName: modules.name,
        symbol: watchlistItems.symbol,
        bias: watchlistItems.bias,
        note: watchlistItems.note,
        sourceClass: watchlistItems.sourceClass,
        status: watchlistItems.status,
        updatedAt: watchlistItems.updatedAt,
      })
      .from(watchlistItems)
      .innerJoin(modules, eq(modules.id, watchlistItems.moduleId))
      .where(eq(watchlistItems.companyId, companyId))
      .orderBy(desc(watchlistItems.updatedAt))
      .limit(200);
    return { items };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const input = await parseBody(req, CreateWatchlistItemInput);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, input.moduleId);
    if (module_.type !== 'trading' && module_.type !== 'trend') {
      throw new ApiError(422, 'module_type_not_watchable');
    }
    const rows = await db
      .insert(watchlistItems)
      .values({
        companyId,
        moduleId: input.moduleId,
        symbol: input.symbol,
        bias: input.bias,
        note: input.note,
      })
      .onConflictDoUpdate({
        target: [watchlistItems.moduleId, watchlistItems.symbol],
        set: {
          bias: input.bias,
          note: input.note,
          status: 'watching',
          updatedAt: new Date(),
        },
      })
      .returning();
    return { item: rows[0] };
  });
}
