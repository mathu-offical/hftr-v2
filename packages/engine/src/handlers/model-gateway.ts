import type {
  CompileSelectionOutput,
  ConceptBatch,
  SuggestionThresholdProfile,
  TreeExpandOutput,
} from '@hftr/contracts';

/**
 * Injected from the app layer so @hftr/engine never imports @hftr/llm.
 * When absent or failing, handlers fall back to deterministic placeholders.
 */

export interface ResearchSynthesizeInput {
  companyId: string;
  moduleId: string;
  jobId: string;
  topicScope: string;
  topicSectors: string[];
  philosophyAxes: string[];
  /** Operator immutable directives folded into narrative context (D-082). */
  operatorDirectives?: string[];
  catalogHints: Array<{
    catalog: string;
    entryKey: string;
    title: string;
    tier: string | null;
  }>;
  existingConceptTitles: string[];
  /** Leak-linted evidence digests for grounded synthesize (D-070). */
  evidenceSummaries?: Array<{ digest: string; title: string; summary: string }>;
  /** Valid seals the model may cite via seal:{id} without re-verify (D-072). */
  sealSummaries?: Array<{ sealId: string; kind: string; title: string }>;
}

/** Qualitative tactical input — no raw money, prices, or authoritative datetimes. */
export interface TreeExpandInput {
  companyId: string;
  moduleId: string;
  jobId: string;
  leadId: string;
  symbol: string;
  direction: 'up' | 'down' | 'flat';
  strategyFamily: string;
  philosophyAxes: string[];
  /** Qualitative sizing descriptor from philosophy control (not a numeric budget). */
  sizingBasis: string;
  freshnessWindow: string;
}

/** Qualitative compile input — branch structure as labels only; no quantities. */
export interface CompileSelectionInput {
  companyId: string;
  moduleId: string;
  jobId: string;
  treeId: string;
  leadId: string;
  symbol: string;
  direction: 'up' | 'down' | 'flat';
  strategyFamily: string;
  /** Qualitative sizing descriptor — models never receive balance or price. */
  sizingBasis: string;
  branchLabels: string[];
  recoveryLadderSteps: string[];
}

/**
 * Qualitative threshold-profile input — lane presence + axis labels only.
 * No raw prices, bps, or free-form financial floats (D-091).
 */
export interface SuggestionThresholdProposeInput {
  companyId: string;
  moduleId: string;
  jobId: string;
  philosophyAxisLabels: string[];
  libraryLensTitles: string[];
  sectorFocuses: string[];
  lanePresence: {
    hasMarketBars: boolean;
    hasNews: boolean;
    hasMacro: boolean;
    hasFilingsOrWeb: boolean;
    hasLibraryCorpus: boolean;
    domainCountBand: 'absent' | 'single' | 'dual' | 'multi';
  };
  sessionPhase: string;
  priorProfileNote?: string;
}

export interface ModelGateway {
  synthesizeResearch(
    input: ResearchSynthesizeInput,
  ): Promise<{ ok: true; batch: ConceptBatch } | { ok: false; failure: string }>;

  expandTree(
    input: TreeExpandInput,
  ): Promise<{ ok: true; output: TreeExpandOutput } | { ok: false; failure: string }>;

  compileSelection(
    input: CompileSelectionInput,
  ): Promise<{ ok: true; output: CompileSelectionOutput } | { ok: false; failure: string }>;

  proposeSuggestionThresholds(
    input: SuggestionThresholdProposeInput,
  ): Promise<
    { ok: true; profile: SuggestionThresholdProfile } | { ok: false; failure: string }
  >;
}
