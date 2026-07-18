import { describe, expect, it } from 'vitest';
import {
  MOVERS_LANE_SOURCE_KINDS,
  researchAvailabilityFromCredentials,
  selectReadyLaneSourceKinds,
} from './posture-sources';
import type { ResearchGatherCredentials } from './gather-credentials';

const empty: ResearchGatherCredentials = {
  braveApiKey: null,
  marketNewsApiKey: null,
  finnhubApiKey: null,
  polygonApiKey: null,
  fredApiKey: null,
  alphaVantageApiKey: null,
  twelveDataApiKey: null,
  marketstackApiKey: null,
  alpacaKeyId: null,
  alpacaSecret: null,
};

describe('posture-sources', () => {
  it('includes public no-auth kinds without keys', () => {
    const ready = selectReadyLaneSourceKinds(empty, MOVERS_LANE_SOURCE_KINDS);
    expect(ready).toContain('sec_edgar');
    expect(ready).toContain('gdelt_news');
    expect(ready).toContain('frankfurter_fx');
    expect(ready).not.toContain('brave_search');
    expect(ready).not.toContain('alpaca_bars');
  });

  it('includes keyed and alpaca kinds when credentials present', () => {
    const ready = selectReadyLaneSourceKinds(
      {
        ...empty,
        braveApiKey: 'brave-key-xxxxxxxx',
        alpacaKeyId: 'PKTEST',
        alpacaSecret: 'secret-xxxxxxxx',
      },
      MOVERS_LANE_SOURCE_KINDS,
    );
    expect(ready).toContain('brave_search');
    expect(ready).toContain('alpaca_bars');
    expect(ready).toContain('alpaca_news');
  });

  it('maps research key providers for availability', () => {
    const avail = researchAvailabilityFromCredentials({
      ...empty,
      fredApiKey: 'fred-key',
      twelveDataApiKey: 'td-key',
    });
    expect(avail.researchKeys).toEqual(expect.arrayContaining(['fred', 'twelve_data']));
    expect(avail.hasAlpacaPaper).toBe(false);
  });
});
