// Node engine: processes ONE run node. Materializes the node's contribution to
// the central, progressively-refined decision tree, asks the deterministic
// agent for a continuation over the tool set, executes the chosen tool(s) to
// emit child nodes (bounded by pattern caps), and enqueues a job per child.
//
// The decision tree is the shared artifact: tactical creates it (shape +
// strategic lever snapshot), execution refines its order-shape params, and the
// verification loop re-tunes the SAME tree. Nothing here calls a model/provider;
// the trade dispatch + verification stay model-free.

import { sql } from "@vercel/postgres";
import type {
  AgentContext,
  NodeKind,
  RoutingPattern,
  RunNode,
} from "@hftr/contracts";
import { PaperBrokerAdapter } from "../../adapters/paper-adapter";
import { generateStrategicLeads, type GeneratedLead } from "../strategic";
import { buildDecisionTree } from "../tactical";
import { prepareTreeCompile } from "../compile-pipeline";
import { familiesForSectors, universeForSectors } from "../universe";
import { activeRiskOffEdgeIds, resolveEventImpactTopicSpawns } from "./event-impact";
import { classifyRegimeWithSnapshot, regimeSnapshotEvidenceRef } from "./regime";
import {
  loadPolicyEnvelope,
  insertLead,
  insertDecisionTree,
  insertActionInstruction,
  writeBlockedTrace,
  updateLeadStatus,
  updateTreeStatus,
  dispatchAndVerify,
  countOpenPositions,
  emitSignal,
  setRunPhaseForward,
  phaseForNodeKind,
  type RunRow,
  type CompileRecord,
} from "../orchestrator";
import {
  insertChildNodes,
  insertResearchTopic,
  insertTrend,
  upsertPaperTrainingFromDispatch,
  loadTreeLeverState,
  persistTreeRefinement,
  setNodeStatus,
  countNodes,
  type RunNodeRow,
} from "./store";
import { enqueueNodeJob } from "../queue";
import { selectContinuation } from "./agent";
import { DEFAULT_PATTERN, stageForKind, clampFanout } from "./patterns";
import { toolsForKind } from "./registry";
import { chooseLeverSettings } from "./levers";
import { emptyLeverState } from "./tree-refine";
import {
  executeStrategicTier,
  executeTacticalTier,
  geometryFromApplied,
} from "./tier-executors";
import {
  buildStalenessContextForTree,
  loadExecutableState,
  syncExecutableState,
  syncExecutableStateAfterTierRetune,
} from "./executable-state";
import { classifyTradingSession, formatVerifiedPatternRef } from "./session-legality";
import { assignForkSeeds, planLoopChild, type ChildNodeSpec } from "./plan";

export interface ProcessResult {
  status: string;
  childrenEnqueued: number;
  childrenEmitted: number;
}

const DEFAULT_SECTORS = ["technology", "financials", "energy"];

