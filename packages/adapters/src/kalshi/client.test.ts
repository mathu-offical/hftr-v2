import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createKalshiClient,
  dollarsToCents,
  formatContractCountFp,
  KALSHI_DEMO_BASE_URL,
  signKalshiRequest,
} from './client';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const apiKeyId = 'kalshi-test-api-key-01';

describe('kalshi client', () => {
  it('rejects live mode', () => {
    expect(() =>
      createKalshiClient({
        apiKeyId,
        privateKeyPem,
        demoMode: false,
      }),
    ).toThrow('kalshi_live_not_supported');
  });

  it('signs requests with RSA-PSS per Kalshi spec', () => {
    const timestamp = '1700000000000';
    const signature = signKalshiRequest(
      privateKeyPem,
      timestamp,
      'GET',
      '/trade-api/v2/portfolio/balance',
    );
    expect(signature.length).toBeGreaterThan(20);
  });

  it('verifyConnection returns true on 200 balance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ balance: 50000, portfolio_value: 50000, updated_ts: 1700 }),
      headers: new Headers(),
    });

    const client = createKalshiClient({
      apiKeyId,
      privateKeyPem,
      fetchImpl,
      nowMs: () => 1700000000000,
    });

    await expect(client.verifyConnection()).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${KALSHI_DEMO_BASE_URL}/portfolio/balance`);
    const headers = init.headers as Headers;
    expect(headers.get('KALSHI-ACCESS-KEY')).toBe(apiKeyId);
    expect(headers.get('KALSHI-ACCESS-SIGNATURE')).toBeTruthy();
    expect(headers.get('KALSHI-ACCESS-TIMESTAMP')).toBe('1700000000000');
  });

  it('getBalance maps cents balance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ balance: 12345, portfolio_value: 15000, updated_ts: 1700000000 }),
      headers: new Headers(),
    });

    const client = createKalshiClient({ apiKeyId, privateKeyPem, fetchImpl });
    const balance = await client.getBalance();
    expect(balance.balance).toBe(12345);
  });

  it('getMarket fetches ticker quote fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          market: {
            ticker: 'KXTEST-26',
            event_ticker: 'KXTEST',
            status: 'active',
            yes_bid_dollars: '0.4800',
            yes_ask_dollars: '0.5200',
            last_price_dollars: '0.5000',
          },
        }),
      headers: new Headers(),
    });

    const client = createKalshiClient({ apiKeyId, privateKeyPem, fetchImpl });
    const { market } = await client.getMarket('KXTEST-26');
    expect(dollarsToCents(market.yes_bid_dollars)).toBe(48);
    expect(dollarsToCents(market.yes_ask_dollars)).toBe(52);
  });

  it('placeOrder posts to events orders endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          order_id: 'ord-1',
          fill_count: '1.00',
          remaining_count: '0.00',
          ts_ms: 1700000000000,
        }),
      headers: new Headers(),
    });

    const client = createKalshiClient({ apiKeyId, privateKeyPem, fetchImpl });
    const order = await client.placeOrder({
      ticker: 'KXTEST-26',
      side: 'bid',
      count: '10.00',
      price: '0.5000',
      time_in_force: 'good_till_canceled',
      self_trade_prevention_type: 'taker_at_cross',
    });
    expect(order.order_id).toBe('ord-1');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/portfolio/events/orders');
    expect(init.method).toBe('POST');
  });

  it('formatContractCountFp renders fixed-point counts', () => {
    expect(formatContractCountFp('10', 0)).toBe('10.00');
    expect(formatContractCountFp('105', 1)).toBe('10.50');
  });
});
