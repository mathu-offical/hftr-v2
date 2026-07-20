/**
 * D-234 / D-235: CompanyPostureOrientation producer + persistence.
 * Qualitative bands/symbols/refs only — no raw financial digits (D-008).
 */

import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, like } from 'drizzle-orm';
import {
  CompanyPostureOrientation,
  SystemTopicScope,
  type CompanyPostureOrientation as CompanyPostureOrientationT,
  type OrientationLeverDelta,
  type PostureRegimeClass,
  type VerifiedNormalizedBundle,
} from '@hftr/contracts';
import type { LeverState } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { concepts, libraryConcepts } from '@hftr/db/schema';
import { ensureSystemLibrary } from '../libraries/ensure-system-library';
import { enforceAllLayers } from '../pipeline/levers';

const ORIENTATION_TITLE = 'company_posture_orientation';
const SOURCE_REF_PREFIX = 'posture-orientation:';
const ORIENTATION_TTL_MS = 6 * 60 * 60 * 1000;

const RISK_OFF_TITLE_PATTERNS = [
  /risk[\s-]?off/i,
  /defensive/i,
  /flight to quality/i,
  /haven/i,
  /drawdown/i,
  /selloff/i,
  /sell[\s-]?off/i,
];

export type BuildOrientationSealInput = {
  movers: VerifiedNormalizedBundle | null;
  sector: VerifiedNormalizedBundle | null;
  daily: VerifiedNormalizedBundle | null;
};

export type BuildOrientationInput = {
  companyId: string;
  analyzeRunId: string | null;
  seals: BuildOrientationSealInput;
  sealSubjectKeys: {
    movers: string;
    sector: string;
    daily: string;
  };
  heldSymbols?: string[];
  compoundRankSymbols?: string[];
  capturedAtMs: number;
};

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortKeysDeep(record[key]);
  }
  return sorted;
}

function canonicalOrientationJson(withoutHash: Omit<CompanyPostureOrientationT, 'contentHash'>): string {
  return JSON.stringify(sortKeysDeep(withoutHash));
}

export function orientationContentHash(
  withoutHash: Omit<CompanyPostureOrientationT, 'contentHash'>,
): string {
  return createHash('sha256')
    .update(canonicalOrientationJson(withoutHash), 'utf8')
    .digest('hex');
}

