import { eq } from 'drizzle-orm';
import { ResearchKeyProvider } from '@hftr/contracts';
import { userResearchKeys } from '@hftr/db/schema';
import { resolveAllOwnedCompanyServiceBindings } from '@hftr/engine';
import { z } from 'zod';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { encryptSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

const UpsertResearchKeyInput = z.object({
  provider: ResearchKeyProvider,
  apiKey: z
    .string()
    .trim()
    .min(8, 'Key must be at least 8 characters')
    .max(512, 'Key must be at most 512 characters'),
});

function encryptionError(err: unknown): ApiError {
  const msg = err instanceof Error ? err.message : '';
  if (msg.startsWith('encryption_key_missing:')) {
    return new ApiError(503, 'encryption_key_missing');
  }
  return new ApiError(500, 'encryption_failed');
}

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
    } catch (err) {
      throw encryptionError(err);
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

    try {
      await resolveAllOwnedCompanyServiceBindings(db, clerkUserId);
    } catch (err) {
      console.error('resolveAllOwnedCompanyServiceBindings failed after research key upsert', err);
    }

    return rows[0]!;
  });
}
