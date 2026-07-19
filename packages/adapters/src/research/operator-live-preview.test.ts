import { describe, expect, it } from 'vitest';
import { LiveDataSourceWidget } from '@hftr/contracts';
import { buildOperatorLivePreviewWidgets } from './operator-live-preview';

describe('buildOperatorLivePreviewWidgets', () => {
  it('returns null for news kinds (evidence path)', async () => {
    const out = await buildOperatorLivePreviewWidgets({
      kind: 'brave_search',
      query: 'markets',
      maxResults: 4,
      credentials: {},
    });
    expect(out).toBeNull();
  });

  it('maps coingecko rows when fetch succeeds', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          {
            id: 'bitcoin',
            symbol: 'btc',
            name: 'Bitcoin',
            current_price: 65000.12,
            market_cap_rank: 1,
            price_change_percentage_24h: 1.25,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    try {
      const out = await buildOperatorLivePreviewWidgets({
        kind: 'coingecko_crypto',
        query: 'bitcoin',
        maxResults: 4,
        credentials: {},
      });
      expect(out).not.toBeNull();
      expect(out!.length).toBe(1);
      const parsed = LiveDataSourceWidget.parse(out![0]);
      expect(parsed.widgetKind).toBe('listing');
      expect(parsed.fields.some((f) => f.label === 'Price USD')).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('returns full frankfurter pair list without sampling', async () => {
    const original = globalThis.fetch;
    const pairs = Array.from({ length: 40 }, (_, i) => ({
      quote: `C${String(i).padStart(2, '0')}`,
      rate: 1 + i / 100,
      base: 'USD',
    }));
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(pairs), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    try {
      const out = await buildOperatorLivePreviewWidgets({
        kind: 'frankfurter_fx',
        query: 'USD',
        maxResults: 12,
        credentials: {},
      });
      expect(out).not.toBeNull();
      expect(out!.length).toBe(40);
    } finally {
      globalThis.fetch = original;
    }
  });
});
