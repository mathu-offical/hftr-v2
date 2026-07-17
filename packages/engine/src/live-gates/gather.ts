import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  actionTraces,
  brokerConnections,
  companies,
  liveGateEvidence,
  modules,
  verificationRecords,
} from '@hftr/db/schema';
import type { LiveGateChecklistInput } from './checklist';

export interface GatherLiveGateInputOptions {
  companyId: string;
  nowMs: number;
}

/** Collect checklist inputs from DB projections. Missing data fails closed in checklist. */
export async function gatherLiveGateChecklistInput(
  db: Db,
  opts: GatherLiveGateInputOptions,
): Promise<LiveGateChecklistInput> {
  const companyRows = await db
    .select({
      id: companies.id,
      createdAt: companies.createdAt,
      brokerConnectionId: companies.brokerConnectionId,
      liveArmedAt: companies.liveArmedAt,
      liveGateEvidenceId: companies.liveGateEvidenceId,
    })
    .from(companies)
    .where(eq(companies.id, opts.companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) {
    return { companyId: opts.companyId, nowMs: opts.nowMs };
  }

  let brokerConnectionVerified: boolean | undefined;
  let brokerEntitlementsValid: boolean | undefined;
  if (company.brokerConnectionId) {
    const connRows = await db
      .select({
        status: brokerConnections.status,
        capabilities: brokerConnections.capabilities,
      })
      .from(brokerConnections)
      .where(eq(brokerConnections.id, company.brokerConnectionId))
      .limit(1);
    const conn = connRows[0];
    if (conn) {
      brokerConnectionVerified = conn.status === 'connected';
      brokerEntitlementsValid =
        conn.status === 'connected' &&
        conn.capabilities !== null &&
        typeof conn.capabilities === 'object';
    } else {
      brokerConnectionVerified = false;
      brokerEntitlementsValid = false;
    }
  }

  const firstTrace = await db
    .select({ createdAt: actionTraces.createdAt })
    .from(actionTraces)
    .where(and(eq(actionTraces.companyId, opts.companyId), eq(actionTraces.mode, 'paper')))
    .orderBy(actionTraces.createdAt)
    .limit(1);
  const paperStart = firstTrace[0]?.createdAt ?? company.createdAt;
  const paperTradingDays = Math.max(
    0,
    Math.floor((opts.nowMs - paperStart.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const verificationRows = await db
    .select({
      result: verificationRecords.result,
    })
    .from(verificationRecords)
    .innerJoin(actionTraces, eq(verificationRecords.traceId, actionTraces.id))
    .where(eq(actionTraces.companyId, opts.companyId))
    .limit(500);
  let verificationPassRate: number | undefined;
  if (verificationRows.length > 0) {
    const pass = verificationRows.filter((r) => r.result === 'pass').length;
    verificationPassRate = pass / verificationRows.length;
  }

  const tradingModules = await db
    .select({ config: modules.config })
    .from(modules)
    .where(and(eq(modules.companyId, opts.companyId), eq(modules.type, 'trading')));
  const guardrailIds = new Set<string>();
  for (const row of tradingModules) {
    const cfg = row.config as Record<string, unknown> | null;
    const ids = cfg?.guardrailPackageIds;
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === 'string' && id.length > 0) guardrailIds.add(id);
      }
    }
  }
  const activeGuardrailPackageIds =
    guardrailIds.size > 0 ? [...guardrailIds] : listGuardrailPackageIdsFallback();

  let evidenceAsOfMs: number | undefined;
  if (company.liveGateEvidenceId) {
    const evRows = await db
      .select({ createdAt: liveGateEvidence.createdAt })
      .from(liveGateEvidence)
      .where(eq(liveGateEvidence.id, company.liveGateEvidenceId))
      .limit(1);
    evidenceAsOfMs = evRows[0]?.createdAt.getTime();
  } else {
    const latest = await db
      .select({ createdAt: liveGateEvidence.createdAt })
      .from(liveGateEvidence)
      .where(eq(liveGateEvidence.companyId, opts.companyId))
      .orderBy(desc(liveGateEvidence.createdAt))
      .limit(1);
    evidenceAsOfMs = latest[0]?.createdAt.getTime();
  }

  const result: LiveGateChecklistInput = {
    companyId: opts.companyId,
    nowMs: opts.nowMs,
    paperTradingDays,
    activeGuardrailPackageIds,
    liveArmedAtMs: company.liveArmedAt?.getTime() ?? null,
  };
  if (brokerConnectionVerified !== undefined) {
    result.brokerConnectionVerified = brokerConnectionVerified;
  }
  if (brokerEntitlementsValid !== undefined) {
    result.brokerEntitlementsValid = brokerEntitlementsValid;
  }
  if (verificationPassRate !== undefined) {
    result.verificationPassRate = verificationPassRate;
  }
  if (evidenceAsOfMs !== undefined) {
    result.evidenceAsOfMs = evidenceAsOfMs;
  }
  return result;
}

/** When modules lack explicit guardrail bindings, assume seeded baseline packages. */
function listGuardrailPackageIdsFallback(): string[] {
  return ['grd-001', 'grd-003'];
}

/** Count action traces older than retention window (audit-only until archive table ships). */
export async function countTracesOlderThan(
  db: Db,
  retentionMs: number,
  nowMs: number,
): Promise<number> {
  const cutoff = new Date(nowMs - retentionMs);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionTraces)
    .where(lt(actionTraces.createdAt, cutoff));
  return row?.count ?? 0;
}
