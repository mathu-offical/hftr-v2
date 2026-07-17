// Routing patterns: shape-bounded continuation patterns over node kinds.
//
// A pattern controls pathway SHAPE (fanout cardinalities, recursion depth, loop
// attempts) and weights, globally bounded by hard caps. It can NEVER add a stage
// that crosses the model-free trade-dispatch boundary or touches immutable knobs
// (guardrails, legality, verification schemas). validatePattern() enforces this
// fail-closed. The interpreter is deterministic: given (seed, pattern, persisted
// evidence) it reproduces the identical tree.

import type {
  NodeKind,
  PatternCaps,
  PatternValidationResult,
  RoutingPattern,
  RoutingStage,
} from "@hftr/contracts";
import type { Regime } from "./regime";
import { RECOVERY_LADDER_TEMPLATES } from "./bands";

export const DEFAULT_CAPS: PatternCaps = {
  maxDepth: 9,
  maxNodes: 200,
  branchCardinalityCap: 6,
  maxLoopAttempts: 3,
};

// Canonical, immutable adjacency. A pattern stage's `produces` MUST be in this
// allow-list for its node kind. This is what keeps custom patterns from
// restructuring across the deterministic boundary.
const ALLOWED_TRANSITIONS: Record<NodeKind, NodeKind[]> = {
  root: ["research_topic"],
  research_topic: ["research_topic", "trend"],
  trend: ["lead"],
  lead: ["tree"],
  tree: ["compile"],
  compile: ["dispatch"],
  dispatch: ["loop_refine"], // analytical loop only; no analytical fan-out past dispatch
  loop_refine: ["compile"], // re-tune the SAME tree, then re-compile + re-dispatch
};

// Tool ids legal at each node kind (the deterministic tool registry surface).
const NODE_TOOLSETS: Record<NodeKind, string[]> = {
  root: ["seed_research_topics"],
  research_topic: ["decompose_topic", "emit_trends"],
  trend: ["nominate_leads"],
  lead: ["expand_tree"],
  tree: ["compile_instruction"],
  compile: ["dispatch_instruction"],
  dispatch: ["submit_and_verify"],
  loop_refine: ["retune_tree"],
};

export function toolsetForKind(kind: NodeKind): string[] {
  return NODE_TOOLSETS[kind] ?? [];
}

// ── Default "tail" pattern: the proven spine root -> topic -> trend -> lead ->
//    tree -> compile -> dispatch (+ bounded verification loop). ───────────────
export const DEFAULT_PATTERN: RoutingPattern = {
  id: "tail-default",
  version: "1.0.0",
  name: "Default trend-to-dispatch tail",
  patternClass: "general",
  status: "active",
  rootStepId: "step-root",
  caps: DEFAULT_CAPS,
  sourceRef: "agent-docs/research/trend-lead-pattern-library.json",
  stages: [
    { nodeKind: "root", produces: "research_topic", fanout: 2, toolset: ["seed_research_topics"] },
    {
      nodeKind: "research_topic",
      produces: "trend",
      fanout: 2,
      toolset: ["decompose_topic", "emit_trends"],
      recurse: { maxDepth: 2, subtopicFanout: 2 },
    },
    { nodeKind: "trend", produces: "lead", fanout: 2, toolset: ["nominate_leads"] },
    { nodeKind: "lead", produces: "tree", fanout: 1, toolset: ["expand_tree"] },
    { nodeKind: "tree", produces: "compile", fanout: 1, toolset: ["compile_instruction"] },
    { nodeKind: "compile", produces: "dispatch", fanout: 1, toolset: ["dispatch_instruction"] },
    {
      nodeKind: "dispatch",
      produces: null,
      fanout: 0,
      toolset: ["submit_and_verify"],
      loop: {
        onOutcomes: ["no_fill", "expired", "needs_recovery"],
        spawnKind: "loop_refine",
        spawnReason: "verification_retry",
        maxAttempts: 3,
      },
    },
    { nodeKind: "loop_refine", produces: "compile", fanout: 1, toolset: ["retune_tree"] },
  ],
};

export function stageForKind(pattern: RoutingPattern, kind: NodeKind): RoutingStage | undefined {
  return pattern.stages.find((s) => s.nodeKind === kind);
}

// ── Library loader (shape-only): map the trend-lead pattern library to routing
//    patterns sharing the spine but with library-derived fan-out shapes. ──────
export interface PatternLibraryEntry {
  id: string;
  name: string;
  class?: string;
  preferredFamilies?: string[];
  sectorBindings?: string[];
}
export interface PatternLibraryJson {
  patterns?: PatternLibraryEntry[];
}