export async function processNode(node: RunNodeRow, run: RunRow): Promise<ProcessResult> {
  const pattern = await loadPattern(node.routing_pattern_ref);
  const kind = node.node_kind as NodeKind;
  const stage = stageForKind(pattern, kind);

  // ── MATERIALIZE the node's contribution + compute routing facts ──
  const mat = await materialize(node, run);
  if (mat.terminal) {
    await setNodeStatus(node.id, mat.status);
    await advancePhase(run.id, kind);
    return { status: mat.status, childrenEnqueued: 0, childrenEmitted: 0 };
  }

  if (!stage) {
    await setNodeStatus(node.id, "complete");
    await advancePhase(run.id, kind);
    return { status: "complete", childrenEnqueued: 0, childrenEmitted: 0 };
  }

  // ── ROUTE: deterministic agent continuation over the tool set ──
  const availableTools = toolsForKind(kind).filter((t) => stage.toolset.includes(t.id));
  const ctx: AgentContext = {
    node: toRunNode(node),
    pattern,
    stage,
    availableTools,
    validNextKinds: availableTools.map((t) => t.produces).filter((k): k is NodeKind => k != null),
    philosophyPrompt: run.philosophy_prompt ?? "",
    caps: pattern.caps,
    facts: mat.facts,
  };
  const continuation = selectContinuation(ctx);

  // ── EXECUTE chosen tools -> child specs (bounded by caps) ──
  const nodeCount = await countNodes(run.id);
  const remaining = pattern.caps.maxNodes - nodeCount;
  let specs: ChildNodeSpec[] = [];
  for (const inv of continuation.toolInvocations) {
    const count = clampFanout(Number(Object.values(inv.params)[0] ?? stage.fanout), pattern.caps, remaining - specs.length);
    specs.push(...buildChildSpecs(inv.toolId, node, run, mat, count));
  }

  // Verification-triggered loop (bounded): only at dispatch, reads persisted outcome.
  if (kind === "dispatch") {
    const loopChild = planLoopChild({
      node: { attempt: node.attempt, depth: node.depth, patternStepId: node.pattern_step_id, payload: node.payload },
      outcome: String(mat.facts.outcome ?? ""),
      loop: stage.loop,
      caps: pattern.caps,
      nodeCount,
    });
    if (loopChild) specs.push(loopChild);
  }

  // Depth cap + persist children idempotently + enqueue one job per NEW child.
  const planned = assignForkSeeds(
    { id: node.id, depth: node.depth, attempt: node.attempt },
    specs,
    run.deterministic_seed
  ).filter((p) => p.depth <= pattern.caps.maxDepth);

  const created = await insertChildNodes(node, planned, pattern.id);
  for (const child of created) {
    await enqueueNodeJob({
      runId: run.id,
      workspaceId: run.workspace_id,
      runNodeId: child.id,
      nodeKind: child.node_kind as NodeKind,
    });
  }

  const looped = specs.some((s) => s.spawnReason === "verification_retry" || s.spawnReason === "loop_refine");
  const status = looped ? "looped" : "complete";
  await setNodeStatus(node.id, status);
  await advancePhase(run.id, kind);
  return { status, childrenEnqueued: created.length, childrenEmitted: specs.length };
}

// ── Materialization (per node kind) ─────────────────────────
interface MaterializeResult {
  terminal: boolean;
  status: string;
  facts: Record<string, unknown>;
  refs: {
    topicId?: string;
    trendId?: string;
    leadId?: string;
    treeId?: string;
    instructionId?: string;
    generatedLead?: GeneratedLead;
    sectorRef?: string;
  };
}

