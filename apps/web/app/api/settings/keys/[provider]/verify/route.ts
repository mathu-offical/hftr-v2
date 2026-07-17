import { and, eq } from 'drizzle-orm';
import { LlmKeyVerifyResult, LlmProvider } from '@hftr/contracts';
import { userApiKeys } from '@hftr/db/schema';
import { z } from 'zod';
import { ApiError, withAuth } from '@/lib/api';
import { verifyLlmProviderKey } from '@/lib/llm-verify';
import { decryptSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

const Params = z.object({ provider: LlmProvider });
type Ctx = { params: Promise<{ provider: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { provider } = Params.parse(await ctx.params);

    const rows = await db
      .select({ ciphertext: userApiKeys.ciphertext })
      .from(userApiKeys)
      .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ApiError(404, 'key_not_configured');
    }

    let apiKey: string;
    try {
      apiKey = decryptSecret(row.ciphertext, 'llm_settings');
    } catch {
      throw new ApiError(500, 'decrypt_failed');
    }

    const outcome = await verifyLlmProviderKey(provider, apiKey);

    return LlmKeyVerifyResult.parse({
      ok: outcome.ok,
      failure: outcome.failure,
      deferred: outcome.deferred,
    });
  });
}
