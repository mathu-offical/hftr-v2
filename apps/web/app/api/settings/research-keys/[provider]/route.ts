import { and, eq } from 'drizzle-orm';
import { ResearchKeyProvider } from '@hftr/contracts';
import { userResearchKeys } from '@hftr/db/schema';
import { resolveAllOwnedCompanyServiceBindings } from '@hftr/engine';
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
        and(eq(userResearchKeys.clerkUserId, clerkUserId), eq(userResearchKeys.provider, provider)),
      );

    try {
      await resolveAllOwnedCompanyServiceBindings(db, clerkUserId);
    } catch (err) {
      console.error('resolveAllOwnedCompanyServiceBindings failed after research key delete', err);
    }

    return { ok: true };
  });
}
