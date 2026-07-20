import { and, eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { modules, researchTopics } from '@hftr/db/schema';
import {
  isEngineDataHubConfig,
  LibraryModuleConfig,
  type AnalyzerHubFeedClass,
} from '@hftr/contracts';

export type IngestHubTopicCandidateInput = {
  companyId: string;
  hubModuleId: string;
  title: string;
  provenance?: string;
  feedClass?: AnalyzerHubFeedClass;
  /** When false, skip even if hub topicFeed.enabled (caller override). */
  force?: boolean;
};

export type IngestHubTopicCandidateResult = {
  skipped: boolean;
  reason?: 'not_hub' | 'feed_disabled' | 'empty_title' | 'direct_no_topic';
  topicId: string | null;
  created: boolean;
};

/**
 * D-216: treat the Engine Data Hub topic list as a live feed.
 * Qualifying analyzed ingest creates/refreshes an active research_topics row on the hub module.
 * Direct feeds default to write-through only (no topic) unless force=true.
 */
export async function ingestHubTopicCandidate(
  db: Db,
  input: IngestHubTopicCandidateInput,
  now = new Date(),
): Promise<IngestHubTopicCandidateResult> {
  const title = input.title.trim().slice(0, 200);
  if (!title) {
    return { skipped: true, reason: 'empty_title', topicId: null, created: false };
  }

  const [hub] = await db
    .select({ id: modules.id, config: modules.config, companyId: modules.companyId })
    .from(modules)
    .where(
      and(
        eq(modules.id, input.hubModuleId),
        eq(modules.companyId, input.companyId),
        eq(modules.type, 'library'),
      ),
    )
    .limit(1);
  if (!hub || !isEngineDataHubConfig((hub.config ?? {}) as Record<string, unknown>)) {
    return { skipped: true, reason: 'not_hub', topicId: null, created: false };
  }

  const parsed = LibraryModuleConfig.safeParse(hub.config ?? {});
  const topicFeedEnabled = parsed.success
    ? (parsed.data.topicFeed?.enabled ?? true)
    : true;
  if (!topicFeedEnabled && !input.force) {
    return { skipped: true, reason: 'feed_disabled', topicId: null, created: false };
  }

  // Direct path is write-through to shelves by default — not a topic candidate.
  if (input.feedClass === 'direct' && !input.force) {
    return { skipped: true, reason: 'direct_no_topic', topicId: null, created: false };
  }

  const [existing] = await db
    .select({ id: researchTopics.id })
    .from(researchTopics)
    .where(
      and(
        eq(researchTopics.companyId, input.companyId),
        eq(researchTopics.moduleId, input.hubModuleId),
        eq(researchTopics.title, title),
        eq(researchTopics.status, 'active'),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(researchTopics)
      .set({
        provenance: input.provenance?.slice(0, 200) ?? 'hub_live_feed',
        lastQueriedAt: now,
        updatedAt: now,
      })
      .where(eq(researchTopics.id, existing.id));
    return { skipped: false, topicId: existing.id, created: false };
  }

  const [created] = await db
    .insert(researchTopics)
    .values({
      companyId: input.companyId,
      moduleId: input.hubModuleId,
      title,
      status: 'active',
      confidenceBand: 'medium',
      priority: 'normal',
      provenance: input.provenance?.slice(0, 200) ?? 'hub_live_feed',
      synopsisMd: '',
      lastQueriedAt: now,
    })
    .returning({ id: researchTopics.id });

  return {
    skipped: false,
    topicId: created?.id ?? null,
    created: Boolean(created),
  };
}
