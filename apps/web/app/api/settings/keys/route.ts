import { eq } from 'drizzle-orm';
import { LlmProvider } from '@hftr/contracts';
import { userApiKeys } from '@hftr/db/schema';
import { z } from 'zod';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { encryptSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

const UpsertKeyInput = z.object({
  provider: LlmProvider,
  apiKey: z.string().min(8).max(200),
});

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const rows = await db
      .select({
        provider: userApiKeys.provider,
        keyHint: userApiKeys.keyHint,
        updatedAt: userApiKeys.updatedAt,
      })
      .from(userApiKeys)
      .where(eq(userApiKeys.clerkUserId, clerkUserId));
    return { keys: rows };
  });
}

export async function PUT(req: Request) {
  return withAuth(async ({ db, clerkUserId }) => {
    const input = await parseBody(req, UpsertKeyInput);
    let encrypted: { ciphertext: string; hint: string };
    try {
      encrypted = encryptSecret(input.apiKey);
    } catch {
      throw new ApiError(500, 'encryption_failed');
    }

    const rows = await db
      .insert(userApiKeys)
      .values({
        clerkUserId,
        provider: input.provider,
        ciphertext: encrypted.ciphertext,
        keyHint: encrypted.hint,
      })
      .onConflictDoUpdate({
        target: [userApiKeys.clerkUserId, userApiKeys.provider],
        set: {
          ciphertext: encrypted.ciphertext,
          keyHint: encrypted.hint,
          updatedAt: new Date(),
        },
      })
      .returning({
        provider: userApiKeys.provider,
        keyHint: userApiKeys.keyHint,
      });

    return rows[0]!;
  });
}
