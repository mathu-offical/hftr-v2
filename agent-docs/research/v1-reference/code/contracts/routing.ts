// ============================================================
// Routing + run-node contracts — the unit of work is a NODE, not a tier.
//
// A run expands into a tree of run_nodes. Each node is handled by a node-kind
// agent that selects DETERMINISTIC TOOLS (a fixed registry per node kind); the
// orchestrator executes the selected tools, which persist artifacts and emit
// child nodes. Routing patterns control pathway SHAPE (fanout cardinalities,
// which families/topics, loop attempts) and weights, globally bounded by hard
// caps. Guardrails, legality, and verification schemas remain immutable.
// ============================================================

// Node kinds form the spine: philosophy/root -> research_topic (recursive) ->
// trend -> lead -> tree -> compile -> dispatch. `loop_refine` is a first-class
// retry/deeper-analysis node spawned by verification routing.
export type NodeKind =
  | "root"
  | "research_topic"
  | "trend"
  | "lead"
  | "tree"
  | "compile"
  | "dispatch"
  | "loop_refine";

export type NodeStatus =
  | "pending"
  | "running"
  | "complete"
  | "blocked"
  | "failed"
  | "looped"
  | "cancelled";

export type SpawnReason =
  | "root"
  | "fanout"
  | "decompose"
  | "event_impact"
  | "tail"
  | "loop_refine"
  | "verification_retry"
  | "manual_refine";

// ── RunNode ───────────────────────────────────────────────────
export interface RunNode {
  id: string;
  runId: string;
  workspaceId: string;
  parentNodeId: string | null;
  rootNodeId: string | null;
  nodeKind: NodeKind;
  subjectRef: string | null;
  routingPatternRef: string;
  patternStepId: string;
  depth: number;
  forkIndex: number;
  attempt: number;
  deterministicSeed: string;
  status: NodeStatus;
  spawnReason: SpawnReason;
  controlSnapshotRef: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// ── Routing pattern (shape-bounded) ──────────────────────────
export interface PatternCaps {
  /** Maximum node depth from root. */
  maxDepth: number;
  /** Maximum total nodes per run (hard termination guarantee). */
  maxNodes: number;
  /** Per-node child fan-out ceiling (GranularityControlProfile.branchCardinalityCap). */
  branchCardinalityCap: number;
  /** Maximum loop/retry attempts for any single node lineage. */
  maxLoopAttempts: number;
}

export interface RoutingLoopConfig {
  /** Verification/analysis outcome codes that route the node back into a loop. */
  onOutcomes: string[];
  /** Node kind the loop re-enters (deeper analysis / retry). */
  spawnKind: NodeKind;
  spawnReason: SpawnReason;
  maxAttempts: number;
}

export interface RoutingStage {
  nodeKind: NodeKind;
  /** Child node kind this stage emits (null = terminal / no further fan-out). */
  produces: NodeKind | null;
  /** Desired child count, clamped by caps + branchCardinalityCap. */
  fanout: number;
  /** Deterministic tool ids available to the agent at this node kind. */
  toolset: string[];
  /** Recursion config for research-topic decomposition. */
  recurse?: { maxDepth: number; subtopicFanout: number };
  /** Loop/retry config (typically on the dispatch verification stage). */
  loop?: RoutingLoopConfig;
  /** Named deterministic predicate gating child emission (reads persisted fields). */
  matchPredicate?: string;
}

export interface RoutingPattern {
  id: string;
  version: string;
  name: string;
  patternClass: string;
  status: "active" | "draft" | "superseded";
  /** Pattern step id of the root stage. */
  rootStepId: string;
  /** Stage configuration keyed by node kind (one stage per kind it governs). */
  stages: RoutingStage[];
  caps: PatternCaps;
  sourceRef?: string;
}

// ── Tool registry + agent-continuation contract ──────────────
// The reasoning agent does NOT free-form routing: it selects among deterministic
// tools whose execution is reproducible. Each tool declares the node kind it
// runs at and the child node kind it can emit.
export interface ToolSpec {
  id: string;
  nodeKind: NodeKind;
  /** Child node kind the tool emits (null = terminal effect, e.g. dispatch). */
  produces: NodeKind | null;
  summary: string;
  /** Bounded parameter names the agent may set (all clamped by caps). */
  paramKeys: string[];
}

export interface ToolInvocation {
  toolId: string;
  params: Record<string, number | string | boolean>;
}

// The continuation an agent returns: which deterministic tool(s) to invoke. The
// orchestrator executes them and emits the resulting child nodes.
export interface AgentContinuation {
  toolInvocations: ToolInvocation[];
  /** Stable, structured reason code (never free text routing). */
  rationaleCode: string;
}

// Context every agent is SEEDED WITH so it always understands its next steps:
// the node, its pattern, the available tools, valid next node kinds, the
// philosophy prompt, caps, and persisted structured facts for predicates.
export interface AgentContext {
  node: RunNode;
  pattern: RoutingPattern;
  stage: RoutingStage;
  availableTools: ToolSpec[];
  validNextKinds: NodeKind[];
  philosophyPrompt: string;
  caps: PatternCaps;
  facts: Record<string, unknown>;
}

/** A node-kind agent. Deterministic today (seeded selection); LLM-swappable later. */
export type TierAgent = (ctx: AgentContext) => AgentContinuation;

// ── ResearchTopic (recursive spine record) ───────────────────
export interface ResearchTopic {
  id: string;
  workspaceId: string;
  runId: string;
  parentTopicId: string | null;
  runNodeId: string | null;
  topicSlug: string;
  topicLabel: string;
  philosophyRef: string;
  depth: number;
  evidenceRefs: string[];
  sectorRefs: string[];
  status: "active" | "decomposed" | "exhausted" | "cancelled";
  payload: Record<string, unknown>;
  createdAt: string;
}

// ── Pattern validation result (shape-bounded enforcement) ────
export interface PatternValidationIssue {
  code: string;
  detail: string;
  stepId: string | null;
}

export interface PatternValidationResult {
  valid: boolean;
  issues: PatternValidationIssue[];
}