function uniqUpper(symbols: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const s = raw.trim().toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function sectorTitleImpliesRiskOff(title: string | null | undefined): boolean {
  if (!title) return false;
  return RISK_OFF_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function resolveRegimeClass(input: BuildOrientationInput): PostureRegimeClass {
  const moversBand = input.seals.movers?.corroborationBand ?? null;
  if (moversBand === 'low') {
    return 'neutral';
  }
  if (sectorTitleImpliesRiskOff(input.seals.sector?.view.title)) {
    return 'risk_off';
  }
  return 'neutral';
}

function buildSealRefs(input: BuildOrientationInput): CompanyPostureOrientationT['sealRefs'] {
  const refs: CompanyPostureOrientationT['sealRefs'] = [];
  const pairs: Array<{
    seal: VerifiedNormalizedBundle | null;
    kind: string;
    subjectKey: string;
  }> = [
    { seal: input.seals.movers, kind: 'movers_board', subjectKey: input.sealSubjectKeys.movers },
    { seal: input.seals.sector, kind: 'sector_bulletin', subjectKey: input.sealSubjectKeys.sector },
    {
      seal: input.seals.daily,
      kind: 'daily_summary_phase',
      subjectKey: input.sealSubjectKeys.daily,
    },
  ];
  for (const { seal, kind, subjectKey } of pairs) {
    if (!seal) continue;
    refs.push({
      sealId: seal.sealId,
      kind,
      subjectKey,
      expiresAt: seal.expiresAt,
    });
  }
  return refs;
}

function buildSymbolFocus(input: BuildOrientationInput): string[] {
  const held = uniqUpper(input.heldSymbols ?? []);
  const movers =
    input.seals.movers?.view.items
      ?.map((it) => it.symbolOrSector)
      .filter((s): s is string => typeof s === 'string' && s.length > 0) ?? [];
  const compound = uniqUpper(input.compoundRankSymbols ?? []);
  const moverSet = new Set(uniqUpper(movers));
  const heldOnTape = held.filter((s) => moverSet.has(s));
  if (heldOnTape.length > 0) {
    return heldOnTape.slice(0, 64);
  }
  if (compound.length > 0) {
    return compound.slice(0, 64);
  }
  return [];
}

/** Deterministic qualitative orientation from sealed posture inputs (D-234). */
export function buildCompanyPostureOrientation(
  input: BuildOrientationInput,
): CompanyPostureOrientationT {
  const orientationId = randomUUID();
  const capturedAt = new Date(input.capturedAtMs).toISOString();
  const expiresAt = new Date(input.capturedAtMs + ORIENTATION_TTL_MS).toISOString();

  const withoutHash: Omit<CompanyPostureOrientationT, 'contentHash'> = {
    schemaVersion: 1,
    companyId: input.companyId,
    orientationId,
    analyzeRunId: input.analyzeRunId,
    sealRefs: buildSealRefs(input),
    regimeClass: resolveRegimeClass(input),
    familyNominationBias: [],
    symbolFocus: buildSymbolFocus(input),
    orientationLeverDeltas: [],
    freshnessState: 'fresh',
    capturedAt,
    expiresAt,
  };

  const contentHash = orientationContentHash(withoutHash);
  return CompanyPostureOrientation.parse({ ...withoutHash, contentHash });
}

export function parseOrientationConceptBody(body: string): CompanyPostureOrientationT | null {
  try {
    const raw = JSON.parse(body) as unknown;
    const parsed = CompanyPostureOrientation.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function orientationFreshAt(
  orientation: CompanyPostureOrientationT,
  nowMs: number,
): boolean {
  if (orientation.freshnessState !== 'fresh') return false;
  if (!orientation.expiresAt) return false;
  return new Date(orientation.expiresAt).getTime() > nowMs;
}

/**
 * Load latest persisted orientation for a company.
 * Marks stale when expired; returns null when missing or unparsable.
 */
export async function loadLatestOrientation(
  db: Db,
  companyId: string,
  nowMs: number,
): Promise<CompanyPostureOrientationT | null> {
  const [row] = await db
    .select({ body: concepts.body, sourceRef: concepts.sourceRef })
    .from(concepts)
    .where(
      and(
        eq(concepts.companyId, companyId),
        eq(concepts.title, ORIENTATION_TITLE),
        eq(concepts.status, 'active'),
        like(concepts.sourceRef, `${SOURCE_REF_PREFIX}%`),
      ),
    )
    .orderBy(desc(concepts.updatedAt))
    .limit(1);

  if (!row) return null;
  const parsed = parseOrientationConceptBody(row.body);
  if (!parsed) return null;

  if (!orientationFreshAt(parsed, nowMs)) {
    return { ...parsed, freshnessState: 'stale' };
  }
  return parsed;
}

export type PersistOrientationOpts = {
  db: Db;
  companyId: string;
  ownerModuleId: string;
  orientation: CompanyPostureOrientationT;
  now: Date;
};

/** Persist orientation JSON as a library concept in system:daily_summaries (D-234). */
export async function persistOrientation(opts: PersistOrientationOpts): Promise<string | null> {
  const libraryId = await ensureSystemLibrary(
    opts.db,
    opts.companyId,
    SystemTopicScope.DAILY_SUMMARIES,
    opts.now,
    { refreshPlaceholders: false },
  );

  const sourceRef = `${SOURCE_REF_PREFIX}${opts.orientation.orientationId}`;
  const body = JSON.stringify(opts.orientation);

  const [existing] = await opts.db
    .select({ id: concepts.id })
    .from(concepts)
    .where(
      and(
        eq(concepts.companyId, opts.companyId),
        eq(concepts.title, ORIENTATION_TITLE),
        eq(concepts.status, 'active'),
      ),
    )
    .orderBy(desc(concepts.updatedAt))
    .limit(1);

  let conceptId: string | null = null;
  if (existing) {
    await opts.db
      .update(concepts)
      .set({
        body,
        tags: ['posture', 'orientation', 'synthesis'],
        sourceRef,
        sourceClass: 'deterministic_placeholder',
        primaryLibraryId: libraryId,
        updatedAt: opts.now,
      })
      .where(eq(concepts.id, existing.id));
    conceptId = existing.id;
  } else {
    const inserted = await opts.db
      .insert(concepts)
      .values({
        companyId: opts.companyId,
        moduleId: opts.ownerModuleId,
        title: ORIENTATION_TITLE,
        body,
        tags: ['posture', 'orientation', 'synthesis'],
        sourceRef,
        sourceClass: 'deterministic_placeholder',
        primaryLibraryId: libraryId,
        updatedAt: opts.now,
      })
      .returning({ id: concepts.id });
    conceptId = inserted[0]?.id ?? null;
  }

  if (!conceptId) return null;

  await opts.db
    .insert(libraryConcepts)
    .values({
      libraryId,
      conceptId,
      curationStatus: 'auto_admitted',
    })
    .onConflictDoNothing();

  return conceptId;
}

function leverDeltaToSetting(delta: OrientationLeverDelta): LeverState[string] {
  return {
    mode: 'band',
    bandId: delta.bandId,
    position: delta.toPosition,
  };
}

/**
 * Merge fresh orientation lever deltas into a philosophy lever state (D-235).
 * Fail-closed via enforceAllLayers; returns base state when deltas empty.
 */
export function mergeOrientationLeverDeltas(
  baseLeverState: LeverState,
  deltas: OrientationLeverDelta[],
): LeverState {
  if (deltas.length === 0) return baseLeverState;
  const merged: LeverState = { ...baseLeverState };
  for (const delta of deltas) {
    merged[delta.bandId] = leverDeltaToSetting(delta);
  }
  return enforceAllLayers(merged);
}
