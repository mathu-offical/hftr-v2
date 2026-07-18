// Clock authority
export { createSystemClock, createFixedClock, createSteppingClock, type Clock } from './clock';

// Queue
export {
  enqueue,
  claimJobs,
  completeJob,
  failJob,
  queueStats,
  sweepExpiredLeases,
  pruneCompleted,
  deferBudgetQueuedJobs,
  clearBudgetQueueErrors,
  type EnqueueDef,
  type ClaimedJob,
  type JobCostEstimate,
} from './queue/queue';
export {
  BUDGET_QUEUED_ERROR,
  LLM_BUDGET_QUEUE_CLASSES,
  hasNonEmptyCostEstimate,
  isBudgetExhausted,
  shouldDeferForBudget,
  type BudgetRowSnapshot,
} from './queue/budget-admission';
export { drainQueues, type DrainResult } from './queue/drain';
export { estimateLlmJobCost } from './queue/llm-cost-estimate';
export {
  exportObsidianNotes,
  exportObsidianTopicNotes,
  type ObsidianExportNote,
} from './export/obsidian';
export type {
  ObsidianConceptInput,
  ObsidianLinkInput,
  ObsidianTopicInput,
} from './export/obsidian';
export {
  materializeSchedules,
  ensureResearchCadenceSchedule,
  parseScheduleExpr,
  isScheduleDue,
  scheduleWindowKey,
} from './schedules/materialize';
export { attachConceptsToLibraries } from './libraries/attach';
export { attachConceptsToTopic } from './libraries/topic-attach';
export {
  bootstrapCompanyKnowledge,
  buildSeededConceptBody,
  SEED_CATALOG_NAMES,
  SEED_CATALOG_TARGETS,
  type SeededCatalogEntry,
} from './libraries/bootstrap';
export {
  loadCompanyLinkGraph,
  neighborIds,
  resolveDirectiveTradingTarget,
  resolveInboundLibraryModules,
  resolveInboundLiveApiModules,
  resolveLinkedModules,
  resolveLinkedResearchModules,
  resolveOutboundLibraryModules,
  resolvePolicyModuleForTrading,
  resolveViaLinkedModules,
  instrumentsFromModuleConfig,
  type CompanyLinkGraph,
  type GraphEdge,
  type GraphModule,
  type GraphLinkKind,
} from './graph/module-links';
export {
  activationGraphBlockers,
  type ActivationGraphLink,
  type ActivationGraphModule,
} from './graph/activation-graph-blockers';

// Handlers (importing registers built-ins)
export { registerHandler, getHandler, registeredKinds } from './handlers/registry';
export type {
  ModelGateway,
  ResearchSynthesizeInput,
  TreeExpandInput,
  CompileSelectionInput,
} from './handlers/model-gateway';
import './handlers/maintenance';
import './handlers/dispatch';
import './handlers/trend';
import './handlers/promote';
import './handlers/tactical';
import './handlers/compile-select';
import './handlers/research';
import './handlers/research-gather';
import './handlers/research-validate';
import './handlers/research-synthesize';
import './handlers/research-admit';
import './handlers/research-company-sweep';
import './handlers/reconcile';
import './handlers/simulation';
import './handlers/analyzer';

// Dispatch
export {
  executePaperTrade,
  finalizeRecoveredVenueFill,
  buildFillVerificationFields,
  type PaperTradeRequest,
  type PaperTradeResult,
  type FinalizeRecoveredVenueFillArgs,
} from './dispatch/paper-trade';
export { getCompanyBalanceCents } from './dispatch/balances';
export {
  resolveExecutionContext,
  type ResolvedExecutionContext,
} from './dispatch/execution-context';
export { getSyntheticQuote } from './dispatch/quotes';
export { applyFill, getPosition, type PositionRow } from './dispatch/positions';
export {
  calculateCompanyEquity,
  type CalculateCompanyEquityInput,
  type CompanyEquityResult,
  type EquityCashInput,
  type EquityConfirmedPosition,
  type EquityMarkCandidate,
  type EquityMarkKind,
} from './equity/equity';

// Service resolution (company-equity-and-service-sources design)
export {
  resolveModuleServiceCoverage,
  type ModuleServiceBinding,
  type ModuleServiceInput,
  type ModuleServiceSource,
  type ResolvedModuleServiceCoverage,
  type ServiceSourceKind,
} from './services/resolve-module-services';

