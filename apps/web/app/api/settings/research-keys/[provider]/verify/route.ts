import { and, eq } from 'drizzle-orm';
import { ResearchKeyProvider, ResearchKeyVerifyResult } from '@hftr/contracts';
import { userResearchKeys } from '@hftr/db/schema';
import { z } from 'zod';
import { ApiError, withAuth } from '@/lib/api';
import { verifyResearchProviderKey } from '@/lib/research-verify';
import { withDecryptedSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

const Params = z.object({ provider: ResearchKeyProvider });
const DraftBody = z.object({
  apiKey: z.string().trim().min(8).max(512).optional(),
});
type Ctx = { params: Promise<{ provider: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { provider } = Params.parse(await ctx.params);

    let apiKey: string | undefined;
    const rawText = await req.text();
    if (rawText.trim()) {
      let parsed: z.infer<typeof DraftBody>;
      try {
        parsed = DraftBody.parse(JSON.parse(rawText));
      } catch {
        throw new ApiError(400, 'invalid_json');
      }
      apiKey = parsed.apiKey;
    }

    if (!apiKey) {
      const rows = await db
        .select({ ciphertext: userResearchKeys.ciphertext })
        .from(userResearchKeys)
        .where(
          and(
            eq(userResearchKeys.clerkUserId, clerkUserId),
            eq(userResearchKeys.provider, provider),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        throw new ApiError(404, 'key_not_configured');
      }

      try {
        apiKey = await withDecryptedSecret(row.ciphertext, 'research_settings', (p) => p);
      } catch {
        throw new ApiError(500, 'decrypt_failed');
      }
    }

    const outcome = await verifyResearchProviderKey(provider, apiKey);

    return ResearchKeyVerifyResult.parse({
      ok: outcome.ok,
      failure: outcome.failure ?? null,
    });
  });
}