async function materialize(node: RunNodeRow, run: RunRow): Promise<MaterializeResult> {
  const p = node.payload ?? {};
  const kind = node.node_kind as NodeKind;
  const refs: MaterializeResult["refs"] = {};

  switch (kind) {
    case "root": {
      await emitSignal(run, "run_started", "run", run.id, null, {}, `run_started:${run.id}`);
      return { terminal: false, status: "running", facts: {}, refs };
    }
    case "research_topic": {
      const sectorRefs = asStringArray(p.sectorRefs, DEFAULT_SECTORS);
      const evidenceRefs = asStringArray(p.evidenceRefs, []);
      const topicId = await insertResearchTopic(run, {
        parentTopicId: asStringOrNull(p.parentTopicId),
        runNodeId: node.id,
        topicSlug: asString(p.topicSlug, node.subject_ref ?? "topic"),
        topicLabel: asString(p.topicLabel, "Research topic"),
        philosophyRef: asString(p.philosophyRef, run.philosophy_prompt ?? ""),
        depth: node.depth,
        sectorRefs,
        evidenceRefs,
        payload: {
          eventImpactEdgeId: p.eventImpactEdgeId ?? null,
          macroTriggerId: p.macroTriggerId ?? null,
          topicTemplateId: p.topicTemplateId ?? null,
        },
      });
      refs.topicId = topicId;
      refs.sectorRef = sectorRefs[0];
      return { terminal: false, status: "running", facts: { topicId }, refs };
    }
    case "trend": {
      const sectorRef = asString(p.sectorRef, DEFAULT_SECTORS[0]!);
      const sectorRefs = asStringArray(p.sectorRefs, [sectorRef]);
      const riskOffEdges = activeRiskOffEdgeIds(run.deterministic_seed);
      const topicId = asStringOrNull(p.researchTopicId);
      const regime = classifyRegimeWithSnapshot(node.deterministic_seed, run.workspace_id, sectorRefs, {
        macroBlackout: riskOffEdges.length > 0,
        trendIds: topicId ? [topicId] : [],
      });
      const regimeSnapshot = regime.snapshot;
      const sectorFamilies = familiesForSectors([sectorRef]).map((f) => f.id);
      const affinity = rankByRegime(sectorFamilies, regime.preferredFamilies);
      const symbolRefs = asStringArray(
        p.symbolRefs,
        universeForSectors([sectorRef]).map((s) => s.symbol).slice(0, 4)
      );
      const trendId = await insertTrend(run, {
        runNodeId: node.id,
        researchTopicId: topicId,
        sectorRef,
        trendLabel: asString(p.trendLabel, `${sectorRef}_${regime.regime}_trend`),
        vectorDescription: asString(
          p.vectorDescription,
          `Deterministic ${regime.regime} trend vector for ${sectorRef} (hurst=${regime.hurst}, adx=${regime.adx}, disagree=${regimeSnapshot.drivers.disagreement}).`
        ),
        strategyFamilyAffinity: affinity,
        symbolRefs,
        evidenceRefs: [regimeSnapshotEvidenceRef(regimeSnapshot)],
        regimeTags: regimeSnapshot.regimeTags,
        regimeSnapshot,
      });
      await emitSignal(run, "trend_classified", "trend", trendId, run.id,
        {
          regime: regime.regime,
          hurst: regime.hurst,
          adx: regime.adx,
          directionBias: regime.directionBias,
          regimeSnapshotId: regimeSnapshot.snapshotId,
        },
        `trend_classified:${trendId}`);
      refs.trendId = trendId;
      refs.sectorRef = sectorRef;
      return {
        terminal: false,
        status: "running",
        facts: {
          trendId,
          sectorRef,
          regime: regime.regime,
          directionBias: regime.directionBias,
          regimeSnapshotId: regimeSnapshot.snapshotId,
        },
        refs,
      };
    }
    case "lead": {
      const lead = p.generatedLead as GeneratedLead | undefined;
      if (!lead) return { terminal: true, status: "failed", facts: {}, refs };
      const leadId = await insertLead(run, lead, {
        runNodeId: node.id,
        trendId: asStringOrNull(p.trendId),
      });
      await emitSignal(run, "lead_generated", "lead_package", leadId, run.id,
        { symbol: lead.primarySymbol, strategyFamilyRef: lead.strategyFamilyRef }, `lead_generated:${leadId}`);
      refs.leadId = leadId;
      refs.generatedLead = lead;
      return { terminal: false, status: "running", facts: {}, refs };
    }
    case "tree": {
      const lead = p.generatedLead as GeneratedLead | undefined;
      const leadId = asStringOrNull(p.leadId);
      if (!lead || !leadId) return { terminal: true, status: "failed", facts: {}, refs };

      // Tactical tier executor: strategic snapshot, then tactical shape on SAME tree.
      const tacticalPreview = chooseLeverSettings("tactical", node.deterministic_seed);
      const geometry = geometryFromApplied(tacticalPreview);
      const built = buildDecisionTree(lead, node.deterministic_seed, geometry);

      const treeId = await insertDecisionTree(run, leadId, lead, built, { runNodeId: node.id });
      await emitSignal(run, "tree_expanded", "decision_tree", treeId, leadId,
        { blockReasons: built.blockReasons, branchRoles: built.branchRoles, recoveryTemplateRef: built.recoveryTemplateRef }, `tree_expanded:${treeId}`);

      const strategicResult = executeStrategicTier(emptyLeverState(), 1, node.deterministic_seed, { treeId, runNodeId: node.id });
      await persistTreeRefinement(run, {
        treeId,
        leverState: strategicResult.refinement.leverState,
        refinement: strategicResult.refinement.refinement,
        rejected: strategicResult.refinement.rejected.map((x) => x.key),
      });

      const tacticalResult = executeTacticalTier(
        strategicResult.refinement.leverState,
        strategicResult.refinement.version,
        node.deterministic_seed,
        { treeId, runNodeId: node.id },
        lead
      );
      await persistTreeRefinement(run, {
        treeId,
        leverState: tacticalResult.refinement.leverState,
        refinement: tacticalResult.refinement.refinement,
        rejected: tacticalResult.refinement.rejected.map((x) => x.key),
      });

      await syncExecutableState(run, treeId, {
        kind: "tree_shaped",
        treeVersion: tacticalResult.refinement.version,
        tree: built,
        blocked: built.blockReasons.length > 0,
      });

      refs.treeId = treeId;
      refs.generatedLead = lead;
      refs.leadId = leadId;
      const blocked = built.blockReasons.length > 0;
      return { terminal: blocked, status: blocked ? "blocked" : "running", facts: { treeId, blocked }, refs };
    }
    case "compile":
    case "loop_refine": {
      // loop_refine + compile both refine the SAME tree's EXECUTION params, then
      // compile a fresh instruction snapshot from the current tree state.
      return materializeCompile(node, run);
    }
    case "dispatch": {
      return materializeDispatch(node, run);
    }
    default:
      return { terminal: true, status: "complete", facts: {}, refs };
  }
}

