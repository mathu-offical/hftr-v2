import { and, desc, eq, gt } from 'drizzle-orm';
import {
  NormalizedViewKind,
  VerifiedNormalizedBundle,
  type NormalizedViewKind as NormalizedViewKindType,
  type VerifiedNormalizedBundle as VerifiedNormalizedBundleT,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { systemNormalizedViews } from '@hftr/db/schema';
import { isSealValid } from './verified-normalize';

const MAX_SEAL_DIGESTS = 24;

/**
 * Trim oversized digest arrays so persisted pre-cap seals still parse (D-101).
 */
export function trimSealBundleForParse(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const bundle = raw as Record<string, unknown>;
  const sourceDigests = Array.isArray(bundle.sourceDigests)
    ? bundle.sourceDigests.slice(0, MAX_SEAL_DIGESTS)
    : bundle.sourceDigests;
  const viewRaw = bundle.view;
  let view = viewRaw;
  if (viewRaw && typeof viewRaw === 'object') {
    const v = viewRaw as Record<string, unknown>;
    view = {
      ...v,
      sourceDigests: Array.isArray(v.sourceDigests)
        ? v.sourceDigests.slice(0, MAX_SEAL_DIGESTS)
        : v.sourceDigests,
    };
  }
  return {
    ...bundle,
    sourceDigests,
    view,
    awarenessLinks: Array.isArray(bundle.awarenessLinks)
      ? bundle.awarenessLinks.slice(0, 128)
      : bundle.awarenessLinks,
  };
}

export function parseVerifiedSealBundle(
  raw: unknown,
): VerifiedNormalizedBundleT | null {
  const parsed = VerifiedNormalizedBundle.safeParse(trimSealBundleForParse(raw));
  return parsed.success ? parsed.data : null;
}

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
): Promise<VerifiedNormalizedBundleT | null> {
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
    const parsed = parseVerifiedSealBundle(row.bundle);
    if (!parsed) continue;
    if (isSealValid(parsed, opts.nowMs)) {
      return parsed;
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
