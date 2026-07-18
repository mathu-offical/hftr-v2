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
  assertNoSecretsInJobPayload,
  stripSecretsFromJobPayload,
  FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS,
} from './queue/payload-secrets';
export { scrubSecretsFromJobPayloads } from './queue/scrub-payload-secrets';
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
  ensureSystemLibrarySchedule,
  ensureSystemMoversSchedule,
  parseScheduleExpr,
  isScheduleDue,
  scheduleWindowKey,
  SYSTEM_MOVERS_CADENCE_MINUTES,
} from './schedules/materialize';
export { attachConceptsToLibraries } from './libraries/attach';
export { attachConceptsToTopic } from './libraries/topic-attach';
export {
  archiveAllRuntimeResearch,
  bumpConceptConfidence,
  bumpTopicConfidence,
  clearArchive,
  listArchive,
  nextConfidenceBand,
  restoreConcept,
  restoreLibrary,
  restoreTopic,
  SEEDED_LIBRARY_NAME,
  SEEDED_TOPIC_TITLE,
  softArchiveConcept,
  softArchiveLibrary,
  softArchiveTopic,
  verifyResearchObject,
  type ArchiveCounts,
  type ArchiveListResult,
  type ConfidenceBand,
  type ConfidenceDirection,
} from './libraries/archive';
export {
  bootstrapCompanyKnowledge,
  buildSeededConceptBody,
  buildSeededTopicSynopsisMd,
  collectSeededConceptTags,
  SEED_CATALOG_NAMES,
  SEED_CATALOG_TARGETS,
  SEEDED_TOPIC_PROGRAM_TITLE,
  SEEDED_TOPIC_SPECS,
  SEEDED_TOPIC_TITLES,
  isSeededTopicTitle,
  type SeededCatalogEntry,
} from './libraries/bootstrap';
export { ensureSectorKnowledge } from './libraries/ensure-sector-knowledge';
export {
  ensureSystemLibrary,
  ensureAllSystemLibraries,
  type EnsureSystemLibraryOpts,
} from './libraries/ensure-system-library';
export {
  SYSTEM_LIBRARY_REGISTRY,
  type SystemLibraryRegistryEntry,
  type SystemLibraryPlaceholderSeed,
} from './libraries/system-library-registry';
export {
  ensureSystemMoversLibrary,
  MOVERS_LIBRARY_NAME,
  MOVERS_PLACEHOLDER_SEEDS,
  MOVERS_TOPIC_SCOPE,
  type EnsureSystemMoversLibraryOpts,
} from './libraries/system-movers';
export {
  validateDocumentShape,
  countDocumentWikilinks,
  hasWikilink,
  type ValidateDocumentShapeInput,
} from './research/document-shape';
export {
  scoreDocumentCuration,
  recordCurationScoreEvent,
  SYSTEM_DOC_KIND_TTL_MS,
  type ScoreDocumentCurationInput,
  type RecordCurationScoreEventInput,
} from './research/curation-score';
export {
  corroborateAndNormalize,
  isSealValid,
  type CorroborateAndNormalizeInput,
} from './research/verified-normalize';
export {
  persistVerifiedBundle,
  systemDocKindForView,
  type PersistVerifiedBundleInput,
} from './research/seal-persist';
export {
  loadLatestValidSeal,
  loadSealSummariesForSynthesize,
  type SealSummary,
} from './research/seal-load';
export {
  assertBatchEvidenceGrounded,
  allowedRefsFromEvidence,
} from './research/evidence-grounding';
export {
  buildRejectRepairHints,
  canContinueRejectRepair,
  librarianEnvelopeFromBatch,
} from './research/reject-repair';
export {
  validateEvidencePackages,
  type ValidateEvidencePackagesInput,
} from './research/validation';
export {
  submitOperatorResearchArticle,
  type SubmitOperatorResearchArticleOpts,
} from './research/operator-submit';
export { loadOperatorDirectiveHints } from './research/operator-directives';
export {
  resolveResearchGatherCredentials,
  type ResearchGatherCredentials,
} from './research/gather-credentials';
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
import './handlers/equity-refresh';
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
import './handlers/library-system-movers';
import './handlers/library-system-sector-news';
import './handlers/library-system-daily-summaries';

