import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { fetchCoinGeckoCrypto, CoinGeckoCryptoError } from './coingecko-crypto';

describe('fetchCoinGeckoCrypto', () => {
  it('maps CoinGecko markets to leak-linted qualitative evidence', async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('api.coingecko.com');
      expect(init?.headers).toMatchObject(
        expect.objectContaining({ 'User-Agent': expect.stringContaining('hftr-v2') }),
      );
      return new Response(
        JSON.stringify([
          {
            id: 'bitcoin',
            symbol: 'btc',
            name: 'Bitcoin',
            current_price: 65000,
            market_cap: 1200000000000,
          },
          {
            id: 'ethereum',
            symbol: 'eth',
            name: 'Ethereum',
            current_price: 3400,
            market_cap: 400000000000,
          },
        ]),
        { status: 200 },
      );
    };

    const packages = await fetchCoinGeckoCrypto({
      limit: 2,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(2);
    expect(packages[0]!.sourceKind).toBe('coingecko_crypto');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(packages[0]!.summary).toContain('redacted');
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
  });

  it('throws http_error when API rejects', async () => {
    const fetchImpl = async () => new Response('rate limited', { status: 429 });
    await expect(
      fetchCoinGeckoCrypto({ fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toMatchObject({ code: 'http_error' });
    await expect(
      fetchCoinGeckoCrypto({ fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toBeInstanceOf(CoinGeckoCryptoError);
  });
});
