import { and, eq, ne } from 'drizzle-orm';
import type { CompoundSymbolScore } from '@hftr/contracts';
import { watchlistItems } from '@hftr/db/schema';
import type { ensureSystemLibrary } from './ensure-system-library';

type Db = Parameters<typeof ensureSystemLibrary>[0];

function biasFromDirection(direction: CompoundSymbolScore['direction']): 'long' | 'short' | 'neutral' {
  switch (direction) {
    case 'up':
      return 'long';
    case 'down':
      return 'short';
    case 'flat':
      return 'neutral';
    default: {
      const _exhaustive: never = direction;
      return _exhaustive;
    }
  }
}

/**
 * Upsert movers_rank suggestions without clobbering operator-owned rows.
 */
export async function upsertMoversRankSuggestions(opts: {
  db: Db;
  companyId: string;
  moduleId: string;
  scores: CompoundSymbolScore[];
  suggestionCap: number;
  now: Date;
}): Promise<{ upserted: number; skippedOperator: number }> {
  let upserted = 0;
  let skippedOperator = 0;
  const admitted = opts.scores.filter((s) => s.admitsSearch).slice(0, opts.suggestionCap);

  for (const score of admitted) {
    const [existing] = await opts.db
      .select({
        id: watchlistItems.id,
        sourceClass: watchlistItems.sourceClass,
        status: watchlistItems.status,
        note: watchlistItems.note,
      })
      .from(watchlistItems)
      .where(
        and(eq(watchlistItems.moduleId, opts.moduleId), eq(watchlistItems.symbol, score.symbol)),
      )
      .limit(1);

    if (existing?.sourceClass === 'operator') {
      skippedOperator += 1;
      continue;
    }

    const note = [
      'Movers rank suggestion.',
      `Leadership ${score.leadershipBand}; library ${score.libraryFitBand}; news ${score.newsFitBand};`,
      `corroboration domains ${score.corroborationDomains} (${score.corroborationBand}).`,
      `Direction ${score.direction}.`,
    ].join(' ');

    if (!existing) {
      await opts.db.insert(watchlistItems).values({
        companyId: opts.companyId,
        moduleId: opts.moduleId,
        symbol: score.symbol,
        bias: biasFromDirection(score.direction),
        note,
        sourceClass: 'movers_rank',
        status: 'suggested_search',
      });
      upserted += 1;
      continue;
    }

    // Do not downgrade verified → search; do not touch archived.
    if (existing.status === 'suggested_verified' || existing.status === 'archived') {
      continue;
    }
    if (existing.status === 'watching' || existing.status === 'triggered') {
      skippedOperator += 1;
      continue;
    }

    await opts.db
      .update(watchlistItems)
      .set({
        note,
        bias: biasFromDirection(score.direction),
        sourceClass: 'movers_rank',
        status: 'suggested_search',
        updatedAt: opts.now,
      })
      .where(and(eq(watchlistItems.id, existing.id), ne(watchlistItems.sourceClass, 'operator')));
    upserted += 1;
  }

  return { upserted, skippedOperator };
}

/**
 * Promote suggested_search → suggested_verified for symbols that pass corroboration.
 */
export async function promoteVerifiedSuggestions(opts: {
  db: Db;
  companyId: string;
  moduleId: string;
  symbols: string[];
  now: Date;
  noteSuffix?: string;
}): Promise<number> {
  if (opts.symbols.length === 0) return 0;
  let n = 0;
  const suffix = opts.noteSuffix ?? 'Quant-verified multi-source.';
  for (const symbol of opts.symbols) {
    const [existing] = await opts.db
      .select({ id: watchlistItems.id, note: watchlistItems.note })
      .from(watchlistItems)
      .where(
        and(
          eq(watchlistItems.companyId, opts.companyId),
          eq(watchlistItems.moduleId, opts.moduleId),
          eq(watchlistItems.symbol, symbol),
          eq(watchlistItems.status, 'suggested_search'),
          ne(watchlistItems.sourceClass, 'operator'),
        ),
      )
      .limit(1);
    if (!existing) continue;

    const note =
      existing.note.trim().length > 0 ? `${existing.note.trim()} ${suffix}` : suffix;

    await opts.db
      .update(watchlistItems)
      .set({
        status: 'suggested_verified',
        note,
        updatedAt: opts.now,
      })
      .where(eq(watchlistItems.id, existing.id));
    n += 1;
  }
  return n;
}
