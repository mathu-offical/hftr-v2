import type {
  DeterministicActionTask,
  GuardrailEvaluation,
  LimitDomain,
  LimitsSnapshot,
  SessionPhase,
} from '@hftr/contracts';

/**
 * Shared pre-dispatch gauntlet (paper_sim and venue adapters).
 * Model-free: session legality, quantity ceilings, and basic policy checks.
 * Dynamic operating limits (limits-engine) plug in as they ship.
 */

export interface PreDispatchContext {
  mode: 'paper' | 'live';
  sessionPhase: SessionPhase;
  /** Effective capital admission cap in cents (min virtual, broker BP). */
  effectiveCapCents: bigint;
  priceCents: number;
  /** When true, live path is not armed — always block live mode. */
  liveGateBlocked: boolean;
  maxQuantity?: number;
  /** Freshly computed operating limits snapshot; when set, overallPass must be true. */
  limitsSnapshot?: LimitsSnapshot;
  /** Guardrail package evaluations; any `block` outcome fails the gauntlet. */
  guardrailEvaluations?: GuardrailEvaluation[];
}

export interface PreDispatchResult {
  ok: boolean;
  failureCode: string | null;
  detail: string;
}

const DEFAULT_MAX_QUANTITY = 100_000;

function limitDomainFailureCode(domain: LimitDomain): string {
  switch (domain) {
    case 'buying_power':
      return 'capital_limit_block';
    case 'session_legality':
      return 'session_legality_block';
    case 'daily_loss_remaining':
    case 'order_frequency':
      return 'limits_block';
    default: {
      const _exhaustive: never = domain;
      return _exhaustive;
    }
  }
}

function firstBlockingLimit(snapshot: LimitsSnapshot): { failureCode: string; detail: string } {
  const blocking = snapshot.limits.find((l) => l.status === 'block');
  if (!blocking) {
    return {
      failureCode: 'limits_block',
      detail: 'operating limits overallPass false without a blocking domain',
    };
  }
  return {
    failureCode: limitDomainFailureCode(blocking.domain),
    detail: blocking.evidence,
  };
}

function quantityUnits(task: DeterministicActionTask): number {
  const raw = Number(task.quantityInt);
  if (!Number.isFinite(raw)) return NaN;
  const scale = task.quantityScale;
  if (!Number.isInteger(scale) || scale < 0) return NaN;
  return raw / 10 ** scale;
}

export function preDispatchGauntlet(
  task: DeterministicActionTask,
  ctx: PreDispatchContext,
): PreDispatchResult {
  if (ctx.mode === 'live' && ctx.liveGateBlocked) {
    return {
      ok: false,
      failureCode: 'live_gate_blocked',
      detail: 'live trading remains fail-closed until gate evidence and arming pass',
    };
  }

  const openPhases: ReadonlySet<SessionPhase> = new Set(['open', 'midday', 'power_hour']);
  if (ctx.mode === 'live' && !openPhases.has(ctx.sessionPhase)) {
    return {
      ok: false,
      failureCode: 'session_legality_block',
      detail: `session phase ${ctx.sessionPhase} is not open for live dispatch`,
    };
  }

  const qty = quantityUnits(task);
  const maxQty = ctx.maxQuantity ?? DEFAULT_MAX_QUANTITY;
  if (!Number.isInteger(qty) || qty <= 0 || qty > maxQty) {
    return {
      ok: false,
      failureCode: 'capital_limit_block',
      detail: `quantity ${task.quantityInt} (scale ${task.quantityScale}) outside hard envelope 1..${maxQty}`,
    };
  }

  if (!Number.isInteger(ctx.priceCents) || ctx.priceCents <= 0) {
    return {
      ok: false,
      failureCode: 'stale_input',
      detail: 'quote price missing or non-positive',
    };
  }

  const notional = BigInt(qty) * BigInt(ctx.priceCents);
  if (task.actionVerb === 'buy' && notional > ctx.effectiveCapCents) {
    return {
      ok: false,
      failureCode: 'capital_limit_block',
      detail: 'order notional exceeds effective capital admission cap',
    };
  }

  if (ctx.limitsSnapshot !== undefined && !ctx.limitsSnapshot.overallPass) {
    const blocked = firstBlockingLimit(ctx.limitsSnapshot);
    return { ok: false, failureCode: blocked.failureCode, detail: blocked.detail };
  }

  if (ctx.guardrailEvaluations !== undefined) {
    const blocker = ctx.guardrailEvaluations.find((evaluation) => evaluation.outcome === 'block');
    if (blocker) {
      return {
        ok: false,
        failureCode: 'guardrail_block',
        detail: blocker.evidence,
      };
    }
  }

  return { ok: true, failureCode: null, detail: 'pre_dispatch_pass' };
}
