// Deterministic event-impact graph resolver (macro catalog edges → research spawns).

import { seededRng } from "../rng";
import {
  loadMacroEventImpactEdges,
  topicTemplateForId,
  type EventImpactEdge,
} from "../research-catalog";

export interface EventImpactTopicSpawn {
  edgeId: string;
  macroTriggerId: string;
  topicTemplateId: string;
  topicSlug: string;
  topicLabel: string;
  sectorRefs: string[];
  playbookId?: string;
  halfLifeMin?: number;
}

export function spawnEdgesForResearchTopics(): EventImpactEdge[] {
  return loadMacroEventImpactEdges().filter((e) => e.edgeType === "spawns_research_topic" && e.to.kind === "research_topic");
}

/**
 * Pick which macro `spawns_research_topic` edges are active for this run slice.
 * Fully deterministic from the seed; no live feed required for M1.
 */
export function resolveEventImpactTopicSpawns(seed: string, maxCount: number): EventImpactTopicSpawn[] {
  const edges = spawnEdgesForResearchTopics();
  if (edges.length === 0 || maxCount <= 0) return [];

  const rng = seededRng(`event-impact:${seed}`);
  const ordered = [...edges].sort((a, b) => a.id.localeCompare(b.id));
  const active = ordered.filter(() => rng() < 0.72);
  const picks = (active.length > 0 ? active : [ordered[Math.floor(rng() * ordered.length)]!]).slice(0, maxCount);

  return picks.map((edge) => {
    const templateId = edge.to.id;
    const tpl = topicTemplateForId(templateId);
    return {
      edgeId: edge.id,
      macroTriggerId: edge.from.id,
      topicTemplateId: templateId,
      topicSlug: tpl.topicSlug,
      topicLabel: tpl.topicLabel,
      sectorRefs: tpl.sectorRefs,
      playbookId: edge.playbookId,
      halfLifeMin: edge.halfLifeMin,
    };
  });
}

/** Edges that elevate risk_off on a workspace run (blackout / suppress families). */
export function activeRiskOffEdgeIds(seed: string): string[] {
  const rng = seededRng(`event-impact-risk:${seed}`);
  return loadMacroEventImpactEdges()
    .filter(
      (e) =>
        e.edgeType === "inserts_blackout" ||
        e.edgeType === "suppresses_family" ||
        (e.playbookId?.includes("stress") ?? false)
    )
    .filter(() => rng() < 0.35)
    .map((e) => e.id);
}
