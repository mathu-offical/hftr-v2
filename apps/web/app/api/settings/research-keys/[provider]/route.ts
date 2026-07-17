import { and, eq } from 'drizzle-orm';
import { ResearchKeyProvider } from '@hftr/contracts';
import { userResearchKeys } from '@hftr/db/schema';
import { z } from 'zod';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ provider: ResearchKeyProvider });
type Ctx = { params: Promise<{ provider: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { provider } = Params.parse(await ctx.params);
    await db
      .delete(userResearchKeys)
      .where(
        and(
          eq(userResearchKeys.clerkUserId, clerkUserId),
          eq(userResearchKeys.provider, provider),
        ),
      );
    return { ok: true };
  });
}