async function materializeCompile(node: RunNodeRow, run: RunRow): Promise<MaterializeResult> {
  const p = node.payload ?? {};
  const refs: MaterializeResult["refs"] = {};
  const lead = p.generatedLead as GeneratedLead | undefined;
  const leadId = asStringOrNull(p.leadId);
  const treeId = asStringOrNull(p.treeId);
  if (!lead || !leadId || !treeId) return { terminal: true, status: "failed", facts: {}, refs };

  // Execution-scope refinement (or loop re-tune) on the SAME tree. Provider env
  // gates optional model invocation upstream; tier + compile stay deterministic.
  const treeState = (await loadTreeLeverState(treeId)) ?? { leverState: emptyLeverState(), version: 1 };
  const envelope = await loadPolicyEnvelope(run.broker_policy_ref);
  const prepared = prepareTreeCompile(
    lead,
    treeState.leverState,
    treeState.version,
    node.deterministic_seed,
    {
      maxPositionSizeUsd: Number(envelope.max_position_size_usd),
      capitalCapUsd: Number(envelope.capital_cap_usd),
      pricePrecision: 2,
    },
    `${run.id}-${node.id}`.slice(0, 32),
    { treeId, runNodeId: node.id }
  );
  const execResult = prepared.execResult;

  await persistTreeRefinement(run, {
    treeId,
    leverState: execResult.refinement.leverState,
    refinement: execResult.refinement.refinement,
    rejected: execResult.refinement.rejected.map((x) => x.key),
  });

  if (node.node_kind === "loop_refine") {
    await syncExecutableStateAfterTierRetune(run, treeId, "execution", prepared.treeVersion);
  }

  const built = prepared.built;
  const compiled = prepared.compile;

  if (built.blockReasons.length > 0 || compiled.instructions.length === 0) {
    const blockReasons = [...built.blockReasons, ...compiled.blockReasons];
    const instructionId = await insertActionInstruction(run, treeId, leadId, lead, {
      branchId: built.entryBranchIds[0] ?? "no-branch",
      actionVerb: "action.noop",
      orderSpecJson: {},
      guardrailPolicyRefs: lead.guardrailHints,
      status: "blocked",
      handoffEnvelope: {},
    }, { runNodeId: node.id });
    await emitSignal(run, "compile_blocked", "action_instruction", instructionId, treeId, { blockReasons }, `compile_blocked:${instructionId}`);
    await writeBlockedTrace(run, leadId, treeId, instructionId, lead, blockReasons);
    await updateLeadStatus(leadId, "expired");
    await updateTreeStatus(treeId, "blocked", blockReasons);
    await syncExecutableState(run, treeId, {
      kind: "compile_blocked",
      treeVersion: execResult.refinement.version,
      blockReasons,
    });
    return { terminal: true, status: "blocked", facts: { blocked: true }, refs };
  }

  // Order shape (qty / limit offset / TIF) already reflects the execution-layer
  // band-grounded levers applied inside compileInstructions above.
  const instr = compiled.instructions[0]!;

  const instructionId = await insertActionInstruction(run, treeId, leadId, lead, {
    branchId: instr.branchId,
    actionVerb: instr.actionVerb,
    orderSpecJson: instr.orderSpec as unknown as Record<string, unknown>,
    guardrailPolicyRefs: instr.guardrailPolicyRefs,
    status: "pending",
    handoffEnvelope: { compiled: instr },
  }, { runNodeId: node.id });
  await emitSignal(
    run,
    "compile_ready",
    "action_instruction",
    instructionId,
    treeId,
    {
      executionProvider: prepared.provider.profile.id,
      mayInvokeModel: prepared.provider.mayInvokeModel,
    },
    `compile_ready:${instructionId}`
  );

  const staleness = await buildStalenessContextForTree(treeId);
  await syncExecutableState(
    run,
    treeId,
    {
      kind: "compile_ready",
      treeVersion: execResult.refinement.version,
      instruction: {
        instructionId,
        branchId: instr.branchId,
        actionVerb: instr.actionVerb,
        symbol: lead.primarySymbol,
        status: "pending",
      },
    },
    { staleness }
  );

  const exeAfterCompile = await loadExecutableState(treeId);
  if (exeAfterCompile?.status === "fallback") {
    await emitSignal(
      run,
      "compile_stale_fallback",
      "action_instruction",
      instructionId,
      treeId,
      { fallbackReason: exeAfterCompile.waitIntents[0]?.resumeCondition ?? "analysis_stale" },
      `compile_stale_fallback:${instructionId}`
    );
    refs.instructionId = instructionId;
    refs.generatedLead = lead;
    refs.leadId = leadId;
    refs.treeId = treeId;
    return {
      terminal: true,
      status: "blocked",
      facts: { staleFallback: true, instructionId },
      refs,
    };
  }

  refs.instructionId = instructionId;
  refs.generatedLead = lead;
  refs.leadId = leadId;
  refs.treeId = treeId;
  // Carry the compiled instr forward via payload of the dispatch child (built below).
  (refs as { compiledInstr?: unknown }).compiledInstr = instr;
  (refs as { builtTree?: unknown }).builtTree = built;
  return {
    terminal: false,
    status: "running",
    facts: { instructionId, executionProvider: prepared.provider.profile.id },
    refs,
  };
}

