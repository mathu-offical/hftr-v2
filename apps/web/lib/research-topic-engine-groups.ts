/**
 * Group research topics by owning research engine / module (D-166).
 * Shared libraries stay company-wide; topics are per research engine.
 */

export type TopicEngineFields = {
  moduleId: string;
  engineInstanceId?: string | null;
  engineLabel?: string | null;
  researchModuleName?: string | null;
};

export type ResearchTopicEngineGroup<T extends TopicEngineFields> = {
  /** engineInstanceId when bound; otherwise moduleId for unbound research modules. */
  groupKey: string;
  label: string;
  engineInstanceId: string | null;
  moduleIds: string[];
  topics: T[];
};

function engineChipLabel(topic: TopicEngineFields): string {
  const fromEngine = topic.engineLabel?.trim();
  if (fromEngine) return fromEngine;
  const fromModule = topic.researchModuleName?.trim();
  if (fromModule) return fromModule;
  return 'Research';
}

/** Operator-facing chip text for a topic's originating research engine. */
export function researchTopicEngineChip(topic: TopicEngineFields): string {
  return engineChipLabel(topic);
}

/**
 * Partition topics into engine sections. Topics without a research module mapping
 * still group by moduleId so multi-engine companies stay separated.
 */
export function groupTopicsByResearchEngine<T extends TopicEngineFields>(
  topics: T[],
): ResearchTopicEngineGroup<T>[] {
  const byKey = new Map<string, ResearchTopicEngineGroup<T>>();

  for (const topic of topics) {
    const engineId = topic.engineInstanceId ?? null;
    const groupKey = engineId ?? `module:${topic.moduleId}`;
    const label = engineChipLabel(topic);
    const existing = byKey.get(groupKey);
    if (existing) {
      existing.topics.push(topic);
      if (!existing.moduleIds.includes(topic.moduleId)) {
        existing.moduleIds.push(topic.moduleId);
      }
      // Prefer a longer/more specific label if we started with a fallback.
      if (label.length > existing.label.length) existing.label = label;
    } else {
      byKey.set(groupKey, {
        groupKey,
        label,
        engineInstanceId: engineId,
        moduleIds: [topic.moduleId],
        topics: [topic],
      });
    }
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Deduplicate baseline / same-scope libraries for the scrolling shelves UI so
 * shared company libraries appear once even when engines overlap (D-166).
 */
export function dedupeLibrariesForScrollUi<
  T extends { id: string; name: string; topicScope: string; isEngineDataHub?: boolean | null },
>(libraries: T[]): T[] {
  const seen = new Map<string, T>();
  for (const lib of libraries) {
    if (lib.isEngineDataHub) {
      // Engine hubs stay distinct per row.
      seen.set(`hub:${lib.id}`, lib);
      continue;
    }
    const key = `${lib.topicScope || ''}::${lib.name}`;
    if (!seen.has(key)) seen.set(key, lib);
  }
  return [...seen.values()];
}