// Dispatch
export {
  executePaperTrade,
  executePaperTradeFromInstruction,
  finalizeRecoveredVenueFill,
  buildFillVerificationFields,
  type PaperTradeRequest,
  type PaperTradeResult,
  type FinalizeRecoveredVenueFillArgs,
} from './dispatch/paper-trade';
export {
  resolveInstructionFromRefs,
  InstructionFinalizeError,
  finalizeErrorToFailureCode,
  type ResolvedInstruction,
  type InstructionFinalizeErrorCode,
} from './dispatch/instruction-finalizer';
export {
  getCompanyBalanceCents,
  getModuleBalanceCents,
  getCompanyRealizedLossCents,
  getDailyRealizedLossCents,
  resolveCompileBalanceCents,
  resolveEquityCentsForLimits,
  type CompileBalanceSource,
  type CompileBalanceResolution,
  type EquityLimitSource,
} from './dispatch/balances';
export {
  resolveExecutionContext,
  type ResolvedExecutionContext,
} from './dispatch/execution-context';
export { getSyntheticQuote } from './dispatch/quotes';
export {
  pollQuotes,
  type PollQuotesResult,
  type PollQuotesOptions,
  type QuotePollStatus,
} from './live-api/poll-quotes';
export {
  resolveLookbackQuotes,
  type ResolveLookbackQuotesResult,
  type ResolveLookbackQuotesOptions,
  type LookbackQuoteStatus,
} from './live-api/lookback-quotes';
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
export {
  recomputeCompanyEquity,
  nextEquityFields,
  DEFAULT_EQUITY_MARK_TTL_MS,
  type EquityTrigger,
  type RecomputeCompanyEquityOpts,
} from './equity/recompute';
export {
  EQUITY_REFRESH_INTERVAL_MS,
  equityRefreshWindowKey,
  equityRefreshIdempotencyKey,
  shouldScheduleEquityRefresh,
  planEquityRefreshJobs,
  type EquityRefreshPlanItem,
} from './equity/refresh';

// Service resolution (company-equity-and-service-sources design)
export {
  resolveModuleServiceCoverage,
  type ModuleServiceBinding,
  type ModuleServiceInput,
  type ModuleServiceSource,
  type ResolvedModuleServiceCoverage,
  type ServiceSourceKind,
} from './services/resolve-module-services';
export { resolveCompanyServiceBindings } from './services/resolve-company-service-bindings';
export {
  summarizeCompanyServiceCoverage,
  type ServiceCoverageSummary,
} from './services/summarize-company-service-coverage';

// Calc / NRA
export * as calcStore from './calc/store';
export { evaluate as calcEvaluate, type CalcCaller } from './calc/evaluate';
export * as fixed from './calc/fixed';
export { describe as describeValue, type BandDefinition } from './calc/descriptors';
export { leakLint, type LeakLintResult } from './calc/leak-lint';
export { checkEnvelope, checkInput, type SanityCheckResult } from './calc/sanity';
export {
  tokenizeQualitativeText,
  tokenOverlapRatio,
  overlapToRelevanceBand,
  scoreRelevanceBand,
  titleSimilarity,
  similarityBandBetweenTexts,
  type RelevanceBand,
} from './research/relevance';

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
  isModuleToModuleTransfer,
  moduleTransferLedgerEntries,
  type TransferDecision,
  type FundTransferStatus,
  type FundTransferRequestedBy,
  type FundTransferInsertFromProposal,
  type ModuleTransferLedgerEntry,
  type ModuleTransferLedgerBalances,
} from './fund-transfers/transfer';
export { resolveCapitalAllocationUsdCents } from './fund-transfers/resolve-amount';
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
