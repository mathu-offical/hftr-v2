import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { companies, leadPackages, moduleLinks, modules, trendCandidates } from '@hftr/db/schema';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { DEFAULT_FRESHNESS_WINDOW_MS, evaluateGates, gatesPass } from '../pipeline/gates';
import { resolvePhilosophyControl } from '../pipeline/philosophy-control';
import { enqueue } from '../queue/queue';
import { registerHandler } from './registry';

const PromotePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  trendId: z.string().uuid(),
  targetModuleId: z.string().uuid().optional(),
});

const STRICT_FRESHNESS_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Lead promotion admission (RESEARCH queue): trend candidate → six-gate admission
 * (lead_packages) → enqueue TACTICAL `tactical.expand` when admitted.
 * Tree/compile/dispatch stages run on TACTICAL/COMPILE/DISPATCH queues.
 */
registerHandler('trend.promote', async ({ db, clock, job }) => {
  const payload = PromotePayload.parse(job.payload);

  const trend = (
    await db
      .select()
      .from(trendCandidates)
      .where(
        and(
          eq(trendCandidates.id, payload.trendId),
          eq(trendCandidates.companyId, payload.companyId),
        ),
      )
      .limit(1)
  )[0];
  if (!trend) return;

  const company = (
    await db.select().from(companies).where(eq(companies.id, payload.companyId)).limit(1)
  )[0];
  const trendModule = (
    await db.select().from(modules).where(eq(modules.id, payload.moduleId)).limit(1)
  )[0];
  if (!company || !trendModule) return;

  const moduleConfig = (trendModule.config ?? {}) as { instruments?: string[] };
  const companyModules = await db
    .select()
    .from(modules)
    .where(eq(modules.companyId, payload.companyId));
  const dispatchModuleId = payload.targetModuleId ?? payload.moduleId;
  const tradingModule =
    companyModules.find((m) => m.id === dispatchModuleId && m.type === 'trading') ??
    companyModules.find((m) => m.type === 'trading');
  const tradingConfig = (tradingModule?.config ?? {}) as { strategyFamilies?: string[] };
  const strategyFamily =
    Array.isArray(tradingConfig.strategyFamilies) && tradingConfig.strategyFamilies[0]
      ? tradingConfig.strategyFamilies[0]
      : null;

  const policyLinks = await db
    .select()
    .from(moduleLinks)
    .where(
      and(eq(moduleLinks.companyId, payload.companyId), eq(moduleLinks.linkKind, 'verification')),
    );
  const policyModuleIds = new Set(policyLinks.flatMap((l) => [l.fromModuleId, l.toModuleId]));
  const policyModule = companyModules.find((m) => m.type === 'policy' && policyModuleIds.has(m.id));
  const policyConfig = (policyModule?.config ?? {}) as { policyEnvelopeRef?: string };

  const control = resolvePhilosophyControl({
    philosophyProfile: company.philosophyProfile,
    policyEnvelopeRef: policyConfig.policyEnvelopeRef ?? null,
    strategyFamily,
  });

  const session = await getSession(db, 'XNYS', venueDate(clock.nowMs(), 'America/New_York'));
  const freshnessWindowMs =
    control.freshnessWindow === 'strict_12h'
      ? STRICT_FRESHNESS_WINDOW_MS
      : DEFAULT_FRESHNESS_WINDOW_MS;
  const gates = evaluateGates({
    symbol: trend.symbol,
    direction: trend.direction,
    scannedAtMs: trend.scannedAt.getTime(),
    nowMs: clock.nowMs(),
    sessionPhase: sessionPhase(session, clock.nowMs()),
    mode: company.mode,
    instruments: Array.isArray(moduleConfig.instruments) ? moduleConfig.instruments : null,
    freshnessWindowMs,
  });
  const admitted = gatesPass(gates);

  const controlSnapshot = {
    policyEnvelopeVersion: control.policyEnvelopeVersion,
    sizingBasis: control.sizingBasis,
    sizingBasisBps: control.sizingBasisBps,
    freshnessWindow: control.freshnessWindow,
    philosophyAxes: control.philosophyProfile.axes,
    leverState: control.leverState,
    strategyFamily: control.strategyFamily,
    philosophyPromptPresent: company.philosophyPrompt.length > 0,
    sourceClass: control.sourceClass,
  };

  const leadRows = await db
    .insert(leadPackages)
    .values({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      targetModuleId: payload.targetModuleId ?? null,
      trendId: trend.id,
      symbol: trend.symbol,
      direction: trend.direction,
      strategyFamily: control.strategyFamily,
      status: admitted ? 'admitted' : 'rejected',
      gates,
      controlSnapshot,
    })
    .returning({ id: leadPackages.id });
  const leadId = leadRows[0]!.id;
  if (!admitted) return;

  await enqueue(db, clock, {
    queueClass: 'TACTICAL',
    kind: 'tactical.expand',
    payload: {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      leadId,
      trendId: trend.id,
      ...(payload.targetModuleId !== undefined ? { targetModuleId: payload.targetModuleId } : {}),
      controlSnapshot,
    },
    idempotencyKey: `tactical-expand-${leadId}`,
    priority: 'HIGH',
    companyId: payload.companyId,
    moduleId: payload.moduleId,
  });
});
