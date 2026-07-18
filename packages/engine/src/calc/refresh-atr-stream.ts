import { and, eq, gt } from 'drizzle-orm';
import { fetchBars, type FetchBarsParams, type FetchBarsResult } from '@hftr/adapters';
import type { Db } from '@hftr/db';
import { brokerConnections, companies, positions } from '@hftr/db/schema';
import { decryptSecret } from '@hftr/secrets';
import type { Clock } from '../clock';
import type { OhlcBarCents } from './atr';
import { resolveAtrCents } from './resolve-atr';

export interface OpenPositionSymbolRow {
  symbol: string;
  moduleId: string;
  markCents: number;
}

export interface AlpacaPaperCredentials {
  keyId: string;
  secret: string;
}

export interface RefreshAtrStreamDeps {
  fetchBars?: (params: FetchBarsParams) => Promise<FetchBarsResult>;
  resolveAtrCents?: typeof resolveAtrCents;
  loadOpenPositionSymbols?: (db: Db, companyId: string) => Promise<OpenPositionSymbolRow[]>;
  loadAlpacaPaperCredentials?: (
    db: Db,
    companyId: string,
  ) => Promise<AlpacaPaperCredentials | null>;
}

/** Map Alpaca dollar OHLC to integer cents for the model-free ATR calculator. */
export function mapOhlcBarsToCents(
  bars: readonly { high: number; low: number; close: number }[],
): OhlcBarCents[] {
  return bars.map((b) => ({
    highCents: Math.round(b.high * 100),
    lowCents: Math.round(b.low * 100),
    closeCents: Math.round(b.close * 100),
  }));
}

async function defaultLoadOpenPositionSymbols(
  db: Db,
  companyId: string,
): Promise<OpenPositionSymbolRow[]> {
  const rows = await db
    .select({
      symbol: positions.symbol,
      moduleId: positions.moduleId,
      avgCostCents: positions.avgCostCents,
    })
    .from(positions)
    .where(and(eq(positions.companyId, companyId), gt(positions.qty, 0n)));

  const bySymbol = new Map<string, OpenPositionSymbolRow>();
  for (const row of rows) {
    const symbol = row.symbol.toUpperCase();
    if (!bySymbol.has(symbol)) {
      bySymbol.set(symbol, {
        symbol,
        moduleId: row.moduleId,
        markCents: row.avgCostCents,
      });
    }
  }
  return [...bySymbol.values()];
}

async function defaultLoadAlpacaPaperCredentials(
  db: Db,
  companyId: string,
): Promise<AlpacaPaperCredentials | null> {
  const [company] = await db
    .select({ brokerConnectionId: companies.brokerConnectionId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company?.brokerConnectionId) return null;

  const [conn] = await db
    .select({
      ciphertext: brokerConnections.ciphertext,
      status: brokerConnections.status,
      venue: brokerConnections.venue,
      mode: brokerConnections.mode,
    })
    .from(brokerConnections)
    .where(eq(brokerConnections.id, company.brokerConnectionId))
    .limit(1);

  if (!conn || conn.status !== 'connected' || conn.venue !== 'alpaca' || conn.mode !== 'paper') {
    return null;
  }

  try {
    const plain = decryptSecret(conn.ciphertext, 'broker_credentials');
    const parsed = JSON.parse(plain) as { keyId?: string; secret?: string };
    if (parsed.keyId && parsed.secret) {
      return { keyId: parsed.keyId, secret: parsed.secret };
    }
  } catch {
    // Fail-open — synthetic ATR remains available downstream.
  }
  return null;
}

/**
 * Refresh atr_stream ValueRefs for symbols with open positions (qty > 0).
 * Fail-open: no Alpaca paper connection → skip company; per-symbol bar/ATR errors swallowed.
 */
export async function refreshAtrStreamForCompany(
  db: Db,
  clock: Clock,
  companyId: string,
  deps: RefreshAtrStreamDeps = {},
): Promise<{ refreshed: number; skipped: number }> {
  const fetchBarsFn = deps.fetchBars ?? fetchBars;
  const resolveAtrFn = deps.resolveAtrCents ?? resolveAtrCents;
  const loadSymbols = deps.loadOpenPositionSymbols ?? defaultLoadOpenPositionSymbols;
  const loadCredentials = deps.loadAlpacaPaperCredentials ?? defaultLoadAlpacaPaperCredentials;

  const symbols = await loadSymbols(db, companyId);
  if (symbols.length === 0) {
    return { refreshed: 0, skipped: 0 };
  }

  const credentials = await loadCredentials(db, companyId);
  if (!credentials) {
    return { refreshed: 0, skipped: symbols.length };
  }

  let refreshed = 0;
  let skipped = 0;

  for (const row of symbols) {
    try {
      const { bars } = await fetchBarsFn({
        symbol: row.symbol,
        limit: 30,
        timeframe: '1Day',
        credentials,
      });
      await resolveAtrFn({
        db,
        clock,
        symbol: row.symbol,
        markCents: row.markCents,
        companyId,
        moduleId: row.moduleId,
        bars: mapOhlcBarsToCents(bars),
      });
      refreshed += 1;
    } catch {
      skipped += 1;
    }
  }

  return { refreshed, skipped };
}
