import { describe, expect, it } from 'vitest';
import type { QuoteSnapshot } from '@hftr/contracts';
import { BrokerResolveError, resolveBrokerAdapter } from './resolve';

const T0 = 1_752_700_000_000;

function quote(): QuoteSnapshot {
  return {
    symbol: 'TEST',
    bidCents: 100,
    askCents: 101,
    lastCents: 100,
    asOfIso: new Date(T0).toISOString(),
    feedClass: 'fixture',
  };
}

describe('resolveBrokerAdapter', () => {
  it('returns paper_sim when no connection', () => {
    const adapter = resolveBrokerAdapter({
      connection: null,
      nowMs: () => T0,
      paperSim: { getQuote: quote, startingCashCents: 50_000 },
    });
    expect(adapter.venue).toBe('paper_sim');
  });

  it('throws when connection is not connected', () => {
    expect(() =>
      resolveBrokerAdapter({
        connection: {
          venue: 'alpaca',
          mode: 'paper',
          status: 'unverified',
          credentials: { keyId: 'PKTESTKEY1', secret: 'secret-test' },
        },
        nowMs: () => T0,
        paperSim: { getQuote: quote, startingCashCents: 0 },
      }),
    ).toThrow(BrokerResolveError);
  });

  it('returns alpaca adapter for connected paper alpaca', () => {
    const adapter = resolveBrokerAdapter({
      connection: {
        venue: 'alpaca',
        mode: 'paper',
        status: 'connected',
        credentials: { keyId: 'PKTESTKEY1', secret: 'secret-test' },
      },
      nowMs: () => T0,
      paperSim: { getQuote: quote, startingCashCents: 0 },
    });
    expect(adapter.venue).toBe('alpaca');
    expect(adapter.mode).toBe('paper');
  });

  it('rejects live mode', () => {
    expect(() =>
      resolveBrokerAdapter({
        connection: {
          venue: 'alpaca',
          mode: 'live',
          status: 'connected',
          credentials: { keyId: 'PKTESTKEY1', secret: 'secret-test' },
        },
        nowMs: () => T0,
        paperSim: { getQuote: quote, startingCashCents: 0 },
      }),
    ).toThrow('live_gate_blocked');
  });

  it('returns kalshi demo adapter for connected paper kalshi', () => {
    const adapter = resolveBrokerAdapter({
      connection: {
        venue: 'kalshi',
        mode: 'paper',
        status: 'connected',
        credentials: {
          apiKeyId: 'kalshi-demo-key-01',
          privateKeyPem:
            '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----',
          demoMode: true,
        },
      },
      nowMs: () => T0,
      paperSim: { getQuote: quote, startingCashCents: 0 },
    });
    expect(adapter.venue).toBe('kalshi');
    expect(adapter.mode).toBe('paper');
  });

  it('rejects live kalshi connections', () => {
    expect(() =>
      resolveBrokerAdapter({
        connection: {
          venue: 'kalshi',
          mode: 'live',
          status: 'connected',
          credentials: {
            apiKeyId: 'kalshi-demo-key-01',
            privateKeyPem:
              '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----',
            demoMode: true,
          },
        },
        nowMs: () => T0,
        paperSim: { getQuote: quote, startingCashCents: 0 },
      }),
    ).toThrow('live_gate_blocked');
  });
});
