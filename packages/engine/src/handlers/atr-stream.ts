import { z } from 'zod';
import { refreshAtrStreamForCompany } from '../calc/refresh-atr-stream';
import { registerHandler } from './registry';

const AtrStreamPayload = z.object({
  companyId: z.string().uuid(),
});

/**
 * MAINTENANCE queue: refresh atr_stream ValueRefs from Alpaca daily OHLC bars
 * for symbols with open positions. Model-free; credentials resolved at handler time.
 */
registerHandler('maintenance.atr_stream', async ({ db, clock, job }) => {
  const payload = AtrStreamPayload.parse(job.payload);
  await refreshAtrStreamForCompany(db, clock, payload.companyId);
});
