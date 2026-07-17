import { and, eq } from 'drizzle-orm';
import { LlmProvider } from '@hftr/contracts';
import { userApiKeys } from '@hftr/db/schema';
import { z } from 'zod';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { encryptSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

const RetentionAttested = z.enum(['none', 'org_zdr']);

const UpsertKeyInput = z.object({
  provider: LlmProvider,
  apiKey: z.string().min(8).max(200).optional(),
  retentionAttested: RetentionAttested.optional(),
});

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const rows = await db
      .select({
        provider: userApiKeys.provider,
        keyHint: userApiKeys.keyHint,
        retentionAttested: userApiKeys.retentionAttested,
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
    if (!input.apiKey && input.retentionAttested === undefined) {
      throw new ApiError(400, 'invalid_input');
    }

    const existing = await db
      .select({ id: userApiKeys.id })
      .from(userApiKeys)
      .where(
        and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, input.provider)),
      )
      .limit(1);

    if (!input.apiKey && existing.length === 0) {
      throw new ApiError(400, 'key_required');
    }

    if (input.apiKey) {
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
          retentionAttested: input.retentionAttested ?? 'none',
        })
        .onConflictDoUpdate({
          target: [userApiKeys.clerkUserId, userApiKeys.provider],
          set: {
            ciphertext: encrypted.ciphertext,
            keyHint: encrypted.hint,
            ...(input.retentionAttested !== undefined
              ? { retentionAttested: input.retentionAttested }
              : {}),
            updatedAt: new Date(),
          },
        })
        .returning({
          provider: userApiKeys.provider,
          keyHint: userApiKeys.keyHint,
          retentionAttested: userApiKeys.retentionAttested,
        });

      return rows[0]!;
    }

    const rows = await db
      .update(userApiKeys)
      .set({
        retentionAttested: input.retentionAttested!,
        updatedAt: new Date(),
      })
      .where(
        and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, input.provider)),
      )
      .returning({
        provider: userApiKeys.provider,
        keyHint: userApiKeys.keyHint,
        retentionAttested: userApiKeys.retentionAttested,
      });

    if (!rows[0]) {
      throw new ApiError(404, 'not_found');
    }
    return rows[0];
  });
}
