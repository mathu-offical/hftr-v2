import { describe, expect, it } from 'vitest';
import type { DeterministicActionTask } from '@hftr/contracts';
import { createAlpacaPaperAdapter } from './adapter';
import { createAlpacaClient } from './client';
import { mapTaskToAlpacaOrder } from './map-order';

const T0 = 1_752_700_000_000;

function task(overrides: Partial<DeterministicActionTask> = {}): DeterministicActionTask {
  return {
    instructionRef: '00000000-0000-4000-8000-000000000001',
    symbol: 'AAPL',
    actionVerb: 'buy',
    orderType: 'market',
    timeInForce: 'day',
    quantityInt: '5',
    quantityScale: 0,
    limitPriceCents: null,
    stopPriceCents: null,
    fillTimeoutMs: 30_000,
    idempotencyKey: 'ptrade-abc123456789',
    lineage: { quantityRef: 'nv_q', limitPriceRef: null, fillTimeoutRef: 'nv_t' },
    ...overrides,
  };
}

describe('mapTaskToAlpacaOrder', () => {
  it('maps market buy with client_order_id from idempotencyKey', () => {
    const body = mapTaskToAlpacaOrder(task());
    expect(body).toEqual({
      symbol: 'AAPL',
      qty: '5',
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
      client_order_id: 'ptrade-abc123456789',
    });
  });

  it('converts limit price cents to dollars', () => {
    const body = mapTaskToAlpacaOrder(
      task({ orderType: 'limit', limitPriceCents: 15025 }),
      'co_custom',
    );
    expect(body.limit_price).toBe('150.25');
    expect(body.client_order_id).toBe('co_custom');
  });

  it('fails closed when a non-order action reaches order submission', () => {
    expect(() => mapTaskToAlpacaOrder(task({ actionVerb: 'cancel' }))).toThrow(
      'unsupported_action_verb:cancel',
    );
  });
});

describe('createAlpacaPaperAdapter', () => {
  it('rejects live mode at factory level', async () => {
    const { createAlpacaAdapter } = await import('./adapter');
    expect(() =>
      createAlpacaAdapter({
        keyId: 'PKTESTKEY1',
        secret: 'secret-test',
        mode: 'live',
        nowMs: () => T0,
      }),
    ).toThrow('live_gate_blocked');
  });

  it('verifyConnection returns connected for active non-blocked account', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/v2/account')) {
        return new Response(
          JSON.stringify({
            account_number: 'PA123',
            cash: '10000.00',
            buying_power: '20000.00',
            trading_blocked: false,
            status: 'ACTIVE',
          }),
          { status: 200, headers: { 'X-Request-ID': 'req-acct-1' } },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const adapter = createAlpacaPaperAdapter({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      nowMs: () => T0,
      client,
    });

    expect(await adapter.verifyConnection()).toBe('connected');
    const balances = await adapter.getBalances();
    expect(balances.cashCents).toBe(1_000_000);
    expect(balances.buyingPowerCents).toBe(2_000_000);
  });

  it('verifyConnection fails when trading_blocked', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          account_number: 'PA123',
          cash: '0',
          buying_power: '0',
          trading_blocked: true,
          status: 'ACTIVE',
        }),
        { status: 200 },
      );

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const adapter = createAlpacaPaperAdapter({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      nowMs: () => T0,
      client,
    });
    expect(await adapter.verifyConnection()).toBe('error');
  });

  it('submitOrder captures request id and venue order id', async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/v2/orders') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'ord-99',
            client_order_id: 'ptrade-abc123456789',
            status: 'accepted',
            filled_qty: '0',
            filled_avg_price: null,
            symbol: 'AAPL',
          }),
          { status: 200, headers: { 'X-Request-ID': 'req-order-1' } },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const adapter = createAlpacaPaperAdapter({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      nowMs: () => T0,
      client,
    });

    const result = await adapter.submitOrder(task());
    expect(result).toMatchObject({
      accepted: true,
      venueOrderId: 'ord-99',
      requestId: 'req-order-1',
    });
  });

  it('getQuote labels feedClass alpaca_iex_paper', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/quotes/latest')) {
        return new Response(
          JSON.stringify({
            quote: { ap: 150.12, bp: 150.1, t: new Date(T0).toISOString() },
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const adapter = createAlpacaPaperAdapter({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      nowMs: () => T0,
      client,
    });

    const quote = await adapter.getQuote!('aapl');
    expect(quote.feedClass).toBe('alpaca_iex_paper');
    expect(quote.symbol).toBe('AAPL');
    expect(quote.askCents).toBe(15_012);
  });

  it('getOrderByClientId maps filled order snapshot', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/orders:client_order_id/')) {
        return new Response(
          JSON.stringify({
            id: 'ord-42',
            client_order_id: 'co_test',
            status: 'filled',
            filled_qty: '5',
            filled_avg_price: '150.00',
            symbol: 'AAPL',
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const adapter = createAlpacaPaperAdapter({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      nowMs: () => T0,
      client,
    });

    const snap = await adapter.getOrderByClientId!('co_test');
    expect(snap?.status).toBe('filled');
    expect(snap?.avgFillPriceCents).toBe(15_000);
  });
});