// Calc / NRA
export * as calcStore from './calc/store';
export { evaluate as calcEvaluate, type CalcCaller } from './calc/evaluate';
export * as fixed from './calc/fixed';
export { describe as describeValue, type BandDefinition } from './calc/descriptors';
export { leakLint, type LeakLintResult } from './calc/leak-lint';
export { checkEnvelope, checkInput, type SanityCheckResult } from './calc/sanity';

// Pipeline (pure lead→tree→compile logic; handlers wire the DB flow)
export {
  evaluateGates,
  gatesPass,
  DEFAULT_FRESHNESS_WINDOW_MS,
  type GateEvidence,
  type GateInput,
  type GateName,
} from './pipeline/gates';
export { buildDecisionTree, type BuiltDecisionTree, type TreeLeadInput } from './pipeline/tree';
export {
  compileInstruction,
  computeQuantity,
  type CompileBlockReason,
  type CompileContext,
  type CompileOutcome,
  type CompileTreeInput,
  type CompiledInstructionFields,
} from './pipeline/compile';
export { mergeCompileSelection, modelBlockReasonToCompile } from './pipeline/compile-selection';
export { treeFromModelOutput, type ModelBuiltDecisionTree } from './pipeline/tree-expand';
export {
  enforceScope,
  enforceScopeStrict,
  enforceAllLayers,
  knownBandIds,
} from './pipeline/levers';
export {
  resolvePhilosophyControl,
  type PhilosophyControlSnapshot,
  type ResolvePhilosophyControlInput,
} from './pipeline/philosophy-control';

// Calendar
export {
  getSession,
  sessionPhase,
  timeToCloseClass,
  venueDate,
  buildOrientation,
  type SessionInfo,
} from './calendar/calendar';

// Dynamic safety foundation (D-028)
export { computeOperatingLimits } from './limits/compute';
export { clampLimit, clampLossRemaining } from './limits/clamp';
export type { LimitContext } from './limits/context';
export {
  loadGuardrailPackages,
  loadBrokerEnvelopes,
  loadSessionConstraints,
  loadLiveGateThresholdBands,
  CATALOG_VERSION,
  LIVE_GATE_BANDS_VERSION,
} from './limits/catalog-loader';
export {
  evaluateGuardrails,
  guardrailsBlock,
  type GuardrailEvalContext,
} from './guardrails/evaluate';
export {
  getGuardrailPackage,
  listGuardrailPackageIds,
  guardrailPackageRef,
} from './guardrails/registry';
export {
  evaluateLiveGateChecklist,
  liveGateIdsInOrder,
  LIVE_GATE_EVIDENCE_MAX_AGE_MS,
} from './live-gates/checklist';
export { buildLiveGateEvidence, isLiveArmingAllowed } from './live-gates/evidence';
export { gatherLiveGateChecklistInput, countTracesOlderThan } from './live-gates/gather';
export {
  autoDisarmCompany,
  autoDisarmCompaniesForBroker,
  type AutoDisarmReason,
} from './live-gates/disarm';
export {
  getLastDrainMetrics,
  recordDrainMetrics,
  type DrainLatencyMetrics,
} from './queue/drain-metrics';
export { archiveStaleHotRows, type ArchiveRetentionCounts } from './retention/archive';
export {
  preDispatchGauntlet,
  type PreDispatchContext,
  type PreDispatchResult,
} from './dispatch/pre-dispatch';
export {
  resolveLeverSetting,
  resolveBandPosition,
  resolveSizingBasisBps,
} from './pipeline/lever-resolver';
export {
  walkValueLineage,
  MAX_LINEAGE_DEPTH,
  type LineageNode,
  type LineageWalkResult,
} from './calc/lineage';
export {
  canDecideTransfer,
  validateTransferDecision,
  transferLedgerDeltaCents,
  transferDescription,
  isTerminalTransferStatus,
  fundTransferRowsFromProposals,
  type TransferDecision,
  type FundTransferStatus,
  type FundTransferRequestedBy,
  type FundTransferInsertFromProposal,
} from './fund-transfers/transfer';
export {
  proposeFundRouteTransfers,
  type FundRouteHop,
  type FundRoutePathProposal,
  type FundRouteWalkerError,
  type FundRouteWalkerErrorCode,
  type FundRouteWalkerLink,
  type FundRouteWalkerModule,
  type FundTransferProposal,
  type ProposeFundRouteTransfersInput,
  type ProposeFundRouteTransfersOutcome,
  type ProposeFundRouteTransfersResult,
} from './fund-transfers/fund-route-walker';
