import type { GuardrailEvaluation, SessionPhase } from '@hftr/contracts';
import { CATALOG_VERSION } from '../limits/catalog-loader';
import { getGuardrailPackage } from './registry';

export interface GuardrailEvalContext {
  nowMs: number;
  sessionPhase: SessionPhase;
  mode: 'paper' | 'live';
  /** Active guardrail package ids bound to the company/module. */
  activePackageIds: string[];
  spreadAboveCeiling?: boolean;
  quoteFreshnessStale?: boolean;
  macroBlackoutActive?: boolean;
  eventBlackoutActive?: boolean;
  offHoursLiquidityAbsent?: boolean;
}

const CLOSED_PHASES: ReadonlySet<SessionPhase> = new Set(['closed', 'overnight', 'pre_market']);

function evaluatePackage(packageId: string, ctx: GuardrailEvalContext): GuardrailEvaluation | null {
  const pkg = getGuardrailPackage(packageId);
  if (!pkg) return null;

  const ref = {
    packageId: pkg.id,
    catalogVersion: CATALOG_VERSION,
    name: pkg.name,
    class: pkg.class,
  };
  const evaluatedAt = new Date(ctx.nowMs).toISOString();
  const fired: string[] = [];
  const failureCodes: string[] = [];

  switch (pkg.id) {
    case 'grd-001':
      if (ctx.eventBlackoutActive) {
        fired.push('unconfirmed_event_cluster');
        failureCodes.push('EVT_BLACKOUT_ACTIVE');
      }
      break;
    case 'grd-002':
      if (ctx.macroBlackoutActive) {
        fired.push('requires_blackout_macro_trigger');
        failureCodes.push('MACRO_BLACKOUT_ACTIVE');
      }
      break;
    case 'grd-003':
      if (ctx.spreadAboveCeiling) {
        fired.push('spread_above_ceiling');
        failureCodes.push('SPREAD_CEILING_BREACH');
      }
      if (ctx.quoteFreshnessStale) {
        fired.push('quote_freshness_stale');
        failureCodes.push('QUOTE_FRESHNESS_INVALID');
      }
      if (ctx.offHoursLiquidityAbsent) {
        fired.push('off_hours_liquidity_absent');
        failureCodes.push('LIQUIDITY_TOO_THIN');
      }
      break;
    case 'grd-007':
      if (ctx.mode === 'live' && CLOSED_PHASES.has(ctx.sessionPhase)) {
        fired.push('order_type_illegal_for_session');
        failureCodes.push('SESSION_ILLEGAL_ORDER_FORM');
      }
      break;
    default:
      break;
  }

  if (fired.length === 0) {
    return {
      schemaVersion: 1,
      packageRef: ref,
      outcome: 'pass',
      firedTriggers: [],
      failureCodes: [],
      evidence: `guardrail ${pkg.name}: no active triggers for supplied context`,
      evaluatedAt,
    };
  }

  const outcome = failureCodes.some((c) => c.includes('DEFER')) ? 'defer' : 'block';
  return {
    schemaVersion: 1,
    packageRef: ref,
    outcome,
    firedTriggers: fired,
    failureCodes,
    evidence: `guardrail ${pkg.name} fired triggers: ${fired.join(', ')}`,
    evaluatedAt,
  };
}

/** Evaluate active guardrail packages deterministically. Unknown ids are skipped. */
export function evaluateGuardrails(ctx: GuardrailEvalContext): GuardrailEvaluation[] {
  const results: GuardrailEvaluation[] = [];
  for (const packageId of ctx.activePackageIds) {
    const evaluation = evaluatePackage(packageId, ctx);
    if (evaluation) results.push(evaluation);
  }
  return results;
}

export function guardrailsBlock(evaluations: GuardrailEvaluation[]): boolean {
  return evaluations.some((e) => e.outcome === 'block');
}
