import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATALOG_VERSION = 'v1_snapshot_2026_07_16';
export const LIVE_GATE_BANDS_VERSION = 'testing_baseline_v1_not_live_signoff';

const CATALOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../db/src/seed/catalogs');

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

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(CATALOG_DIR, fileName), 'utf8')) as T;
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
  const source = readJson<{ packages: GuardrailPackageEntry[] }>(
    'guardrail-recovery-package-catalog.json',
  );
  guardrailPackages = freezeMap(source.packages.map((p) => [p.id, Object.freeze({ ...p })]));
  return guardrailPackages;
}

export function loadBrokerEnvelopes(): ReadonlyMap<string, BrokerEnvelopeEntry> {
  if (brokerEnvelopes) return brokerEnvelopes;
  const source = readJson<BrokerCatalogSource>('broker-policy-envelope-catalog.json');
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
  const source = readJson<{ sessions: SessionConstraintEntry[] }>(
    'session-constraint-catalog.json',
  );
  sessionConstraints = freezeMap(source.sessions.map((s) => [s.id, Object.freeze({ ...s })]));
  return sessionConstraints;
}

export function loadLiveGateThresholdBands(): LiveGateThresholdBands {
  if (liveGateBands) return liveGateBands;
  const source = readJson<LiveGateThresholdBands>('live_gate_threshold_bands.json');
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
