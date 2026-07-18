import {
  SYSTEM_DOC_SHAPE_SPECS,
  type DocumentCurationScore,
  type QualitativeBand,
  type SystemDocKind,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { curationScoreEvents } from '@hftr/db/schema';
import { countDocumentWikilinks, validateDocumentShape } from './document-shape';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Kind-specific freshness TTL for librarian scoring (qualitative bands only). */
export const SYSTEM_DOC_KIND_TTL_MS: Record<SystemDocKind, number> = {
  movers_lens: MS_PER_DAY,
  movers_report: MS_PER_DAY,
  sector_bulletin: MS_PER_DAY,
  daily_summary: MS_PER_DAY,
  execution_log: MS_PER_DAY,
  trend_list: MS_PER_DAY,
  runtime_policy: 7 * MS_PER_DAY,
};

export interface ScoreDocumentCurationInput {
  kind: SystemDocKind;
  body: string;
  tags: readonly string[];
  sourceRef: string;
  updatedAt?: Date | string | null;
  nowMs: number;
}

function minBand(...bands: QualitativeBand[]): QualitativeBand {
  if (bands.includes('low')) return 'low';
  if (bands.includes('medium')) return 'medium';
  return 'high';
}

function linkBandFromCount(count: number, requireWikilink: boolean): QualitativeBand {
  if (count >= 2) return 'high';
  if (count === 1) return 'medium';
  return requireWikilink ? 'low' : 'medium';
}

function freshnessBandFromAge(ageMs: number, ttlMs: number): QualitativeBand {
  if (ageMs <= ttlMs * 0.5) return 'high';
  if (ageMs <= ttlMs) return 'medium';
  return 'low';
}

function structureBandFromShape(ok: boolean): QualitativeBand {
  return ok ? 'high' : 'low';
}

/**
 * Qualitative librarian score for system-curated documents (D-069, D-071).
 * overallBand is the minimum component band (low wins).
 */
export function scoreDocumentCuration(input: ScoreDocumentCurationInput): DocumentCurationScore {
  const shape = validateDocumentShape({
    kind: input.kind,
    body: input.body,
    tags: input.tags,
    sourceRef: input.sourceRef,
  });

  const spec = SYSTEM_DOC_SHAPE_SPECS[input.kind];
  const wikilinkCount = countDocumentWikilinks(input.body);

  const structureBand = structureBandFromShape(shape.ok);
  const linkBand = linkBandFromCount(wikilinkCount, spec.requireWikilink);

  const updatedMs = input.updatedAt
    ? typeof input.updatedAt === 'string'
      ? Date.parse(input.updatedAt)
      : input.updatedAt.getTime()
    : input.nowMs;
  const ageMs = Math.max(0, input.nowMs - (Number.isFinite(updatedMs) ? updatedMs : input.nowMs));
  const ttlMs = SYSTEM_DOC_KIND_TTL_MS[input.kind];
  const freshnessBand = freshnessBandFromAge(ageMs, ttlMs);

  const overallBand = minBand(structureBand, linkBand, freshnessBand);

  return {
    structureBand,
    linkBand,
    freshnessBand,
    overallBand,
    repairHints: shape.repairHints,
  };
}

export interface RecordCurationScoreEventInput {
  db: Db;
  companyId: string;
  conceptId?: string | null;
  gateId: string;
  scoreBand: QualitativeBand;
  passed: boolean;
  reason: string;
  rawMeta?: Record<string, unknown>;
  now?: Date;
}

/**
 * Append-only telemetry for curation prior bands. No-ops when the table is absent
 * (pre-migration environments).
 */
export async function recordCurationScoreEvent(
  input: RecordCurationScoreEventInput,
): Promise<void> {
  try {
    await input.db.insert(curationScoreEvents).values({
      companyId: input.companyId,
      conceptId: input.conceptId ?? null,
      gateId: input.gateId,
      scoreBand: input.scoreBand,
      passed: input.passed,
      reason: input.reason.slice(0, 300),
      rawMeta: input.rawMeta ?? {},
      createdAt: input.now ?? new Date(),
    });
  } catch {
    // Table may not exist before migration 0033 — internal telemetry only.
  }
}
