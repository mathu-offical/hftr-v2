import { z } from 'zod';
import { ensureSystemMoversLibrary } from '../libraries/system-movers';
import { registerHandler } from './registry';

const SystemMoversPayload = z.object({
  companyId: z.string().uuid(),
});

registerHandler('library.system_movers', async ({ db, clock, job }) => {
  const payload = SystemMoversPayload.parse(job.payload);
  await ensureSystemMoversLibrary(db, payload.companyId, new Date(clock.nowMs()), {
    refreshPlaceholders: true,
  });
});
