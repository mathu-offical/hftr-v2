import { and, eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { brokerConnections, companies, userResearchKeys } from '@hftr/db/schema';
import { decryptSecret, withDecryptedSecret } from '@hftr/secrets';

/**
 * In-memory gather credentials resolved at handler time.
 * Never serialize these into `jobs.payload` (D-074).
 */
export interface ResearchGatherCredentials {
  braveApiKey: string | null;
  marketNewsApiKey: string | null;
  finnhubApiKey: string | null;
  polygonApiKey: string | null;
  fredApiKey: string | null;
  alphaVantageApiKey: string | null;
  twelveDataApiKey: string | null;
  marketstackApiKey: string | null;
  alpacaKeyId: string | null;
  alpacaSecret: string | null;
}

const EMPTY_CREDENTIALS: ResearchGatherCredentials = {
  braveApiKey: null,
  marketNewsApiKey: null,
  finnhubApiKey: null,
  polygonApiKey: null,
  fredApiKey: null,
  alphaVantageApiKey: null,
  twelveDataApiKey: null,
  marketstackApiKey: null,
  alpacaKeyId: null,
  alpacaSecret: null,
};

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
 * Decrypt operator research gather keys for the company owner at handler time.
 * Plaintext stays in-process only — never written to job payloads, envelopes, or logs.
 * Soft-skips undecryptable rows so one bad ciphertext does not abort other sources.
 */
export async function resolveResearchGatherCredentials(
  db: Db,
  companyId: string,
): Promise<ResearchGatherCredentials> {
  const [company] = await db
    .select({ clerkUserId: companies.clerkUserId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return { ...EMPTY_CREDENTIALS };

  const clerkUserId = company.clerkUserId;
  const keys: ResearchGatherCredentials = { ...EMPTY_CREDENTIALS };

  const rows = await db
    .select({
      provider: userResearchKeys.provider,
      ciphertext: userResearchKeys.ciphertext,
    })
    .from(userResearchKeys)
    .where(eq(userResearchKeys.clerkUserId, clerkUserId));

  for (const row of rows) {
    let plain: string;
    try {
      plain = await withDecryptedSecret(row.ciphertext, 'research_settings', (p) => p);
    } catch {
      continue;
    }
    switch (row.provider) {
      case 'brave':
        keys.braveApiKey = plain;
        break;
      case 'market_news':
        keys.marketNewsApiKey = plain;
        break;
      case 'finnhub':
        keys.finnhubApiKey = plain;
        break;
      case 'polygon':
        keys.polygonApiKey = plain;
        break;
      case 'fred':
        keys.fredApiKey = plain;
        break;
      case 'alpha_vantage':
        keys.alphaVantageApiKey = plain;
        break;
      case 'twelve_data':
        keys.twelveDataApiKey = plain;
        break;
      case 'marketstack':
        keys.marketstackApiKey = plain;
        break;
      default: {
        const _exhaustive: never = row.provider;
        void _exhaustive;
      }
    }
  }

  const [alpacaConn] = await db
    .select({
      ciphertext: brokerConnections.ciphertext,
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
    try {
      const plain = decryptSecret(alpacaConn.ciphertext, 'broker_credentials');
      const creds = parseAlpacaBrokerCredentials(plain);
      if (creds) {
        keys.alpacaKeyId = creds.keyId;
        keys.alpacaSecret = creds.secret;
      }
    } catch {
      // Soft-skip — paper Alpaca news/bars simply omit credentials.
    }
  }

  return keys;
}
