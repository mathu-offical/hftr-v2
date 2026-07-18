import { eq } from 'drizzle-orm';
import { fetchBars } from '@hftr/adapters';
import type { Db } from '@hftr/db';
import { brokerConnections } from '@hftr/db/schema';
import { decryptSecret } from '@hftr/secrets';
import type { Clock } from '../clock';
import { record } from '../calc/store';
import { buildRegimeFromBars, buildRegimeSynthetic } from '../pipeline/regime';
import type { RegimeSnapshot } from '@hftr/contracts';

/**
 * Prefer Alpaca OHLC bars for regime when a connected alpaca broker is bound;
 * otherwise fall back to deterministic synthetic regime (D-093).
 * Credentials decrypted in-process only — never written to job payloads.
 */
export async function resolvePromoteRegime(args: {
  db: Db;
  clock: Clock;
  companyId: string;
  moduleId: string;
  symbol: string;
  brokerConnectionId: string | null;
  venue: string | null;
  /** Lead direction — biases synthetic regime into regime_fit pass band. */
  direction?: 'up' | 'down' | 'flat';
}): Promise<{ regime: RegimeSnapshot; source: 'alpaca_bars' | 'synthetic' }> {
  const regimeAsOfRef = await record(args.db, args.clock, {
    kind: 'timestamp_ms',
    unit: 'ms',
    scale: 0,
    valueInt: BigInt(args.clock.nowMs()),
    timezone: 'UTC',
    sourceClass: 'clock',
    sourceId: `promote:regime_as_of:${args.symbol}`,
    ttlMs: 10 * 60_000,
    companyId: args.companyId,
    moduleId: args.moduleId,
  });
  const asOfRef = { ref: regimeAsOfRef };

  if (args.venue === 'alpaca' && args.brokerConnectionId) {
    try {
      const [conn] = await args.db
        .select({
          ciphertext: brokerConnections.ciphertext,
          status: brokerConnections.status,
          venue: brokerConnections.venue,
        })
        .from(brokerConnections)
        .where(eq(brokerConnections.id, args.brokerConnectionId))
        .limit(1);
      if (conn && conn.status === 'connected' && conn.venue === 'alpaca') {
        const plain = decryptSecret(conn.ciphertext, 'broker_credentials');
        const parsed = JSON.parse(plain) as { keyId?: string; secret?: string };
        if (parsed.keyId && parsed.secret) {
          const { bars } = await fetchBars({
            symbol: args.symbol,
            limit: 60,
            timeframe: '5Min',
            credentials: { keyId: parsed.keyId, secret: parsed.secret },
          });
          if (bars.length >= 10) {
            return {
              regime: buildRegimeFromBars({ bars, asOfRef }),
              source: 'alpaca_bars',
            };
          }
        }
      }
    } catch {
      // Soft-fallback to synthetic — promote must not fail closed on bar fetch.
    }
  }

  return {
    regime: buildRegimeSynthetic({
      seed: `${args.symbol}:${args.companyId}:${args.venue ?? 'paper_sim'}`,
      asOfRef,
      ...(args.direction ? { directionBias: args.direction } : {}),
    }),
    source: 'synthetic',
  };
}