async function materializeDispatch(node: RunNodeRow, run: RunRow): Promise<MaterializeResult> {
  const p = node.payload ?? {};
  const refs: MaterializeResult["refs"] = {};
  const lead = p.generatedLead as GeneratedLead | undefined;
  const leadId = asStringOrNull(p.leadId);
  const treeId = asStringOrNull(p.treeId);
  const instructionId = asStringOrNull(p.instructionId);
  const instr = p.compiledInstr as CompileRecord["instr"] | undefined;
  const built = p.builtTree as CompileRecord["tree"] | undefined;
  if (!lead || !leadId || !treeId || !instructionId || !instr || !built) {
    return { terminal: true, status: "failed", facts: { outcome: "no_fill" }, refs };
  }

  const staleness = await buildStalenessContextForTree(treeId);
  const exeBeforeDispatch = await loadExecutableState(treeId);
  if (exeBeforeDispatch?.status === "fallback") {
    await syncExecutableState(
      run,
      treeId,
      {
        kind: "verification_outcome",
        treeVersion: exeBeforeDispatch.treeVersion,
        outcome: "needs_recovery",
        lastVerifiedPatternRef: exeBeforeDispatch.lastVerifiedPatternRef,
      },
      { staleness }
    );
    return {
      terminal: true,
      status: "blocked",
      facts: { outcome: "needs_recovery", staleFallback: true },
      refs,
    };
  }

  const envelope = await loadPolicyEnvelope(run.broker_policy_ref);
  const brokerLabel = run.broker_label ?? "alpaca_paper";
  const adapter = new PaperBrokerAdapter({ fillRatePct: 0.85 });
  await adapter.connect();
  const openPositions = await countOpenPositions(run.id);
  const rec: CompileRecord = { lead, leadId, tree: built, treeId, instructionId, blocked: false, instr };
  const { verification } = await dispatchAndVerify(run, rec, envelope, brokerLabel, adapter, openPositions);
  await adapter.disconnect();

  const outcome = outcomeCode(verification);
  const filled = verification.traceOutcome === "filled" || verification.traceOutcome === "partial_fill" ? 1 : 0;
  const cancelled = verification.traceOutcome === "expired" ? 1 : 0;
  const netPnl = filled ? Number(instr.estimatedOrderUsd ?? 0) * 0.001 : 0;
  await upsertPaperTrainingFromDispatch(run, {
    runNodeId: node.id,
    strategyFamilyRef: lead.strategyFamilyRef,
    sectorRefs: [lead.sectorRef],
    deterministicSeed: node.deterministic_seed,
    tradeCount: 1,
    filledCount: filled,
    cancelledCount: cancelled,
    grossPnlUsd: netPnl,
    netPnlUsd: netPnl,
    totalSlippageBps: 0,
    maxDrawdownUsd: 0,
    maxDrawdownPct: 0,
    status: verification.verificationStatus === "blocked" ? "failed" : "completed",
  });

  const treeVersion = (await loadTreeLeverState(treeId))?.version ?? 1;
  const sessionClass = classifyTradingSession();
  const lastVerifiedPatternRef =
    outcome === "filled" || outcome === "partial_fill"
      ? formatVerifiedPatternRef(treeId, treeVersion, sessionClass)
      : null;
  await syncExecutableState(
    run,
    treeId,
    {
      kind: "verification_outcome",
      treeVersion,
      outcome,
      lastVerifiedPatternRef,
    },
    { staleness: await buildStalenessContextForTree(treeId) }
  );

  return { terminal: false, status: "complete", facts: { outcome }, refs };
}

