import { describe, expect, it, vi } from 'vitest';
import { drainQueues } from './drain';
import * as queue from './queue';
import type { Clock } from '../clock';

describe('drainQueues maintenance.sweep kick', () => {
  it('enqueues maintenance.sweep once per UTC minute before claiming', async () => {
    const clock: Clock = {
      nowMs: () => Date.parse('2026-07-17T15:04:00.000Z'),
      nowIso: () => '2026-07-17T15:04:00.000Z',
    };
    const enqueue = vi.spyOn(queue, 'enqueue').mockResolvedValue(undefined);
    vi.spyOn(queue, 'claimJobs').mockResolvedValue([]);

    await drainQueues({} as never, clock, { workerId: 'test', budgetMs: 1_000 });

    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      clock,
      expect.objectContaining({
        kind: 'maintenance.sweep',
        queueClass: 'MAINTENANCE',
        idempotencyKey: 'maintenance-sweep-2026-07-17T15:04',
        priority: 'LOW',
      }),
    );
  });

  it('skips maintenance.sweep kick when kickMaintenanceSweep is false', async () => {
    const clock: Clock = {
      nowMs: () => Date.parse('2026-07-17T15:04:00.000Z'),
      nowIso: () => '2026-07-17T15:04:00.000Z',
    };
    const enqueue = vi.spyOn(queue, 'enqueue').mockResolvedValue(undefined);
    const claim = vi.spyOn(queue, 'claimJobs').mockResolvedValue([]);

    await drainQueues({} as never, clock, {
      workerId: 'test',
      budgetMs: 1_000,
      kickMaintenanceSweep: false,
      queueClasses: ['RESEARCH', 'TACTICAL', 'COMPILE', 'DISPATCH'],
    });

    expect(enqueue).not.toHaveBeenCalled();
    expect(claim).toHaveBeenCalledWith(
      expect.anything(),
      clock,
      expect.objectContaining({
        queueClasses: ['RESEARCH', 'TACTICAL', 'COMPILE', 'DISPATCH'],
      }),
    );
  });
});
