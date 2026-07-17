import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { QuoteSnapshot } from '@hftr/contracts';
import { simulationRuns } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { getSyntheticQuote } from '../dispatch/quotes';
import { registerHandler } from './registry';

const RunPayload = z.object({
  companyId: z.string().uuid(),
  runId: z.string().uuid(),
});

const RunConfig = z
  .object({
    symbol: z.string().min(1).max(12).default('SPY'),
    fillCount: z.number().int().min(1).max(12).default(3),
    quantityPerFill: z.number().int().min(1).max(100).default(1),
    actionVerb: z.enum(['buy', 'sell']).default('buy'),
  })
  .default({});

type PnlBand =
  | 'heavy_loss'
  | 'moderate_loss'
  | 'slight_loss'
  | 'breakeven'
  | 'slight_gain'
  | 'moderate_gain'
  | 'heavy_gain';

function pnlBandLabel(netCents: number): PnlBand {
  if (netCents <= -5000) return 'heavy_loss';
  if (netCents <= -500) return 'moderate_loss';
  if (netCents < 0) return 'slight_loss';
  if (netCents === 0) return 'breakeven';
  if (netCents < 500) return 'slight_gain';
  if (netCents < 5000) return 'moderate_gain';
  return 'heavy_gain';
}

function simulateFillPrice(quote: QuoteSnapshot, actionVerb: 'buy' | 'sell'): number | null {
  const isBuy = actionVerb === 'buy';
  const side = isBuy ? quote.askCents : quote.bidCents;
  const reference = side ?? quote.lastCents;
  if (reference === null) return null;
  const slip = Math.max(0, Math.round((reference * 2) / 10_000));
  return isBuy ? reference + slip : reference - slip;
}

function runPaperSimLoop(
  clock: Clock,
  config: z.infer<typeof RunConfig>,
): { fillCount: number; realizedPnlCents: number; band: PnlBand } {
  let netCents = 0;
  let fills = 0;
  let positionQty = 0;

  for (let i = 0; i < config.fillCount; i += 1) {
    const quote = getSyntheticQuote(config.symbol, clock);
    const price = simulateFillPrice(quote, config.actionVerb);
    if (price === null) continue;
    const qty = config.quantityPerFill;
    if (config.actionVerb === 'buy') {
      positionQty += qty;
      netCents -= price * qty;
    } else {
      const sellQty = Math.min(qty, positionQty);
      if (sellQty === 0) continue;
      positionQty -= sellQty;
      netCents += price * sellQty;
    }
    fills += 1;
  }

  if (positionQty > 0) {
    const mark = getSyntheticQuote(config.symbol, clock);
    const markCents = mark.lastCents ?? mark.askCents ?? 0;
    netCents += positionQty * markCents;
  }

  return { fillCount: fills, realizedPnlCents: netCents, band: pnlBandLabel(netCents) };
}

registerHandler('simulation.run', async ({ db, clock, job }) => {
  const payload = RunPayload.parse(job.payload);
  const [row] = await db
    .select()
    .from(simulationRuns)
    .where(
      and(eq(simulationRuns.id, payload.runId), eq(simulationRuns.companyId, payload.companyId)),
    )
    .limit(1);

  if (!row) throw new Error(`simulation_run_not_found:${payload.runId}`);
  if (row.status === 'completed') return;

  const now = new Date(clock.nowMs());
  await db
    .update(simulationRuns)
    .set({ status: 'running', updatedAt: now })
    .where(eq(simulationRuns.id, payload.runId));

  try {
    const config = RunConfig.parse(row.config ?? {});
    const sim = runPaperSimLoop(clock, config);
    await db
      .update(simulationRuns)
      .set({
        status: 'completed',
        resultSummary: {
          schemaVersion: 2,
          fillCount: sim.fillCount,
          realizedPnlBand: sim.band,
          realizedPnlCents: String(sim.realizedPnlCents),
          provenance: 'paper_sim',
          comparisonKeys: ['fillCount', 'realizedPnlBand'],
          symbol: config.symbol.toUpperCase(),
          actionVerb: config.actionVerb,
          note: 'deterministic_paper_sim_v2',
        },
        updatedAt: now,
      })
      .where(eq(simulationRuns.id, payload.runId));
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'simulation_failed';
    await db
      .update(simulationRuns)
      .set({
        status: 'failed',
        resultSummary: {
          schemaVersion: 2,
          fillCount: 0,
          provenance: 'paper_sim',
          failureDetail: detail,
        },
        updatedAt: now,
      })
      .where(eq(simulationRuns.id, payload.runId));
  }
});
