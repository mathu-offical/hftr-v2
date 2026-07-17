// Deterministic node-kind agent — the swappable stand-in for model-driven
// continuation over the deterministic tool set. Given the seeded context (node,
// pattern stage, available tools, valid next kinds), it returns a CONTINUATION
// STRATEGY: which tool(s) to invoke with bounded params. A real LLM would return
// the same AgentContinuation shape; the orchestrator executes it deterministically.

import type { AgentContext, AgentContinuation, ToolInvocation } from "@hftr/contracts";
import { seededRng } from "../rng";

export function selectContinuation(ctx: AgentContext): AgentContinuation {
  const { node, stage, availableTools } = ctx;
  const rng = seededRng(`agent:${node.deterministicSeed}`);

  // research_topic is the one branching decision: decompose deeper vs emit trends.
  if (node.nodeKind === "research_topic") {
    const canDecompose =
      !!stage.recurse &&
      node.depth < stage.recurse.maxDepth &&
      availableTools.some((t) => t.id === "decompose_topic");
    if (canDecompose && rng() < 0.5) {
      return {
        toolInvocations: [
          { toolId: "decompose_topic", params: { subtopicCount: stage.recurse!.subtopicFanout } },
        ],
        rationaleCode: "research_topic:decompose",
      };
    }
    return {
      toolInvocations: [{ toolId: "emit_trends", params: { trendCount: stage.fanout } }],
      rationaleCode: "research_topic:emit_trends",
    };
  }

  // Every other kind has a single in-scope tool producing the stage's next kind.
  const tool =
    availableTools.find((t) => t.produces === stage.produces) ?? availableTools[0];
  if (!tool) {
    return { toolInvocations: [], rationaleCode: `${node.nodeKind}:terminal` };
  }

  const invocation: ToolInvocation = { toolId: tool.id, params: {} };
  const countKey = tool.paramKeys[0];
  if (countKey) invocation.params[countKey] = stage.fanout;

  return {
    toolInvocations: [invocation],
    rationaleCode: `${node.nodeKind}:${tool.id}`,
  };
}
