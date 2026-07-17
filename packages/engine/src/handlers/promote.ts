import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  companies,
  brokerConnections,
  leadPackages,
  modules,
  trendCandidates,
} from '@hftr/db/schema';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import {
  loadCompanyLinkGraph,
  resolveDirectiveTradingTarget,
  resolveInboundLibraryModules,
  resolvePolicyModuleForTrading,
} from '../graph/module-links';
import { DEFAULT_FRESHNESS_WINDOW_MS, evaluateGates, gatesPass } from '../pipeline/gates';
import { resolvePhilosophyControl } from '../pipeline/philosophy-control';
import { enqueue } from '../queue/queue';
import { registerHandler } from './registry';
import { estimateLlmJobCost } from '../queue/llm-cost-estimate';
import { enqueueLinkedResearchCurate } from '../research/enqueue-linked';
import { loadAdmittedArtifactRefs } from '../research/admitted-evidence';

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

  const graph = await loadCompanyLinkGraph(db, payload.companyId);
  const linkedTrading = resolveDirectiveTradingTarget(graph, payload.moduleId);
  const resolvedTargetId = payload.targetModuleId ?? linkedTrading?.id ?? null;
  const dispatchModuleId = resolvedTargetId ?? payload.moduleId;
  const tradingModule =
    companyModules.find((m) => m.id === dispatchModuleId && m.type === 'trading') ??
    (linkedTrading
      ? companyModules.find((m) => m.id === linkedTrading.id)
      : undefined) ??
    companyModules.find((m) => m.type === 'trading');
  const tradingConfig = (tradingModule?.config ?? {}) as { strategyFamilies?: string[] };
  const strategyFamily =
    Array.isArray(tradingConfig.strategyFamilies) && tradingConfig.strategyFamilies[0]
      ? tradingConfig.strategyFamilies[0]
      : null;

  const policyModule = resolvePolicyModuleForTrading(graph, tradingModule?.id ?? null);
  const policyConfig = (policyModule?.config ?? {}) as { policyEnvelopeRef?: string };
  const linkedLibraryMods = resolveInboundLibraryModules(graph, payload.moduleId);

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

  let brokerConnected = false;
  let brokerConnectionMode: 'paper' | 'live' | null = null;
  let venue: 'paper_sim' | 'alpaca' | 'kalshi' | 'polymarket' | 'coinbase' | null = 'paper_sim';
  if (company.brokerConnectionId) {
    const connRows = await db
      .select({
        venue: brokerConnections.venue,
        mode: brokerConnections.mode,
        status: brokerConnections.status,
      })
      .from(brokerConnections)
      .where(eq(brokerConnections.id, company.brokerConnectionId))
      .limit(1);
    const conn = connRows[0];
    if (conn && conn.status === 'connected') {
      brokerConnected = true;
      brokerConnectionMode = conn.mode;
      venue = conn.venue;
    }
  }

  const { refs: admittedArtifactRefs, libraryConceptCount } = await loadAdmittedArtifactRefs(
    db,
    payload.companyId,
    linkedLibraryMods.length > 0
      ? { libraryModuleIds: linkedLibraryMods.map((m) => m.id) }
      : undefined,
  );
  // D-039: when any library concepts exist, evidence_fit consults admitted refs
  // (not freshness alone). Cold companies with empty libraries keep freshness-only.
  const evidenceFitRefs = libraryConceptCount > 0 ? admittedArtifactRefs : undefined;

  if (admittedArtifactRefs.length > 0) {
    await db
      .update(trendCandidates)
      .set({ artifactRefs: admittedArtifactRefs })
      .where(eq(trendCandidates.id, trend.id));
  }

  const gates = evaluateGates({
    symbol: trend.symbol,
    direction: trend.direction,
    scannedAtMs: trend.scannedAt.getTime(),
    nowMs: clock.nowMs(),
    sessionPhase: sessionPhase(session, clock.nowMs()),
    mode: company.mode,
    instruments: Array.isArray(moduleConfig.instruments) ? moduleConfig.instruments : null,
    freshnessWindowMs,
    venue,
    brokerConnected,
    brokerConnectionMode,
    feedClass: venue === 'paper_sim' ? 'synthetic_sim' : brokerConnected ? 'broker_state' : null,
    ...(evidenceFitRefs !== undefined ? { admittedArtifactRefs: evidenceFitRefs } : {}),
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
    artifactRefs: admittedArtifactRefs,
  };

  const leadRows = await db
    .insert(leadPackages)
    .values({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      targetModuleId: resolvedTargetId,
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

  await enqueueLinkedResearchCurate(db, clock, {
    companyId: payload.companyId,
    sourceModuleId: payload.moduleId,
    queryText: trend.symbol,
    topicScope: trend.symbol,
  });

  await enqueue(db, clock, {
    queueClass: 'TACTICAL',
    kind: 'tactical.expand',
    costEstimate: estimateLlmJobCost('tactical.expand'),
    payload: {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      leadId,
      trendId: trend.id,
      ...(resolvedTargetId ? { targetModuleId: resolvedTargetId } : {}),
      controlSnapshot,
    },
    idempotencyKey: `tactical-expand-${leadId}`,
    priority: 'HIGH',
    companyId: payload.companyId,
    moduleId: payload.moduleId,
  });
});
