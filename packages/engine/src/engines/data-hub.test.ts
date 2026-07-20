import { describe, expect, it } from 'vitest';
import { hubShelfStreamId, mergeEngineDataHubCompoundConfig } from '@hftr/contracts';
import { wireShelfOutputs, ensureEngineDataHub } from './data-hub';
import { bindSimAnalyzersToHub } from './sim-hub-bind';

describe('data-hub D-216 exports + merge contract', () => {
  it('exports ensure / shelf / sim bind helpers', () => {
    expect(typeof ensureEngineDataHub).toBe('function');
    expect(typeof wireShelfOutputs).toBe('function');
    expect(typeof bindSimAnalyzersToHub).toBe('function');
  });

  it('preserves operator-enabled shelf outs through merge used by ensure', () => {
    const merged = mergeEngineDataHubCompoundConfig({
      shelfOutputs: [
        {
          origin: 'sim_training',
          stream: 'semantic',
          bus: 'data_out',
          enabled: true,
          streamId: hubShelfStreamId('sim_training', 'semantic'),
        },
      ],
    });
    const out = merged.shelfOutputs.find(
      (row) => row.origin === 'sim_training' && row.stream === 'semantic',
    );
    expect(out?.enabled).toBe(true);
    expect(out?.streamId).toBe('shelf:sim_training:semantic');
  });
});
