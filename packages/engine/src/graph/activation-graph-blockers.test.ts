import { describe, expect, it } from 'vitest';
import {
  activationGraphBlockers,
  type ActivationGraphLink,
  type ActivationGraphModule,
} from './activation-graph-blockers';

const trading = { id: 'tr1', type: 'trading' as const };
const research = { id: 'r1', type: 'research' as const };
const library = { id: 'lib1', type: 'library' as const };
const librarian = { id: 'libr1', type: 'librarian' as const };
const trend = { id: 't1', type: 'trend' as const };
const liveApi = { id: 'live1', type: 'live_api' as const };
const math = { id: 'm1', type: 'math' as const };
const time = { id: 'time1', type: 'time' as const };
const policy = { id: 'pol1', type: 'policy' as const };
const analyzer = { id: 'an1', type: 'analyzer' as const };

function link(
  fromModuleId: string,
  toModuleId: string,
  linkKind: ActivationGraphLink['linkKind'],
): ActivationGraphLink {
  return { fromModuleId, toModuleId, linkKind };
}

function peers(...modules: ActivationGraphModule[]): ActivationGraphModule[] {
  return modules;
}

/** D-091: time-bearing modules need Time inbound for activation. */
function withTime(toModuleId: string, links: ActivationGraphLink[] = []): ActivationGraphLink[] {
  return [...links, link('time1', toModuleId, 'data_feed')];
}

describe('activationGraphBlockers', () => {
  describe('trading', () => {
    it('blocks trading with no inbound data_feed', () => {
      const reasons = activationGraphBlockers(
        trading,
        withTime('tr1', [link('t1', 'tr1', 'directive'), link('tr1', 'p1', 'directive')]),
        peers(trend, trading, time),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/inbound data feed/i);
    });

    it('blocks trading without Time even when data_feed exists', () => {
      const reasons = activationGraphBlockers(
        trading,
        [link('live1', 'tr1', 'data_feed')],
        peers(liveApi, trading, time),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/inbound Time/i);
    });

    it('allows trading with inbound data_feed from live_api and Time', () => {
      expect(
        activationGraphBlockers(
          trading,
          withTime('tr1', [link('live1', 'tr1', 'data_feed')]),
          peers(liveApi, trading, time),
        ),
      ).toEqual([]);
    });

    it('allows trading with inbound data_feed from math and Time', () => {
      expect(
        activationGraphBlockers(
          trading,
          withTime('tr1', [link('m1', 'tr1', 'data_feed')]),
          peers(math, trading, time),
        ),
      ).toEqual([]);
    });

    it('ignores outbound data_feed edges on trading', () => {
      expect(
        activationGraphBlockers(
          trading,
          withTime('tr1', [link('tr1', 'disp1', 'data_feed')]),
          peers(trading, time),
        ),
      ).not.toEqual([]);
    });
  });

  describe('research', () => {
    it('blocks research with no outbound data_feed to library when a library peer exists', () => {
      const reasons = activationGraphBlockers(
        research,
        withTime('r1'),
        peers(research, library, time),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/outbound data feed link to a library module/i);
    });

    it('allows research with outbound data_feed to library and Time', () => {
      expect(
        activationGraphBlockers(
          research,
          withTime('r1', [link('r1', 'lib1', 'data_feed')]),
          peers(research, library, time),
        ),
      ).toEqual([]);
    });

    it('blocks research linked only to librarian when a library peer exists', () => {
      const reasons = activationGraphBlockers(
        research,
        withTime('r1', [link('r1', 'libr1', 'data_feed')]),
        peers(research, library, librarian, time),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/library module/i);
    });

    it('allows research → librarian when no library peer exists', () => {
      expect(
        activationGraphBlockers(
          research,
          withTime('r1', [link('r1', 'libr1', 'data_feed')]),
          peers(research, librarian, time),
        ),
      ).toEqual([]);
    });

    it('allows research → math when no library peer exists', () => {
      expect(
        activationGraphBlockers(
          research,
          withTime('r1', [link('r1', 'm1', 'data_feed')]),
          peers(research, math, time),
        ),
      ).toEqual([]);
    });

    it('blocks research with no outbound when only trend peer exists', () => {
      const reasons = activationGraphBlockers(
        research,
        withTime('r1'),
        peers(research, trend, time),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/library, librarian, or math/i);
    });
  });

  describe('trend', () => {
    it('blocks trend with no library/live inbound', () => {
      const reasons = activationGraphBlockers(trend, withTime('t1'), peers(trend, time));
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/library or live API/i);
    });

    it('allows trend with library inbound and Time', () => {
      expect(
        activationGraphBlockers(
          trend,
          withTime('t1', [link('lib1', 't1', 'data_feed')]),
          peers(library, trend, time),
        ),
      ).toEqual([]);
    });

    it('allows trend with live_api inbound and Time', () => {
      expect(
        activationGraphBlockers(
          trend,
          withTime('t1', [link('live1', 't1', 'data_feed')]),
          peers(liveApi, trend, time),
        ),
      ).toEqual([]);
    });
  });

  describe('library', () => {
    it('blocks library with no research/librarian inbound', () => {
      const reasons = activationGraphBlockers(library, [], peers(library));
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/research or librarian/i);
    });

    it('allows library with research inbound', () => {
      expect(
        activationGraphBlockers(
          library,
          [link('r1', 'lib1', 'data_feed')],
          peers(research, library),
        ),
      ).toEqual([]);
    });

    it('allows library with librarian inbound', () => {
      expect(
        activationGraphBlockers(
          library,
          [link('libr1', 'lib1', 'data_feed')],
          peers(librarian, library),
        ),
      ).toEqual([]);
    });
  });

  describe('librarian', () => {
    it('blocks librarian with no library/research inbound', () => {
      const reasons = activationGraphBlockers(
        librarian,
        withTime('libr1'),
        peers(librarian, time),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/library or research/i);
    });

    it('allows librarian with library inbound and Time', () => {
      expect(
        activationGraphBlockers(
          librarian,
          withTime('libr1', [link('lib1', 'libr1', 'data_feed')]),
          peers(library, librarian, time),
        ),
      ).toEqual([]);
    });

    it('allows librarian with research inbound and Time', () => {
      expect(
        activationGraphBlockers(
          librarian,
          withTime('libr1', [link('r1', 'libr1', 'data_feed')]),
          peers(research, librarian, time),
        ),
      ).toEqual([]);
    });
  });

  describe('time-bearing policy/analyzer', () => {
    it('blocks policy without Time', () => {
      const reasons = activationGraphBlockers(policy, [], peers(policy, time));
      expect(reasons[0]).toMatch(/inbound Time/i);
    });

    it('allows policy with Time', () => {
      expect(
        activationGraphBlockers(policy, withTime('pol1'), peers(policy, time)),
      ).toEqual([]);
    });

    it('blocks analyzer without Time', () => {
      const reasons = activationGraphBlockers(analyzer, [], peers(analyzer, time));
      expect(reasons[0]).toMatch(/inbound Time/i);
    });
  });

  describe('always-ok types', () => {
    it('allows live_api with no links', () => {
      expect(activationGraphBlockers(liveApi, [], peers(liveApi))).toEqual([]);
    });

    it('allows math with no links', () => {
      expect(activationGraphBlockers(math, [], peers(math))).toEqual([]);
    });
  });
});
