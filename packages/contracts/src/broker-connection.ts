import { z } from 'zod';
import { AdapterCapabilities, BalanceSnapshot, ConnectionStatus, Venue } from './broker';

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

export const KalshiCredentials = z.object({
  apiKeyId: z.string().min(8).max(200),
  privateKeyPem: z.string().min(32).max(8000),
  demoMode: z.boolean().default(true),
});
export type KalshiCredentials = z.infer<typeof KalshiCredentials>;

export const UpsertAlpacaConnectionInput = z.object({
  keyId: z.string().min(8).max(120),
  secret: z.string().min(8).max(200),
  /** Live credentials are rejected until the live gate ships. */
  mode: z.literal('paper').default('paper'),
});
export type UpsertAlpacaConnectionInput = z.infer<typeof UpsertAlpacaConnectionInput>;

export const UpsertKalshiConnectionInput = z.object({
  apiKeyId: z.string().min(8).max(200),
  privateKeyPem: z.string().min(32).max(8000),
  /** Demo API only — live Kalshi is fail-closed until the live gate ships. */
  mode: z.literal('paper').default('paper'),
  demoMode: z.literal(true).default(true),
});
export type UpsertKalshiConnectionInput = z.infer<typeof UpsertKalshiConnectionInput>;

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

/** Company-scoped broker bind + capital admission projection (GET /api/companies/:id/broker). */
export const CompanyBrokerStatus = z.object({
  bound: z.boolean(),
  connection: BrokerConnectionSummary.nullable(),
  venue: Venue,
  /** Quote feed entitlement label when the bound adapter exposes one (e.g. alpaca_iex_paper). */
  feedEntitlementLabel: z.string().nullable(),
  virtualBalanceCents: z.string(),
  brokerSnapshot: BalanceSnapshot.nullable(),
  /** min(virtual, broker buying power) when bound with snapshot; else virtual. */
  effectiveCapCents: z.string(),
  mode: BrokerMode,
  /** Always true when company mode is live — live dispatch remains fail-closed. */
  liveGateBlocked: z.boolean(),
});
export type CompanyBrokerStatus = z.infer<typeof CompanyBrokerStatus>;

export const LlmKeyVerifyResult = z.object({
  ok: z.boolean(),
  failure: z.string().nullable(),
  /** When true, only format/decrypt was checked (no provider spend). */
  deferred: z.boolean().optional(),
});
export type LlmKeyVerifyResult = z.infer<typeof LlmKeyVerifyResult>;

/** Re-export order snapshot types from broker for consumers that import this module. */
export { BrokerOrderSnapshot, OrderStatus } from './broker';
