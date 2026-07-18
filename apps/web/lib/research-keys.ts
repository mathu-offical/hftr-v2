import { and, eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { brokerConnections, userResearchKeys } from '@hftr/db/schema';
import { decryptSecret, withDecryptedSecret } from '@/lib/secrets';

export interface ResearchGatherKeys {
  braveApiKey?: string;
  marketNewsApiKey?: string;
  finnhubApiKey?: string;
  polygonApiKey?: string;
  fredApiKey?: string;
  alphaVantageApiKey?: string;
  alpacaKeyId?: string;
  alpacaSecret?: string;
}

function parseAlpacaBrokerCredentials(plain: string): { keyId: string; secret: string } | null {
  try {
    const parsed = JSON.parse(plain) as { keyId?: string; secret?: string };
    if (!parsed.keyId?.trim() || !parsed.secret?.trim()) return null;
    return { keyId: parsed.keyId.trim(), secret: parsed.secret.trim() };
  } catch {
    return null;
  }
}

/**
 * Decrypt operator research gather keys for enqueue payloads. Plaintext is never
 * logged and should only be passed into job payloads scoped to gather handlers.
 * Paper Alpaca broker credentials are loaded when present (live connections excluded).
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
    } else if (row.provider === 'finnhub') {
      keys.finnhubApiKey = plain;
    } else if (row.provider === 'polygon') {
      keys.polygonApiKey = plain;
    } else if (row.provider === 'fred') {
      keys.fredApiKey = plain;
    } else if (row.provider === 'alpha_vantage') {
      keys.alphaVantageApiKey = plain;
    }
  }

  const [alpacaConn] = await db
    .select({
      ciphertext: brokerConnections.ciphertext,
      mode: brokerConnections.mode,
      status: brokerConnections.status,
    })
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.clerkUserId, clerkUserId),
        eq(brokerConnections.venue, 'alpaca'),
        eq(brokerConnections.mode, 'paper'),
      ),
    )
    .limit(1);

  if (alpacaConn && alpacaConn.status !== 'revoked') {
    const plain = decryptSecret(alpacaConn.ciphertext, 'broker_credentials');
    const creds = parseAlpacaBrokerCredentials(plain);
    if (creds) {
      keys.alpacaKeyId = creds.keyId;
      keys.alpacaSecret = creds.secret;
    }
  }

  return keys;
}
