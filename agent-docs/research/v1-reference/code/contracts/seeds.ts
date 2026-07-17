// ============================================================
// Seed catalog contracts — seeded structures (read-only at runtime)
// ============================================================

export interface SeedStrategyFamily {
  id: string;
  name: string;
  concept: string;
  parameterRanges: Record<string, [number, number]>;
  compatibleActions: string[];
  guardrailHints: string[];
  preferredSectors: string[];
  sessionCompatibility: string[];
  brokerCompatibility: string[];
  tags: string[];
  enabled: boolean;
}

export interface SeedStrategyVariant {
  id: string;
  familyId: string;
  name: string;
  triggerProfile: Record<string, unknown>;
  leadPattern: string;
  guardrailFocus: string[];
  preferredResearch: string[];
  compoundRoles: string[];
}

export interface SeedSector {
  id: string;
  name: string;
  parentSectorId: string | null;
  tags: string[];
  enabled: boolean;
}

export interface SeedSectorKnowledgePackage {
  id: string;
  sectorId: string;
  summary: string;
  subsectorProfiles: string[];
  leadGatheringPatterns: string[];
  trendVectors: string[];
  baselineKnowledge: string;
  progressiveAccess: boolean;
}

export interface SeedMacroTriggerPackage {
  id: string;
  triggerClass: string;
  freshnessWindowMin: number;
  affectedSectors: string[];
  affectedSubsectors: string[];
  requiresBlackout: boolean;
  leadPatternBias: string[];
  verificationSignals: string[];
  runtimeControlSurface: string;
}

export interface SeedCompanyEventArchetype {
  id: string;
  eventType: string;
  defaultVolatilityExpectation: string;
  evidenceRequirements: string[];
  strategyCompatibility: string[];
}

export interface SeedBrokerPolicyTemplate {
  id: string;
  mode: string;
  throttleCaps: Record<string, number>;
  timeoutBands: Record<string, number>;
  budgetBands: Record<string, number>;
  allowedSessions: string[];
  escalationDefaults: Record<string, unknown>;
}

export interface SeedSessionConstraintProfile {
  id: string;
  venue: string;
  sessionType: string;
  orderTypeRules: Record<string, unknown>;
  overnightRules: Record<string, unknown>;
  extendedHoursSupport: boolean;
}

export interface SeedGuardrailPolicy {
  id: string;
  scope: "global" | "broker" | "strategy" | "position";
  thresholdType: string;
  thresholdValue: number;
  onBreachAction: string;
}

export interface SeedRegulatoryKnowledgePackage {
  id: string;
  policyDomain: string;
  affectedModules: string[];
  triggerRefs: string[];
  retentionImpact: string;
  legalityImpact: string;
  reviewCadence: string;
}

export interface SeedGuardrailRecoveryPackage {
  id: string;
  guardrailClass: string;
  failureCodes: string[];
  triggerRefs: string[];
  recoveryLadder: string[];
  escalationRules: string[];
  provenanceRefs: string[];
}

export interface SeedActionTemplate {
  id: string;
  verb: string;
  requiredInputs: string[];
  deterministicValidationSchema: Record<string, unknown>;
}

// ── Catalog version tracking ─────────────────────────────────
export interface SeedCatalogVersion {
  id: string;
  catalogType: string;
  version: string;
  digest: string;
  promotedAt: string;
  sourceRef: string;
  status: "active" | "superseded" | "archived";
}

// ── Runtime selector outputs ─────────────────────────────────
export type SixGateType = "regime" | "symbol_universe" | "session" | "broker" | "market_structure" | "evidence";

export interface GateEvidenceRef {
  gate: SixGateType;
  passed: boolean;
  failureCode: string | null;
  evidenceDigest: string | null;
  evaluatedAt: string;
}

export interface ActivationValidationResult {
  resultId: string;
  selectorId: string;
  strategyFamilyRef: string;
  workspaceId: string;
  brokerMode: string;
  sessionType: string;
  gates: GateEvidenceRef[];
  overallPassed: boolean;
  blockReasons: string[];
  controlSnapshotRef: string;
  entitlementPosture: EntitlementPosture;
  evaluatedAt: string;
}

export interface EntitlementPosture {
  allowedOrderClasses: string[];
  sessionRestrictions: string[];
  extendedHoursAllowed: boolean;
  shortingAllowed: boolean;
  optionsAllowed: boolean;
  pricePrecision: number;
  minNotionalUsd: number;
}

export interface StockUniverseValidationProfile {
  profileId: string;
  strategyFamilyRef: string;
  instrumentRules: Record<string, unknown>;
  liquidityClass: string;
  spreadCeilingClass: string;
  eventStatePolicy: string;
  shortabilityRules: Record<string, unknown>;
  venueCompatibility: string[];
  correlationRequirements: Record<string, unknown>;
  sessionCompatibility: string[];
  brokerCompatibility: string[];
}

// ── Control profiles ─────────────────────────────────────────
export interface WeightEnvelope {
  profileId: string;
  scope: string;
  entityRefs: string[];
  driverRefs: string[];
  baselineWeight: number;
  runtimeWeightBand: [number, number];
  currentWeight: number;
  freshnessState: string;
  provenanceRefs: string[];
}

export interface RangeSeedProfile {
  profileId: string;
  scope: string;
  entityRefs: string[];
  rangeFamilies: string[];
  baselineBands: Record<string, [number, number]>;
  adjustmentLimits: Record<string, number>;
  conditioningSignals: string[];
  policyRefs: string[];
  reviewCadence: string;
}

export interface GranularityControlProfile {
  profileId: string;
  layer: string;
  subjectRefs: string[];
  detailLevel: string;
  aggregationWindow: string;
  refreshCadence: string;
  branchCardinalityCap: number;
  queuePriorityBand: string;
  outputContractRefs: string[];
}

export interface ControlSnapshot {
  snapshotId: string;
  weightEnvelopeRefs: string[];
  rangeSeedRefs: string[];
  granularityProfileRefs: string[];
  vetoReasons: string[];
  brokerPolicyRef: string;
  sessionConstraintRef: string;
  evidenceDigestRef: string;
  simulatorGapTags: string[];
  derivedAt: string;
}
