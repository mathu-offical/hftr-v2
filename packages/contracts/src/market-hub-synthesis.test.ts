import { describe, expect, it } from 'vitest';
import {
  MARKET_HUB_SYNTHESIS_STAGE_META,
  MARKET_HUB_SYNTHESIS_STAGE_ORDER,
  MarketHubSynthesisRun,
  MarketHubSynthesisStageId,
} from './market-hub-synthesis';

describe('MarketHubSynthesisRun', () => {
  it('parses a running run with stages', () => {
    const parsed = MarketHubSynthesisRun.parse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      status: 'running',
      startedAt: '2026-07-18T18:00:00.000Z',
      finishedAt: null,
      errorCode: null,
      stages: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          runId: '11111111-1111-4111-8111-111111111111',
          stageId: 'gather',
          label: 'Gather evidence',
          kind: 'data',
          status: 'succeeded',
          startedAt: '2026-07-18T18:00:01.000Z',
          finishedAt: '2026-07-18T18:00:02.000Z',
          summary: 'Gathered entitled lanes',
          justificationLines: ['Model-free gather'],
          jobId: null,
          sortOrder: 1,
        },
      ],
    });
    expect(parsed.stages[0]?.stageId).toBe('gather');
  });

  it('exposes full stage vocabulary with track and layer (D-160)', () => {
    expect(MARKET_HUB_SYNTHESIS_STAGE_ORDER).toContain('narrative');
    expect(MARKET_HUB_SYNTHESIS_STAGE_ORDER).toContain('hub_ready');
    for (const id of MARKET_HUB_SYNTHESIS_STAGE_ORDER) {
      expect(MarketHubSynthesisStageId.parse(id)).toBe(id);
      const meta = MARKET_HUB_SYNTHESIS_STAGE_META[id];
      expect(meta.track).toBeTruthy();
      expect(meta.layer).toBeTruthy();
      expect(meta.dataRole.length).toBeGreaterThan(0);
    }
  });
});
