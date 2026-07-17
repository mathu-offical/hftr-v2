import { and, eq } from 'drizzle-orm';
import type { LlmProvider } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { userApiKeys } from '@hftr/db/schema';
import { withDecryptedSecret } from '@hftr/secrets';

/**
 * Load and decrypt a user-supplied provider API key. Plaintext is never logged
 * or returned outside the optional callback scope.
 */
export async function resolveUserApiKey(
  db: Db,
  clerkUserId: string,
  provider: LlmProvider,
): Promise<string | undefined> {
  const rows = await db
    .select({ ciphertext: userApiKeys.ciphertext })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  return withDecryptedSecret(row.ciphertext, 'llm_settings', (plain) => plain);
}

/**
 * Run a provider call with a decrypted key; plaintext never leaves this scope.
 */
export async function withUserApiKey<T>(
  db: Db,
  clerkUserId: string,
  provider: LlmProvider,
  fn: (apiKey: string) => Promise<T>,
): Promise<T | undefined> {
  const rows = await db
    .select({ ciphertext: userApiKeys.ciphertext })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  return withDecryptedSecret(row.ciphertext, 'llm_settings', fn);
}
