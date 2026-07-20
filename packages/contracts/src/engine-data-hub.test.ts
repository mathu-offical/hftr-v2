import { describe, expect, it } from 'vitest';
import {
  defaultEngineDataHubCompoundConfig,
  defaultHubShelfSlots,
  hubShelfStreamId,
  mergeEngineDataHubCompoundConfig,
} from './engine-data-hub';

describe('engine-data-hub (D-216)', () => {
  it('defaults to full origin×stream shelf matrix with topic feed on', () => {
    const cfg = defaultEngineDataHubCompoundConfig();
    expect(cfg.shelves).toHaveLength(12);
    expect(cfg.shelfOutputs).toHaveLength(12);
    expect(cfg.topicFeed.enabled).toBe(true);
    expect(cfg.shelfOutputs.every((o) => o.enabled === false)).toBe(true);
    expect(hubShelfStreamId('sim_training', 'semantic')).toBe('shelf:sim_training:semantic');
  });

  it('orders shelves by origin then stream', () => {
    const slots = defaultHubShelfSlots();
    expect(slots[0]).toMatchObject({ origin: 'research_in', stream: 'semantic' });
    expect(slots[3]).toMatchObject({ origin: 'exec_runtime', stream: 'semantic' });
    expect(slots[6]).toMatchObject({ origin: 'sim_training', stream: 'semantic' });
    expect(slots[9]).toMatchObject({ origin: 'policy_returns', stream: 'semantic' });
  });

  it('merge preserves operator-enabled shelf outs and custom labels', () => {
    const merged = mergeEngineDataHubCompoundConfig({
      shelves: [
        {
          origin: 'sim_training',
          stream: 'semantic',
          label: 'Sim Insights',
        },
      ],
      shelfOutputs: [
        {
          origin: 'sim_training',
          stream: 'semantic',
          bus: 'data_out',
          enabled: true,
          streamId: 'custom:sim_sem',
        },
      ],
      topicFeed: { enabled: false },
    });
    expect(merged.topicFeed.enabled).toBe(false);
    expect(merged.shelves).toHaveLength(12);
    const simSem = merged.shelves.find(
      (s) => s.origin === 'sim_training' && s.stream === 'semantic',
    );
    expect(simSem?.label).toBe('Sim Insights');
    const out = merged.shelfOutputs.find(
      (o) => o.origin === 'sim_training' && o.stream === 'semantic',
    );
    expect(out?.enabled).toBe(true);
    expect(out?.streamId).toBe('custom:sim_sem');
  });
});
