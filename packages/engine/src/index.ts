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
  type EnqueueDef,
  type ClaimedJob,
} from './queue/queue';
export { drainQueues, type DrainResult } from './queue/drain';

// Handlers (importing registers built-ins)
export { registerHandler, getHandler, registeredKinds } from './handlers/registry';
export type { ModelGateway, ResearchSynthesizeInput } from './handlers/model-gateway';
import './handlers/maintenance';
import './handlers/dispatch';
import './handlers/trend';
import './handlers/promote';
import './handlers/research';
import './handlers/reconcile';
import './handlers/reconcile';

// Dispatch
export {
  executePaperTrade,
  type PaperTradeRequest,
  type PaperTradeResult,
} from './dispatch/paper-trade';
export { getCompanyBalanceCents } from './dispatch/balances';
export {
  resolveExecutionContext,
  type ResolvedExecutionContext,
} from './dispatch/execution-context';
export { getSyntheticQuote } from './dispatch/quotes';
export { applyFill, getPosition, type PositionRow } from './dispatch/positions';

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