function outcomeCode(v: { verificationStatus: string; traceOutcome: string; needsRecovery: boolean }): string {
  if (v.verificationStatus === "blocked") return "blocked";
  if (v.needsRecovery) return "needs_recovery";
  if (v.traceOutcome === "filled" || v.traceOutcome === "partial_fill") return "filled";
  if (v.traceOutcome === "expired") return "expired";
  return "no_fill";
}

// ── Child-spec builders (per tool) ──────────────────────────
function buildChildSpecs(
  toolId: string,
  node: RunNodeRow,
  run: RunRow,
  mat: MaterializeResult,
  count: number
): ChildNodeSpec[] {
  const p = node.payload ?? {};
  switch (toolId) {
    case "seed_research_topics": {
      const philosophyRef = asString(p.philosophyRef, run.philosophy_prompt ?? "");
      const sectors = asStringArray(p.sectorRefs, DEFAULT_SECTORS);
      const eventSpawns = resolveEventImpactTopicSpawns(run.deterministic_seed, count);
      const specs: ChildNodeSpec[] = eventSpawns.map((spawn) =>
        childSpec(node, "research_topic", `topic:${spawn.topicSlug}`, "event_impact", {
          topicSlug: spawn.topicSlug,
          topicLabel: spawn.topicLabel,
          philosophyRef,
          parentTopicId: null,
          sectorRefs: spawn.sectorRefs,
          evidenceRefs: [`event_impact_edge:${spawn.edgeId}`, `macro_trigger:${spawn.macroTriggerId}`],
          eventImpactEdgeId: spawn.edgeId,
          macroTriggerId: spawn.macroTriggerId,
          topicTemplateId: spawn.topicTemplateId,
        })
      );
      const remaining = Math.max(0, count - specs.length);
      for (let i = 0; i < remaining; i++) {
        const sector = sectors[i % sectors.length] ?? DEFAULT_SECTORS[0]!;
        specs.push(
          childSpec(node, "research_topic", `topic:${sector}`, "fanout", {
            topicSlug: `topic_${sector}`,
            topicLabel: `${sector} focus`,
            philosophyRef,
            parentTopicId: null,
            sectorRefs: [sector],
          })
        );
      }
      return specs;
    }
    case "decompose_topic": {
      const sectors = asStringArray(p.sectorRefs, DEFAULT_SECTORS);
      return rangeN(count).map((i) =>
        childSpec(node, "research_topic", `subtopic:${i}`, "decompose", {
          topicSlug: `${asString(p.topicSlug, "topic")}_sub${i}`,
          topicLabel: `${asString(p.topicLabel, "topic")} / sub ${i}`,
          philosophyRef: asString(p.philosophyRef, run.philosophy_prompt ?? ""),
          parentTopicId: mat.refs.topicId ?? null,
          sectorRefs: sectors,
        })
      );
    }
    case "emit_trends": {
      const sectors = asStringArray(p.sectorRefs, DEFAULT_SECTORS);
      return rangeN(count).map((i) => {
        const sector = sectors[i % sectors.length] ?? DEFAULT_SECTORS[0]!;
        return childSpec(node, "trend", `trend:${sector}`, "fanout", {
          sectorRef: sector,
          sectorRefs: sectors,
          trendLabel: `${sector}_trend_${i}`,
          vectorDescription: `Deterministic ${sector} trend vector.`,
          researchTopicId: mat.refs.topicId ?? null,
        });
      });
    }
    case "nominate_leads": {
      const sector = mat.refs.sectorRef ?? asString(p.sectorRef, DEFAULT_SECTORS[0]!);
      const { leads } = generateStrategicLeads({
        deterministicSeed: node.deterministic_seed,
        brokerMode: run.broker_mode,
        enabledSectors: [sector],
        maxLeads: Math.max(1, count * 2),
      });
      // Regime bias: prefer leads whose strategy family the regime favors; fall
      // back to all when none align so a trend always nominates at least one.
      const sectorRefs = mat.refs.sectorRef ? [mat.refs.sectorRef] : asStringArray(p.sectorRefs, DEFAULT_SECTORS);
      const riskOffEdges = activeRiskOffEdgeIds(run.deterministic_seed);
      const regime = classifyRegimeWithSnapshot(node.deterministic_seed, run.workspace_id, sectorRefs, {
        macroBlackout: riskOffEdges.length > 0,
        trendIds: mat.refs.trendId ? [mat.refs.trendId] : [],
      });
      const favored = leads.filter((l) => regime.preferredFamilies.includes(l.strategyFamilyRef));
      const ordered = favored.length > 0 ? [...favored, ...leads.filter((l) => !favored.includes(l))] : leads;
      return ordered.slice(0, count).map((lead) =>
        childSpec(node, "lead", lead.primarySymbol, "fanout", {
          generatedLead: lead,
          trendId: mat.refs.trendId ?? null,
        })
      );
    }
    case "expand_tree": {
      const lead = mat.refs.generatedLead;
      return rangeN(count).map((i) =>
        childSpec(node, "tree", `${lead?.primarySymbol ?? "tree"}#${i}`, "fanout", {
          generatedLead: lead,
          leadId: mat.refs.leadId ?? null,
        })
      );
    }
    case "compile_instruction":
    case "retune_tree": {
      // tree -> compile, or loop_refine -> compile. Carry the tree refs forward.
      return [
        childSpec(node, "compile", `compile:${mat.refs.treeId ?? p.treeId ?? "tree"}`, toolId === "retune_tree" ? "loop_refine" : "tail", {
          generatedLead: mat.refs.generatedLead ?? p.generatedLead,
          leadId: mat.refs.leadId ?? p.leadId ?? null,
          treeId: mat.refs.treeId ?? p.treeId ?? null,
        }),
      ];
    }
    case "dispatch_instruction": {
      return [
        childSpec(node, "dispatch", `dispatch:${mat.refs.instructionId ?? "instr"}`, "tail", {
          generatedLead: mat.refs.generatedLead ?? p.generatedLead,
          leadId: mat.refs.leadId ?? p.leadId ?? null,
          treeId: mat.refs.treeId ?? p.treeId ?? null,
          instructionId: mat.refs.instructionId ?? null,
          compiledInstr: (mat.refs as { compiledInstr?: unknown }).compiledInstr ?? null,
          builtTree: (mat.refs as { builtTree?: unknown }).builtTree ?? null,
        }),
      ];
    }
    default:
      return [];
  }
}

