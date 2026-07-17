import { describe, expect, it } from 'vitest';
import { activationGraphBlockers, type ActivationGraphLink } from './activation-graph-blockers';

const trading = { id: 'tr1', type: 'trading' as const };

function link(
  fromModuleId: string,
  toModuleId: string,
  linkKind: ActivationGraphLink['linkKind'],
): ActivationGraphLink {
  return { fromModuleId, toModuleId, linkKind };
}

describe('activationGraphBlockers', () => {
  it('blocks trading with no inbound data_feed', () => {
    const reasons = activationGraphBlockers(trading, [
      link('t1', 'tr1', 'directive'),
      link('tr1', 'p1', 'directive'),
    ]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/inbound data feed/i);
  });

  it('allows trading with inbound data_feed from live_api', () => {
    expect(activationGraphBlockers(trading, [link('live1', 'tr1', 'data_feed')])).toEqual([]);
  });

  it('allows trading with inbound data_feed from math', () => {
    expect(activationGraphBlockers(trading, [link('m1', 'tr1', 'data_feed')])).toEqual([]);
  });

  it('ignores outbound data_feed edges on trading', () => {
    expect(activationGraphBlockers(trading, [link('tr1', 'disp1', 'data_feed')])).not.toEqual([]);
  });

  it('returns no blockers for non-trading module types', () => {
    expect(activationGraphBlockers({ id: 't1', type: 'trend' }, [])).toEqual([]);
    expect(activationGraphBlockers({ id: 'r1', type: 'research' }, [])).toEqual([]);
  });
});