export function buildLibraryPatterns(library: PatternLibraryJson): RoutingPattern[] {
  const entries = library.patterns ?? [];
  return entries.map((entry) => {
    const trendFanout = clamp(entry.sectorBindings?.length ?? 2, 1, DEFAULT_CAPS.branchCardinalityCap);
    const leadFanout = clamp(entry.preferredFamilies?.length ?? 2, 1, DEFAULT_CAPS.branchCardinalityCap);
    const stages: RoutingStage[] = DEFAULT_PATTERN.stages.map((s) => {
      if (s.nodeKind === "trend") return { ...s, fanout: trendFanout };
      if (s.nodeKind === "lead") return { ...s, fanout: leadFanout };
      return { ...s };
    });
    return {
      id: entry.id,
      version: "1.0.0",
      name: entry.name,
      patternClass: entry.class ?? "general",
      status: "active",
      rootStepId: "step-root",
      caps: DEFAULT_CAPS,
      sourceRef: "agent-docs/research/trend-lead-pattern-library.json",
      stages,
    };
  });
}

// Concrete, versioned routing-pattern seeds consumed from
// agent-docs/research/trend-lead-pattern-library.json (patterns[]). Each becomes
// a shape-bounded routing pattern sharing the proven spine but with library-
// derived trend/lead fan-out. Values are CONSUMED, not authored here.
export const LIBRARY_PATTERN_SEEDS: PatternLibraryEntry[] = [
  { id: "lead-001", name: "Sector leader to sympathy", class: "sector_breadth_and_leadership", preferredFamilies: ["lead_lag_propagation", "pullback_continuation", "gap_and_go"], sectorBindings: ["technology", "communication_services", "industrials", "financials"] },
  { id: "lead-002", name: "Catalyst cluster readthrough", class: "event_and_supply_chain_readthrough", preferredFamilies: ["earnings_guidance_drift", "gap_and_go", "lead_lag_propagation"], sectorBindings: ["technology", "consumer_discretionary", "health_care", "industrials"] },
  { id: "lead-003", name: "Macro shock blackout then reentry", class: "macro_repricing_and_reentry", preferredFamilies: ["opening_range_breakout", "liquidity_sweep_reversal", "vwap_reversion"], sectorBindings: ["financials", "technology", "consumer_discretionary", "real_estate", "utilities"] },
  { id: "lead-004", name: "Liquidity sweep then reclaim", class: "microstructure_and_level_recovery", preferredFamilies: ["liquidity_sweep_reversal", "vwap_reversion", "pullback_continuation"], sectorBindings: ["financials", "energy", "technology", "crypto_equities_and_proxies"] },
  { id: "lead-005", name: "Overnight discovery to regular session handoff", class: "session_transition_and_discovery", preferredFamilies: ["extended_overnight_session_response", "gap_and_go", "opening_range_breakout"], sectorBindings: ["technology", "energy", "consumer_discretionary", "crypto_equities_and_proxies"] },
  { id: "lead-006", name: "Defensive rotation then quality breakout", class: "defensive_regime_rotation", preferredFamilies: ["pullback_continuation", "vwap_reversion", "earnings_guidance_drift"], sectorBindings: ["consumer_staples", "utilities", "health_care"] },
  { id: "lead-007", name: "Policy gap to supplier sympathy", class: "policy_and_supply_chain_repricing", preferredFamilies: ["gap_and_go", "lead_lag_propagation", "pullback_continuation"], sectorBindings: ["industrials", "technology", "materials", "energy"] },
  { id: "lead-008", name: "Crypto regulatory shock then proxy repricing", class: "crypto_policy_and_proxy_rotation", preferredFamilies: ["gap_and_go", "lead_lag_propagation", "extended_overnight_session_response"], sectorBindings: ["crypto_equities_and_proxies", "financials", "technology"] },
  { id: "lead-009", name: "Rates shock to property and utility rotation", class: "rates_sensitive_cross_sector_rotation", preferredFamilies: ["pullback_continuation", "vwap_reversion", "lead_lag_propagation"], sectorBindings: ["real_estate", "utilities", "financials"] },
];

/** Regime-branch variants: same spine, fan-out biased by classified regime. */
const REGIME_FANOUT_BIAS: Record<Regime, { trend: number; lead: number }> = {
  momentum: { trend: 1, lead: 1 },
  mean_reversion: { trend: 0, lead: 0 },
  risk_off: { trend: -1, lead: -1 },
  neutral: { trend: 0, lead: -1 },
};

function buildRegimeBranchPatterns(): RoutingPattern[] {
  return (["momentum", "mean_reversion", "risk_off", "neutral"] as Regime[]).map((regime) => {
    const bias = REGIME_FANOUT_BIAS[regime];
    const stages: RoutingStage[] = DEFAULT_PATTERN.stages.map((s) => {
      if (s.nodeKind === "trend") {
        return { ...s, fanout: clamp(s.fanout + bias.trend, 1, DEFAULT_CAPS.branchCardinalityCap) };
      }
      if (s.nodeKind === "lead") {
        return { ...s, fanout: clamp(s.fanout + bias.lead, 1, DEFAULT_CAPS.branchCardinalityCap) };
      }
      return { ...s };
    });
    return {
      id: `regime-${regime}`,
      version: "1.0.0",
      name: `Regime branch (${regime})`,
      patternClass: `regime_${regime}`,
      status: "active",
      rootStepId: "step-root",
      caps: DEFAULT_CAPS,
      sourceRef: "agent-docs/research/trend-lead-pattern-library.json#regimeRouterThresholds",
      stages,
    };
  });
}

