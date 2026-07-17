// Deterministic tool registry per node kind. The reasoning agent does not
// free-form routing: it selects among these fixed, reproducible tools. Each tool
// runs at a node kind and emits a specific child node kind (or a terminal effect
// for submit_and_verify). Tool params are bounded and clamped by pattern caps.

import type { NodeKind, ToolSpec } from "@hftr/contracts";

export const TOOL_REGISTRY: readonly ToolSpec[] = [
  { id: "seed_research_topics", nodeKind: "root", produces: "research_topic", summary: "Seed top-level research topics from the workspace philosophy prompt.", paramKeys: ["topicCount"] },
  { id: "decompose_topic", nodeKind: "research_topic", produces: "research_topic", summary: "Decompose a topic into sub-topics for progressive granularity.", paramKeys: ["subtopicCount"] },
  { id: "emit_trends", nodeKind: "research_topic", produces: "trend", summary: "Emit market trends from a research topic.", paramKeys: ["trendCount"] },
  { id: "nominate_leads", nodeKind: "trend", produces: "lead", summary: "Nominate cross-symbol leads for a trend (strategic breadth).", paramKeys: ["leadCount"] },
  { id: "expand_tree", nodeKind: "lead", produces: "tree", summary: "Expand a lead into one or more decision-tree shapes (tactical).", paramKeys: ["treeCount"] },
  { id: "compile_instruction", nodeKind: "tree", produces: "compile", summary: "Refine the tree with execution params and compile an instruction.", paramKeys: [] },
  { id: "dispatch_instruction", nodeKind: "compile", produces: "dispatch", summary: "Hand the compiled, fully-valued tree to deterministic dispatch.", paramKeys: [] },
  { id: "submit_and_verify", nodeKind: "dispatch", produces: null, summary: "Model-free broker submission + deterministic trade verification.", paramKeys: [] },
  { id: "retune_tree", nodeKind: "loop_refine", produces: "compile", summary: "Verification-triggered deeper analysis: re-tune the SAME tree, then re-compile.", paramKeys: [] },
];

const BY_ID = new Map<string, ToolSpec>(TOOL_REGISTRY.map((t) => [t.id, t]));
export function toolById(id: string): ToolSpec | undefined {
  return BY_ID.get(id);
}

export function toolsForKind(kind: NodeKind): ToolSpec[] {
  return TOOL_REGISTRY.filter((t) => t.nodeKind === kind);
}
