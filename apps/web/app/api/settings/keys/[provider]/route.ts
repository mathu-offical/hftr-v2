import { and, eq } from 'drizzle-orm';
import { LlmProvider } from '@hftr/contracts';
import { userApiKeys } from '@hftr/db/schema';
import { z } from 'zod';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ provider: LlmProvider });

type Ctx = { params: Promise<{ provider: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { provider } = Params.parse(await ctx.params);
    await db
      .delete(userApiKeys)
      .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)));
    return { ok: true };
  });
}
