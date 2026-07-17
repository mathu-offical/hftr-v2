import { z } from 'zod';
import { trendCandidates } from '@hftr/db/schema';
import { record } from '../calc/store';
import { createFixedClock } from '../clock';
import { getSyntheticQuote } from '../dispatch/quotes';
import { registerHandler } from './registry';

const ScanPayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  symbols: z.array(z.string().min(1).max(12)).min(1).max(24),
  lookbackMinutes: z.number().int().min(5).max(390).default(60),
});

/** Drift thresholds in bps over the lookback window. */
const MODERATE_BPS = 20;
const STRONG_BPS = 60;

/**
 * Deterministic trend scan (RESEARCH queue). Computes quote drift over the
 * lookback window and emits trend candidates with qualitative strength bands.
 * Honestly labeled `deterministic_scan` — this is NOT model output; the LLM
 * tiers will later nominate candidates through the same table with
 * `model_nominated`. Drift values land in the ValueRef store, so the model
 * tier only ever sees the band, never the number.
 */
registerHandler('trend.scan', async ({ db, clock, job }) => {
  const payload = ScanPayload.parse(job.payload);
  const nowMs = clock.nowMs();
  const thenMs = nowMs - payload.lookbackMinutes * 60_000;
  const scannedAt = new Date(nowMs);

  for (const symbol of payload.symbols) {
    const nowQuote = getSyntheticQuote(symbol, clock);
    const thenQuote = getSyntheticQuote(symbol, createFixedClock(thenMs));
    const nowPx = nowQuote.lastCents ?? 0;
    const thenPx = thenQuote.lastCents ?? 0;
    if (nowPx === 0 || thenPx === 0) continue;

    const driftBps = Math.round(((nowPx - thenPx) / thenPx) * 10_000);
    const driftRef = await record(db, clock, {
      kind: 'bps',
      unit: 'bps',
      scale: 0,
      valueInt: BigInt(driftBps),
      sourceClass: 'derived',
      sourceId: `trend_scan:${nowQuote.symbol}:${payload.lookbackMinutes}m`,
      ttlMs: payload.lookbackMinutes * 60_000,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
    });

    const abs = Math.abs(driftBps);
    await db.insert(trendCandidates).values({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      symbol: nowQuote.symbol,
      direction: abs < MODERATE_BPS ? 'flat' : driftBps > 0 ? 'up' : 'down',
      strengthBand: abs >= STRONG_BPS ? 'strong' : abs >= MODERATE_BPS ? 'moderate' : 'weak',
      driftRef,
      sourceClass: 'deterministic_scan',
      scannedAt,
    });
  }
});
