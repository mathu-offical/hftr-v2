import { describe, expect, it, vi } from 'vitest';
import { createFixedClock } from '../clock';
import { releaseExtraCompanyClaims, type ClaimedJob } from './queue';

function job(partial: Partial<ClaimedJob> & Pick<ClaimedJob, 'id' | 'companyId'>): ClaimedJob {
  return {
    queueClass: 'RESEARCH',
    kind: 'research.curate',
    priority: 10,
    runAfter: new Date('2026-07-17T12:00:00.000Z'),
    lockedUntil: new Date('2026-07-17T12:01:00.000Z'),
    lockedBy: 'worker-1',
    attempts: 1,
    maxAttempts: 5,
    status: 'active',
    payload: {},
    costEstimate: {},
    lastError: null,
    idempotencyKey: partial.id,
    moduleId: null,
    createdAt: new Date('2026-07-17T12:00:00.000Z'),
    updatedAt: new Date('2026-07-17T12:00:00.000Z'),
    ...partial,
  } as ClaimedJob;
}

function mockDb() {
  return {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
  };
}

describe('releaseExtraCompanyClaims', () => {
  it('keeps one job per company and requeues extras; null-company stays parallel', async () => {
    const dbStub = mockDb();
    const claimed = [
      job({ id: 'a1', companyId: 'c1', attempts: 2 }),
      job({ id: 'a2', companyId: 'c1', attempts: 1 }),
      job({ id: 'b1', companyId: 'c2', attempts: 1 }),
      job({ id: 'm1', companyId: null, attempts: 1 }),
      job({ id: 'm2', companyId: null, attempts: 1 }),
    ];

    const keep = await releaseExtraCompanyClaims(
      dbStub as never,
      createFixedClock(new Date('2026-07-17T12:00:00.000Z').getTime()),
      claimed,
      10,
    );

    expect(keep.map((row) => row.id)).toEqual(['a1', 'b1', 'm1', 'm2']);
    expect(dbStub.update).toHaveBeenCalledTimes(1);
  });

  it('respects the batch limit after company dedupe', async () => {
    const dbStub = mockDb();
    const claimed = [
      job({ id: 'a1', companyId: 'c1' }),
      job({ id: 'b1', companyId: 'c2' }),
      job({ id: 'd1', companyId: 'c3' }),
    ];
    const keep = await releaseExtraCompanyClaims(
      dbStub as never,
      createFixedClock(0),
      claimed,
      2,
    );
    expect(keep.map((row) => row.id)).toEqual(['a1', 'b1']);
    expect(dbStub.update).toHaveBeenCalledTimes(1);
  });
});
