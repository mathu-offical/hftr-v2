import { and, desc, eq, gt } from 'drizzle-orm';
import {
  NormalizedViewKind,
  VerifiedNormalizedBundle,
  type NormalizedViewKind as NormalizedViewKindType,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { systemNormalizedViews } from '@hftr/db/schema';
import { isSealValid } from './verified-normalize';

/**
 * Load the latest unexpired seal for (company, kind, subjectKey).
 * Consumers skip re-verification when this returns a valid bundle (D-072).
 */
export async function loadLatestValidSeal(
  db: Db,
  opts: {
    companyId: string;
    kind: NormalizedViewKindType;
    subjectKey: string;
    nowMs: number;
  },
): Promise<VerifiedNormalizedBundle | null> {
  const now = new Date(opts.nowMs);
  const rows = await db
    .select({
      bundle: systemNormalizedViews.bundle,
      expiresAt: systemNormalizedViews.expiresAt,
    })
    .from(systemNormalizedViews)
    .where(
      and(
        eq(systemNormalizedViews.companyId, opts.companyId),
        eq(systemNormalizedViews.kind, opts.kind),
        eq(systemNormalizedViews.subjectKey, opts.subjectKey),
        gt(systemNormalizedViews.expiresAt, now),
      ),
    )
    .orderBy(desc(systemNormalizedViews.expiresAt))
    .limit(5);

  for (const row of rows) {
    const parsed = VerifiedNormalizedBundle.safeParse(row.bundle);
    if (!parsed.success) continue;
    if (isSealValid(parsed.data, opts.nowMs)) {
      return parsed.data;
    }
  }
  return null;
}

export type SealSummary = { sealId: string; kind: string; title: string };

const DEFAULT_SEAL_LOOKUPS: Array<{
  kind: NormalizedViewKindType;
  subjectKey: string;
}> = [
  { kind: 'movers_board', subjectKey: 'daily' },
  { kind: 'sector_bulletin', subjectKey: 'sector_daily' },
  { kind: 'daily_summary_phase', subjectKey: 'phase_pre_open' },
  { kind: 'daily_summary_phase', subjectKey: 'phase_midday' },
  { kind: 'daily_summary_phase', subjectKey: 'phase_close' },
  { kind: 'daily_summary_phase', subjectKey: 'phase_post_analysis' },
];

/**
 * Load recent valid seals for synthesize grounding (D-070 / D-072).
 * Models may cite seal:{sealId}; they must not re-verify sealed digests.
 */
export async function loadSealSummariesForSynthesize(
  db: Db,
  opts: {
    companyId: string;
    nowMs: number;
    /** Extra sector_bulletin subject keys (e.g. per-sector slugs). */
    extraSubjectKeys?: Array<{ kind: NormalizedViewKindType; subjectKey: string }>;
    limit?: number;
  },
): Promise<SealSummary[]> {
  const lookups = [...DEFAULT_SEAL_LOOKUPS, ...(opts.extraSubjectKeys ?? [])];
  const seen = new Set<string>();
  const out: SealSummary[] = [];
  const limit = opts.limit ?? 8;

  for (const lookup of lookups) {
    if (out.length >= limit) break;
    const kindParsed = NormalizedViewKind.safeParse(lookup.kind);
    if (!kindParsed.success) continue;
    const seal = await loadLatestValidSeal(db, {
      companyId: opts.companyId,
      kind: kindParsed.data,
      subjectKey: lookup.subjectKey,
      nowMs: opts.nowMs,
    });
    if (!seal) continue;
    if (seen.has(seal.sealId)) continue;
    seen.add(seal.sealId);
    out.push({
      sealId: seal.sealId,
      kind: seal.view.kind,
      title: seal.view.title.slice(0, 300),
    });
  }

  return out;
}
