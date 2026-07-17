import { z } from 'zod';
import { AdapterCapabilities, ConnectionStatus } from './broker';

/** Broker venues that accept user-owned API credentials (not paper_sim). */
export const CredentialVenue = z.enum(['alpaca', 'kalshi', 'polymarket', 'coinbase']);
export type CredentialVenue = z.infer<typeof CredentialVenue>;

export const BrokerMode = z.enum(['paper', 'live']);
export type BrokerMode = z.infer<typeof BrokerMode>;

export const AlpacaCredentials = z.object({
  keyId: z.string().min(8).max(120),
  secret: z.string().min(8).max(200),
});
export type AlpacaCredentials = z.infer<typeof AlpacaCredentials>;

export const UpsertAlpacaConnectionInput = z.object({
  keyId: z.string().min(8).max(120),
  secret: z.string().min(8).max(200),
  /** Live credentials are rejected until the live gate ships. */
  mode: z.literal('paper').default('paper'),
});
export type UpsertAlpacaConnectionInput = z.infer<typeof UpsertAlpacaConnectionInput>;

export const BrokerConnectionSummary = z.object({
  id: z.string().uuid(),
  venue: CredentialVenue,
  mode: BrokerMode,
  status: ConnectionStatus,
  keyHint: z.string(),
  capabilities: AdapterCapabilities.nullable(),
  lastVerifiedAt: z.string().datetime().nullable(),
  /** Company currently exclusively bound to this connection, if any. */
  boundCompanyId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BrokerConnectionSummary = z.infer<typeof BrokerConnectionSummary>;

export const BindCompanyBrokerInput = z.object({
  brokerConnectionId: z.string().uuid().nullable(),
});
export type BindCompanyBrokerInput = z.infer<typeof BindCompanyBrokerInput>;

/** Re-export order snapshot types from broker for consumers that import this module. */
export { BrokerOrderSnapshot, OrderStatus } from './broker';
