import { and, eq } from 'drizzle-orm';
import { ResearchKeyProvider } from '@hftr/contracts';
import { userResearchKeys } from '@hftr/db/schema';
import { z } from 'zod';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { encryptSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

const UpsertResearchKeyInput = z.object({
  provider: ResearchKeyProvider,
  apiKey: z.string().min(8).max(200),
});

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const rows = await db
      .select({
        provider: userResearchKeys.provider,
        keyHint: userResearchKeys.keyHint,
        updatedAt: userResearchKeys.updatedAt,
      })
      .from(userResearchKeys)
      .where(eq(userResearchKeys.clerkUserId, clerkUserId));
    return { keys: rows };
  });
}

export async function PUT(req: Request) {
  return withAuth(async ({ db, clerkUserId }) => {
    const input = await parseBody(req, UpsertResearchKeyInput);

    let encrypted: { ciphertext: string; hint: string };
    try {
      encrypted = encryptSecret(input.apiKey, 'research_settings');
    } catch {
      throw new ApiError(500, 'encryption_failed');
    }

    const rows = await db
      .insert(userResearchKeys)
      .values({
        clerkUserId,
        provider: input.provider,
        ciphertext: encrypted.ciphertext,
        keyHint: encrypted.hint,
      })
      .onConflictDoUpdate({
        target: [userResearchKeys.clerkUserId, userResearchKeys.provider],
        set: {
          ciphertext: encrypted.ciphertext,
          keyHint: encrypted.hint,
          updatedAt: new Date(),
        },
      })
      .returning({
        provider: userResearchKeys.provider,
        keyHint: userResearchKeys.keyHint,
        updatedAt: userResearchKeys.updatedAt,
      });

    return rows[0]!;
  });
}
