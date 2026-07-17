import { eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { userResearchKeys } from '@hftr/db/schema';
import { withDecryptedSecret } from '@/lib/secrets';

export interface ResearchGatherKeys {
  braveApiKey?: string;
  marketNewsApiKey?: string;
}

/**
 * Decrypt operator research gather keys for enqueue payloads. Plaintext is never
 * logged and should only be passed into job payloads scoped to gather handlers.
 */
export async function loadResearchGatherKeys(
  db: Db,
  clerkUserId: string,
): Promise<ResearchGatherKeys> {
  const rows = await db
    .select({
      provider: userResearchKeys.provider,
      ciphertext: userResearchKeys.ciphertext,
    })
    .from(userResearchKeys)
    .where(eq(userResearchKeys.clerkUserId, clerkUserId));

  const keys: ResearchGatherKeys = {};
  for (const row of rows) {
    const plain = await withDecryptedSecret(row.ciphertext, 'research_settings', (p) => p);
    if (row.provider === 'brave') {
      keys.braveApiKey = plain;
    } else if (row.provider === 'market_news') {
      keys.marketNewsApiKey = plain;
    }
  }
  return keys;
}
