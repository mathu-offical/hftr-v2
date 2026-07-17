import type {
  AdapterCapabilities,
  AlpacaCredentials,
  BrokerAdapter,
  BrokerMode,
  ConnectionStatus,
  CredentialVenue,
  QuoteSnapshot,
} from '@hftr/contracts';
import { AlpacaCredentials as AlpacaCredentialsSchema } from '@hftr/contracts';
import { createAlpacaPaperAdapter } from './alpaca/adapter';
import { createPaperSimAdapter, type PaperSimOptions } from './paper-sim';

export interface BrokerConnectionResolveInput {
  venue: CredentialVenue;
  mode: BrokerMode;
  status: ConnectionStatus;
  /** Plaintext credentials JSON already parsed by the caller. */
  credentials: unknown;
}

export interface ResolveBrokerAdapterOptions {
  connection: BrokerConnectionResolveInput | null;
  nowMs: () => number;
  /** Required when falling back to paper_sim. */
  paperSim: Pick<PaperSimOptions, 'getQuote' | 'startingCashCents' | 'slippageBps'>;
}

export class BrokerResolveError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'BrokerResolveError';
  }
}

/**
 * Select the venue adapter for dispatch. No connection → paper_sim;
 * connected Alpaca paper → Alpaca adapter; anything else fail-closed.
 */
export function resolveBrokerAdapter(opts: ResolveBrokerAdapterOptions): BrokerAdapter {
  if (!opts.connection) {
    return createPaperSimAdapter({
      nowMs: opts.nowMs,
      getQuote: opts.paperSim.getQuote,
      startingCashCents: opts.paperSim.startingCashCents,
      ...(opts.paperSim.slippageBps === undefined
        ? {}
        : { slippageBps: opts.paperSim.slippageBps }),
    });
  }

  if (opts.connection.mode === 'live') {
    throw new BrokerResolveError('live_gate_blocked');
  }

  if (opts.connection.status !== 'connected') {
    throw new BrokerResolveError('broker_connection_not_connected');
  }

  switch (opts.connection.venue) {
    case 'alpaca': {
      const creds: AlpacaCredentials = AlpacaCredentialsSchema.parse(opts.connection.credentials);
      return createAlpacaPaperAdapter({
        keyId: creds.keyId,
        secret: creds.secret,
        nowMs: opts.nowMs,
      });
    }
    case 'kalshi':
    case 'polymarket':
    case 'coinbase':
      throw new BrokerResolveError('unsupported_venue');
    default: {
      const _exhaustive: never = opts.connection.venue;
      throw new BrokerResolveError('unsupported_venue', String(_exhaustive));
    }
  }
}

export function adapterCapabilitiesForConnection(
  connection: BrokerConnectionResolveInput | null,
  paperSimQuote: () => QuoteSnapshot | null,
): AdapterCapabilities {
  if (!connection) {
    return createPaperSimAdapter({
      nowMs: () => Date.now(),
      getQuote: paperSimQuote,
      startingCashCents: 0,
    }).capabilities();
  }
  return resolveBrokerAdapter({
    connection,
    nowMs: () => Date.now(),
    paperSim: { getQuote: paperSimQuote, startingCashCents: 0 },
  }).capabilities();
}
