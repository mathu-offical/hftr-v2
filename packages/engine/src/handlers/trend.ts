import { z } from 'zod';
import { trendCandidates } from '@hftr/db/schema';
import { record } from '../calc/store';
import { createFixedClock } from '../clock';
import { resolveExecutionContext } from '../dispatch/execution-context';
import { getSyntheticQuote } from '../dispatch/quotes';
import {
  instrumentsFromModuleConfig,
  loadCompanyLinkGraph,
  resolveInboundLiveApiModules,
} from '../graph/module-links';
import { resolveLookbackQuotes } from '../live-api/lookback-quotes';
import { pollQuotes } from '../live-api/poll-quotes';
import { enqueueLinkedResearchCurate } from '../research/enqueue-linked';
import { registerHandler } from './registry';

const ScanPayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  symbols: z.array(z.string().min(1).max(12)).max(24).default([]),
  lookbackMinutes: z.number().int().min(5).max(390).default(60),
});

/** Drift thresholds in bps over the lookback window. */
const MODERATE_BPS = 20;
const STRONG_BPS = 60;

/**
 * Deterministic trend scan (RESEARCH queue). Computes quote drift over the
 * lookback window and emits trend candidates with qualitative strength bands.
 * Symbols come from the job payload and/or live_api→trend data_feed edges /
 * trend module instruments config — canvas links drive scan inputs.
 */
registerHandler('trend.scan', async ({ db, clock, job }) => {
  const payload = ScanPayload.parse(job.payload);
  const graph = await loadCompanyLinkGraph(db, payload.companyId);
  const trendMod = graph.modulesById.get(payload.moduleId);
  const fromLiveApi = resolveInboundLiveApiModules(graph, payload.moduleId).flatMap((m) =>
    instrumentsFromModuleConfig(m.config),
  );
  const fromTrendConfig = trendMod ? instrumentsFromModuleConfig(trendMod.config) : [];
  const symbolSet = new Set<string>();
  for (const s of [...payload.symbols, ...fromLiveApi, ...fromTrendConfig]) {
    const up = s.trim().toUpperCase();
    if (up.length >= 1 && up.length <= 12) symbolSet.add(up);
  }
  const symbols = [...symbolSet].slice(0, 24);
  if (symbols.length === 0) return;

  const liveApiModules = resolveInboundLiveApiModules(graph, payload.moduleId);
  let quoteAdapter = null;
  if (liveApiModules.length > 0) {
    try {
      const execCtx = await resolveExecutionContext(db, clock, payload.companyId);
      if (execCtx.adapter.venue === 'alpaca' && execCtx.companyMode === 'paper') {
        quoteAdapter = execCtx.adapter;
      }
    } catch {
      quoteAdapter = null;
    }
  }

  const quotePoll = await pollQuotes({
    instruments: symbols,
    clock,
    adapter: quoteAdapter,
    maxSymbols: 8,
  });

  const nowMs = clock.nowMs();
  const thenMs = nowMs - payload.lookbackMinutes * 60_000;
  const lookbackPoll = await resolveLookbackQuotes({
    instruments: symbols,
    atMs: thenMs,
    clock,
    adapter: quoteAdapter,
    maxSymbols: 8,
  });
  const scannedAt = new Date(nowMs);
  let hasNonFlat = false;

  for (const symbol of symbols) {
    const pollStatus = quotePoll.statuses.find((s) => s.symbol === symbol);
    const lookbackStatus = lookbackPoll.statuses.find((s) => s.symbol === symbol);
    const liveFeedClass = pollStatus?.feedClass ?? 'synthetic_sim';
    const lookbackFeedClass = lookbackStatus?.feedClass ?? 'synthetic_sim';
    const nowQuote =
      quotePoll.quotes.get(symbol) ?? getSyntheticQuote(symbol, clock);
    const thenQuote =
      lookbackPoll.quotes.get(symbol) ??
      getSyntheticQuote(symbol, createFixedClock(thenMs));
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
      sourceId: `trend_scan:${liveFeedClass}->${lookbackFeedClass}:${nowQuote.symbol}:${payload.lookbackMinutes}m`,
      ttlMs: payload.lookbackMinutes * 60_000,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
    });

    const abs = Math.abs(driftBps);
    const direction = abs < MODERATE_BPS ? 'flat' : driftBps > 0 ? 'up' : 'down';
    if (direction !== 'flat') hasNonFlat = true;
    await db.insert(trendCandidates).values({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      symbol: nowQuote.symbol,
      direction,
      strengthBand: abs >= STRONG_BPS ? 'strong' : abs >= MODERATE_BPS ? 'moderate' : 'weak',
      driftRef,
      sourceClass: 'deterministic_scan',
      scannedAt,
    });
  }

  if (hasNonFlat) {
    await enqueueLinkedResearchCurate(db, clock, {
      companyId: payload.companyId,
      sourceModuleId: payload.moduleId,
      queryText: symbols.join(' '),
    });
  }
});