function childSpec(
  parent: RunNodeRow,
  nodeKind: NodeKind,
  subjectRef: string,
  spawnReason: ChildNodeSpec["spawnReason"],
  payload: Record<string, unknown>
): ChildNodeSpec {
  return { nodeKind, subjectRef, spawnReason, patternStepId: `step-${nodeKind}`, payload };
}

// ── Helpers ─────────────────────────────────────────────────
async function loadPattern(patternId: string): Promise<RoutingPattern> {
  try {
    const { rows } = await sql<{ definition: RoutingPattern }>`
      SELECT definition FROM routing_patterns WHERE id = ${patternId} AND status = 'active' LIMIT 1
    `;
    if (rows[0]?.definition) return rows[0].definition;
  } catch {
    // routing_patterns table may be unmigrated in some contexts; fall back.
  }
  return DEFAULT_PATTERN;
}

async function advancePhase(runId: string, kind: NodeKind): Promise<void> {
  await setRunPhaseForward(runId, phaseForNodeKind(kind));
}

function toRunNode(node: RunNodeRow): RunNode {
  return {
    id: node.id,
    runId: node.run_id,
    workspaceId: node.workspace_id,
    parentNodeId: node.parent_node_id,
    rootNodeId: node.root_node_id,
    nodeKind: node.node_kind as NodeKind,
    subjectRef: node.subject_ref,
    routingPatternRef: node.routing_pattern_ref,
    patternStepId: node.pattern_step_id,
    depth: node.depth,
    forkIndex: node.fork_index,
    attempt: node.attempt,
    deterministicSeed: node.deterministic_seed,
    status: node.status as RunNode["status"],
    spawnReason: node.spawn_reason as RunNode["spawnReason"],
    controlSnapshotRef: node.control_snapshot_ref,
    payload: node.payload,
    createdAt: "",
    updatedAt: "",
    completedAt: null,
  };
}

function rankByRegime(families: string[], preferred: string[]): string[] {
  const favored = families.filter((f) => preferred.includes(f));
  const rest = families.filter((f) => !preferred.includes(f));
  return [...favored, ...rest];
}

function rangeN(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}
function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}
function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function asStringArray(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string") && v.length > 0 ? (v as string[]) : fallback;
}