/**
 * Recovery-ladder variants: dispatch verification loop depth tracks the seeded
 * recovery template phase count (bounded by maxLoopAttempts).
 */
export function buildRecoveryPatterns(): RoutingPattern[] {
  return Object.entries(RECOVERY_LADDER_TEMPLATES).map(([templateId, tpl]) => {
    const maxAttempts = Math.min(DEFAULT_CAPS.maxLoopAttempts, tpl.phases.length);
    const stages: RoutingStage[] = DEFAULT_PATTERN.stages.map((s) => {
      if (s.nodeKind !== "dispatch" || !s.loop) return { ...s };
      return {
        ...s,
        loop: { ...s.loop, maxAttempts, onOutcomes: [...s.loop.onOutcomes] },
      };
    });
    return {
      id: `recovery-${templateId}`,
      version: "1.0.0",
      name: `Recovery ladder ${templateId}`,
      patternClass: "recovery_ladder",
      status: "active",
      rootStepId: "step-root",
      caps: DEFAULT_CAPS,
      sourceRef: "agent-docs/research/seeded-strategy-catalog.json#recoveryLadderTemplates",
      stages,
    };
  });
}

/** Count of concrete routing patterns seeded by {@link buildSeededPatterns}. */
export const ROUTING_PATTERN_CATALOG_SIZE =
  1 + 4 + Object.keys(RECOVERY_LADDER_TEMPLATES).length + LIBRARY_PATTERN_SEEDS.length;

/**
 * The full set of concrete, versioned routing patterns to seed: the proven
 * trend-to-dispatch tail, regime branches, recovery-ladder variants, and every
 * library-derived shape-bounded pattern. All are validated fail-closed before
 * they can be persisted.
 */
export function buildSeededPatterns(): RoutingPattern[] {
  return [
    DEFAULT_PATTERN,
    ...buildRegimeBranchPatterns(),
    ...buildRecoveryPatterns(),
    ...buildLibraryPatterns({ patterns: LIBRARY_PATTERN_SEEDS }),
  ];
}

/** Deterministic interpreter: bound a stage's desired fan-out by caps + budget. */
export function interpretStageFanout(
  pattern: RoutingPattern,
  kind: NodeKind,
  remainingNodes: number,
  desiredOverride?: number
): number {
  const stage = stageForKind(pattern, kind);
  if (!stage) return 0;
  return clampFanout(desiredOverride ?? stage.fanout, pattern.caps, remainingNodes);
}

// ── Validation (fail-closed shape enforcement) ──────────────
export function validatePattern(pattern: RoutingPattern): PatternValidationResult {
  const issues: PatternValidationResult["issues"] = [];
  const caps = pattern.caps;

  if (!caps || caps.branchCardinalityCap <= 0 || caps.maxDepth <= 0 || caps.maxNodes <= 0) {
    issues.push({ code: "invalid_caps", detail: "pattern caps must be positive", stepId: null });
  }

  for (const stage of pattern.stages) {
    const allowed = ALLOWED_TRANSITIONS[stage.nodeKind];
    if (!allowed) {
      issues.push({ code: "unknown_node_kind", detail: stage.nodeKind, stepId: stage.nodeKind });
      continue;
    }
    if (stage.produces && !allowed.includes(stage.produces)) {
      issues.push({
        code: "illegal_transition",
        detail: `${stage.nodeKind} -> ${stage.produces} crosses the deterministic boundary or restructures an immutable edge`,
        stepId: stage.nodeKind,
      });
    }
    if (caps && stage.fanout > caps.branchCardinalityCap) {
      issues.push({
        code: "fanout_exceeds_cap",
        detail: `${stage.nodeKind} fanout ${stage.fanout} > branchCardinalityCap ${caps.branchCardinalityCap}`,
        stepId: stage.nodeKind,
      });
    }
    const legalTools = NODE_TOOLSETS[stage.nodeKind] ?? [];
    for (const tool of stage.toolset) {
      if (!legalTools.includes(tool)) {
        issues.push({ code: "unknown_tool", detail: `${tool} not legal at ${stage.nodeKind}`, stepId: stage.nodeKind });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── Interpreter clamp: bound desired fan-out by caps + remaining node budget ──
export function clampFanout(desired: number, caps: PatternCaps, remainingNodes: number): number {
  return Math.max(0, Math.min(desired, caps.branchCardinalityCap, Math.max(0, remainingNodes)));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
