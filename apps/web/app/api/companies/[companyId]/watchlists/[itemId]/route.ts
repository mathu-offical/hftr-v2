import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { WatchlistItemStatus } from '@hftr/contracts';
import { NotFoundError, scoping } from '@hftr/db';
import { watchlistItems } from '@hftr/db/schema';
import { parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), itemId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; itemId: string }> };

const UpdateWatchlistItemInput = z.object({
  bias: z.enum(['long', 'short', 'neutral']).optional(),
  note: z.string().max(500).optional(),
  /** Confirm suggestion → watching, or archive / triggered. */
  status: WatchlistItemStatus.optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, itemId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, UpdateWatchlistItemInput);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.bias !== undefined) patch.bias = input.bias;
    if (input.note !== undefined) patch.note = input.note;
    if (input.status !== undefined) {
      patch.status = input.status;
      // Operator confirm / explicit status change claims ownership.
      if (input.status === 'watching') {
        patch.sourceClass = 'operator';
      }
    }

    const rows = await db
      .update(watchlistItems)
      .set(patch)
      .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.companyId, companyId)))
      .returning();
    const item = rows[0];
    if (!item) throw new NotFoundError('watchlist_item');
    return { item };
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, itemId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.companyId, companyId)))
      .returning();
    if (!rows[0]) throw new NotFoundError('watchlist_item');
    return { deleted: true };
  });
}
