/**
 * Catalog loaders for runtime gates/limits.
 *
 * JSON is imported statically so Next/Vercel serverless bundles include the
 * catalogs. Do NOT readFileSync from packages/db — those paths are absent from
 * the Vercel function filesystem (ENOENT on POST /api/companies).
 */

import guardrailCatalog from '../../../db/src/seed/catalogs/guardrail-recovery-package-catalog.json';
import brokerCatalog from '../../../db/src/seed/catalogs/broker-policy-envelope-catalog.json';
import sessionCatalog from '../../../db/src/seed/catalogs/session-constraint-catalog.json';
import liveGateBandsJson from '../../../db/src/seed/catalogs/live_gate_threshold_bands.json';

export const CATALOG_VERSION = 'v1_snapshot_2026_07_16';
export const LIVE_GATE_BANDS_VERSION = 'testing_baseline_v1_not_live_signoff';

export interface NumericBand {
  min: number;
  typical: number;
  max: number;
  unit?: string;
}

export interface GuardrailPackageEntry {
  id: string;
  name: string;
  class: string;
  primaryTriggers: string[];
  failureCodes: string[];
}

export interface BrokerEnvelopeEntry {
  id: string;
  name: string;
  testingBaselineRef?: string;
  tradeRequestBudgetPerMin?: number;
}

interface BrokerCatalogSource {
  envelopes: Array<{
    id: string;
    name: string;
    testingBaselineRef?: string;
    tradeRequestBudgetPerMin?: number;
  }>;
  testingBaselineDefaults?: Record<string, { tradeRequestBudgetPerMin?: number }>;
}

function resolveTradeBudget(
  envelope: BrokerCatalogSource['envelopes'][number],
  baselines: BrokerCatalogSource['testingBaselineDefaults'],
): number | undefined {
  if (typeof envelope.tradeRequestBudgetPerMin === 'number') {
    return envelope.tradeRequestBudgetPerMin;
  }
  const ref = envelope.testingBaselineRef;
  if (ref && baselines?.[ref]?.tradeRequestBudgetPerMin !== undefined) {
    return baselines[ref].tradeRequestBudgetPerMin;
  }
  return undefined;
}

export interface SessionConstraintEntry {
  id: string;
  name: string;
  assetClass: string;
}

export interface LiveGateThresholdBands {
  catalogVersion: string;
  freezeState: string;
  boundedRangeFamilies: Record<string, NumericBand>;
}

function freezeMap<K extends string, V>(entries: [K, V][]): ReadonlyMap<K, V> {
  return Object.freeze(new Map(entries)) as ReadonlyMap<K, V>;
}

let guardrailPackages: ReadonlyMap<string, GuardrailPackageEntry> | null = null;
let brokerEnvelopes: ReadonlyMap<string, BrokerEnvelopeEntry> | null = null;
let sessionConstraints: ReadonlyMap<string, SessionConstraintEntry> | null = null;
let liveGateBands: LiveGateThresholdBands | null = null;

export function loadGuardrailPackages(): ReadonlyMap<string, GuardrailPackageEntry> {
  if (guardrailPackages) return guardrailPackages;
  const source = guardrailCatalog as { packages: GuardrailPackageEntry[] };
  guardrailPackages = freezeMap(source.packages.map((p) => [p.id, Object.freeze({ ...p })]));
  return guardrailPackages;
}

export function loadBrokerEnvelopes(): ReadonlyMap<string, BrokerEnvelopeEntry> {
  if (brokerEnvelopes) return brokerEnvelopes;
  const source = brokerCatalog as BrokerCatalogSource;
  brokerEnvelopes = freezeMap(
    source.envelopes.map((e) => {
      const budget = resolveTradeBudget(e, source.testingBaselineDefaults);
      const entry: BrokerEnvelopeEntry = { id: e.id, name: e.name };
      if (e.testingBaselineRef) entry.testingBaselineRef = e.testingBaselineRef;
      if (budget !== undefined) entry.tradeRequestBudgetPerMin = budget;
      return [e.id, Object.freeze(entry)] as const;
    }),
  );
  return brokerEnvelopes;
}

export function loadSessionConstraints(): ReadonlyMap<string, SessionConstraintEntry> {
  if (sessionConstraints) return sessionConstraints;
  const source = sessionCatalog as { sessions: SessionConstraintEntry[] };
  sessionConstraints = freezeMap(source.sessions.map((s) => [s.id, Object.freeze({ ...s })]));
  return sessionConstraints;
}

export function loadLiveGateThresholdBands(): LiveGateThresholdBands {
  if (liveGateBands) return liveGateBands;
  const source = liveGateBandsJson as LiveGateThresholdBands;
  liveGateBands = Object.freeze({
    ...source,
    boundedRangeFamilies: Object.freeze({ ...source.boundedRangeFamilies }),
  });
  return liveGateBands;
}

export function resetCatalogLoaderCacheForTests(): void {
  guardrailPackages = null;
  brokerEnvelopes = null;
  sessionConstraints = null;
  liveGateBands = null;
}
