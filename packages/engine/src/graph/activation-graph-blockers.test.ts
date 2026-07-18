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

describe('activationGraphBlockers', () => {
  describe('trading', () => {
    it('blocks trading with no inbound data_feed', () => {
      const reasons = activationGraphBlockers(
        trading,
        [link('t1', 'tr1', 'directive'), link('tr1', 'p1', 'directive')],
        peers(trend, trading),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/inbound data feed/i);
    });

    it('allows trading with inbound data_feed from live_api', () => {
      expect(
        activationGraphBlockers(
          trading,
          [link('live1', 'tr1', 'data_feed')],
          peers(liveApi, trading),
        ),
      ).toEqual([]);
    });

    it('allows trading with inbound data_feed from math', () => {
      expect(
        activationGraphBlockers(trading, [link('m1', 'tr1', 'data_feed')], peers(math, trading)),
      ).toEqual([]);
    });

    it('ignores outbound data_feed edges on trading', () => {
      expect(
        activationGraphBlockers(trading, [link('tr1', 'disp1', 'data_feed')], peers(trading)),
      ).not.toEqual([]);
    });
  });

  describe('research', () => {
    it('blocks research with no outbound data_feed to library when a library peer exists', () => {
      const reasons = activationGraphBlockers(research, [], peers(research, library));
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/outbound data feed link to a library module/i);
    });

    it('allows research with outbound data_feed to library', () => {
      expect(
        activationGraphBlockers(
          research,
          [link('r1', 'lib1', 'data_feed')],
          peers(research, library),
        ),
      ).toEqual([]);
    });

    it('blocks research linked only to librarian when a library peer exists', () => {
      const reasons = activationGraphBlockers(
        research,
        [link('r1', 'libr1', 'data_feed')],
        peers(research, library, librarian),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/library module/i);
    });

    it('allows research outbound to librarian when no library peer exists', () => {
      expect(
        activationGraphBlockers(
          research,
          [link('r1', 'libr1', 'data_feed')],
          peers(research, librarian),
        ),
      ).toEqual([]);
    });

    it('allows research outbound to math when no library peer exists', () => {
      expect(
        activationGraphBlockers(research, [link('r1', 'm1', 'data_feed')], peers(research, math)),
      ).toEqual([]);
    });

    it('blocks research with no outbound consumer when no library peer exists', () => {
      const reasons = activationGraphBlockers(research, [], peers(research, trend));
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/library, librarian, or math module/i);
    });
  });

  describe('trend', () => {
    it('blocks trend with no inbound data_feed from library or live_api', () => {
      const reasons = activationGraphBlockers(
        trend,
        [link('m1', 't1', 'data_feed')],
        peers(math, trend),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/library or live API/i);
    });

    it('allows trend with inbound data_feed from library', () => {
      expect(
        activationGraphBlockers(trend, [link('lib1', 't1', 'data_feed')], peers(library, trend)),
      ).toEqual([]);
    });

    it('allows trend with inbound data_feed from live_api', () => {
      expect(
        activationGraphBlockers(trend, [link('live1', 't1', 'data_feed')], peers(liveApi, trend)),
      ).toEqual([]);
    });
  });

  describe('library', () => {
    it('blocks library with no inbound data_feed from research or librarian', () => {
      const reasons = activationGraphBlockers(
        library,
        [link('live1', 'lib1', 'data_feed')],
        peers(liveApi, library),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/research or librarian/i);
    });

    it('allows library with inbound data_feed from research', () => {
      expect(
        activationGraphBlockers(
          library,
          [link('r1', 'lib1', 'data_feed')],
          peers(research, library),
        ),
      ).toEqual([]);
    });

    it('allows library with inbound data_feed from librarian', () => {
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
    it('blocks librarian with no inbound data_feed from library or research', () => {
      const reasons = activationGraphBlockers(
        librarian,
        [link('live1', 'libr1', 'data_feed')],
        peers(liveApi, librarian),
      );
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatch(/library or research/i);
    });

    it('allows librarian with inbound data_feed from library', () => {
      expect(
        activationGraphBlockers(
          librarian,
          [link('lib1', 'libr1', 'data_feed')],
          peers(library, librarian),
        ),
      ).toEqual([]);
    });

    it('allows librarian with inbound data_feed from research', () => {
      expect(
        activationGraphBlockers(
          librarian,
          [link('r1', 'libr1', 'data_feed')],
          peers(research, librarian),
        ),
      ).toEqual([]);
    });
  });

  describe('other module types', () => {
    it('returns no blockers for live_api', () => {
      expect(activationGraphBlockers(liveApi, [], peers(liveApi))).toEqual([]);
    });

    it('returns no blockers for math', () => {
      expect(activationGraphBlockers(math, [], peers(math))).toEqual([]);
    });
  });
});
