import { LimitsSnapshot, type OperatingLimitResult, type SessionPhase } from '@hftr/contracts';
import { clampLimit, clampLossRemaining } from './clamp';
import type { LimitContext } from './context';
import { CATALOG_VERSION, loadBrokerEnvelopes, loadLiveGateThresholdBands } from './catalog-loader';

const OPEN_PHASES: ReadonlySet<SessionPhase> = new Set(['open', 'midday', 'power_hour']);
const ORDER_FREQ_WINDOW_MS = 60_000;

function block(
  domain: OperatingLimitResult['domain'],
  unit: string,
  evidence: string,
  hardEnvelopeRef: OperatingLimitResult['hardEnvelopeRef'] = null,
): OperatingLimitResult {
  return {
    domain,
    status: 'block',
    valueInt: null,
    unit,
    evidence,
    hardEnvelopeRef,
    operatorCapInt: null,
    calcValueInt: null,
  };
}

function passLimit(
  domain: OperatingLimitResult['domain'],
  valueInt: bigint,
  unit: string,
  evidence: string,
  hardEnvelopeRef: OperatingLimitResult['hardEnvelopeRef'] = null,
  calcValueInt: bigint | null = null,
  operatorCapInt: bigint | null = null,
): OperatingLimitResult {
  return {
    domain,
    status: 'pass',
    valueInt: valueInt.toString(),
    unit,
    evidence,
    hardEnvelopeRef,
    operatorCapInt: operatorCapInt?.toString() ?? null,
    calcValueInt: calcValueInt?.toString() ?? null,
  };
}

function evaluateBuyingPower(ctx: LimitContext): OperatingLimitResult {
  const unit = 'USD_cents';
  const hasVirtual = ctx.virtualBalanceCents !== undefined;
  const hasBroker = ctx.brokerBuyingPowerCents !== undefined;

  if (!hasVirtual && !hasBroker) {
    return block(
      'buying_power',
      unit,
      'buying_power inputs missing: virtual balance and broker buying power both absent',
    );
  }

  if (ctx.mode === 'live' && (!hasVirtual || !hasBroker)) {
    return block(
      'buying_power',
      unit,
      'live mode requires both virtual allocation and broker buying power snapshots',
    );
  }

  const virtual = hasVirtual ? ctx.virtualBalanceCents! : 0n;
  const broker = hasBroker ? ctx.brokerBuyingPowerCents! : virtual;
  const calc = virtual <= broker ? virtual : broker;
  const hardCap = broker;
  const operatorCap = virtual;
  const clamped = clampLimit(calc, hardCap, operatorCap);

  const evidence =
    hasVirtual && hasBroker
      ? `buying_power = min(virtual=${virtual.toString()}, broker=${broker.toString()}) = ${clamped.toString()} cents`
      : hasVirtual
        ? `paper-only virtual balance ${virtual.toString()} cents (broker snapshot absent)`
        : `broker buying power ${broker.toString()} cents (virtual allocation absent)`;

  return passLimit('buying_power', clamped, unit, evidence, null, calc, operatorCap);
}

function evaluateSessionLegality(ctx: LimitContext): OperatingLimitResult {
  const unit = 'legality_flag';
  const marketOpen = OPEN_PHASES.has(ctx.sessionPhase);

  if (marketOpen) {
    return passLimit(
      'session_legality',
      1n,
      unit,
      `session phase ${ctx.sessionPhase}: regular-session legality pass`,
      {
        catalog: 'session_constraints',
        entryKey: 'sess-001',
        field: 'orderTypeMatrix',
        catalogVersion: CATALOG_VERSION,
      },
    );
  }

  if (ctx.mode === 'paper') {
    return passLimit(
      'session_legality',
      1n,
      unit,
      `paper_mode_session_waiver: phase ${ctx.sessionPhase}`,
    );
  }

  return block(
    'session_legality',
    unit,
    `live mode blocked: session phase ${ctx.sessionPhase} is not regular-session open`,
    {
      catalog: 'session_constraints',
      entryKey: 'sess-001',
      field: 'orderTypeMatrix',
      catalogVersion: CATALOG_VERSION,
    },
  );
}

function evaluateDailyLossRemaining(ctx: LimitContext): OperatingLimitResult {
  const unit = 'USD_cents';
  const bands = loadLiveGateThresholdBands();
  const dailyLossBps = ctx.dailyLossLimitBps ?? bands.boundedRangeFamilies.daily_loss_bps?.typical;

  if (ctx.equityCents === undefined || ctx.realizedLossCents === undefined) {
    return block(
      'daily_loss_remaining',
      unit,
      'daily_loss_remaining inputs missing: equity and realized loss required',
      {
        catalog: 'live_gate_threshold_bands',
        entryKey: 'daily_loss_bps',
        field: 'typical',
        catalogVersion: bands.catalogVersion,
      },
    );
  }

  if (dailyLossBps === undefined) {
    return block(
      'daily_loss_remaining',
      unit,
      'daily_loss_bps band missing from live_gate_threshold_bands catalog',
    );
  }

  const limitCents = (ctx.equityCents * BigInt(Math.round(dailyLossBps * 100))) / 10000n;
  const calcRemaining = limitCents - ctx.realizedLossCents;
  const clamped = clampLossRemaining(calcRemaining, 0n, 0n);

  if (clamped <= 0n) {
    return {
      domain: 'daily_loss_remaining',
      status: 'block',
      valueInt: clamped.toString(),
      unit,
      evidence: `daily loss budget exhausted: limit ${limitCents.toString()} cents, realized loss ${ctx.realizedLossCents.toString()} cents`,
      hardEnvelopeRef: {
        catalog: 'live_gate_threshold_bands',
        entryKey: 'daily_loss_bps',
        field: 'typical',
        catalogVersion: bands.catalogVersion,
      },
      operatorCapInt: null,
      calcValueInt: calcRemaining.toString(),
    };
  }

  return passLimit(
    'daily_loss_remaining',
    clamped,
    unit,
    `daily loss remaining ${clamped.toString()} cents (limit ${limitCents.toString()} at ${dailyLossBps} bps)`,
    {
      catalog: 'live_gate_threshold_bands',
      entryKey: 'daily_loss_bps',
      field: 'typical',
      catalogVersion: bands.catalogVersion,
    },
    calcRemaining,
  );
}

function evaluateOrderFrequency(ctx: LimitContext): OperatingLimitResult {
  const unit = 'orders_per_min';
  const traces = ctx.recentTraceTimestampsMs;

  if (!traces) {
    return block(
      'order_frequency',
      unit,
      'order_frequency inputs missing: recent dispatch traces required',
    );
  }

  const envelopeId = ctx.brokerEnvelopeId ?? 'bpe-001';
  const envelope = loadBrokerEnvelopes().get(envelopeId);
  const budget = envelope?.tradeRequestBudgetPerMin;
  if (budget === undefined) {
    return block(
      'order_frequency',
      unit,
      `broker envelope ${envelopeId} missing tradeRequestBudgetPerMin`,
      {
        catalog: 'broker_policy_envelopes',
        entryKey: envelopeId,
        field: 'tradeRequestBudgetPerMin',
        catalogVersion: CATALOG_VERSION,
      },
    );
  }

  const windowStart = ctx.nowMs - ORDER_FREQ_WINDOW_MS;
  const recentCount = traces.filter((ts) => ts >= windowStart && ts <= ctx.nowMs).length;
  const remaining = BigInt(budget - recentCount);
  const hardCap = BigInt(budget);
  const clamped = clampLimit(remaining, hardCap, hardCap);

  if (clamped <= 0n) {
    return {
      domain: 'order_frequency',
      status: 'block',
      valueInt: '0',
      unit,
      evidence: `order frequency cap reached: ${recentCount}/${budget} requests in last minute`,
      hardEnvelopeRef: {
        catalog: 'broker_policy_envelopes',
        entryKey: envelopeId,
        field: 'tradeRequestBudgetPerMin',
        catalogVersion: CATALOG_VERSION,
      },
      operatorCapInt: hardCap.toString(),
      calcValueInt: remaining.toString(),
    };
  }

  return passLimit(
    'order_frequency',
    clamped,
    unit,
    `order frequency remaining ${clamped.toString()}/${budget} per minute`,
    {
      catalog: 'broker_policy_envelopes',
      entryKey: envelopeId,
      field: 'tradeRequestBudgetPerMin',
      catalogVersion: CATALOG_VERSION,
    },
    remaining,
    hardCap,
  );
}

/** Compute all operating limits for the supplied context. Missing inputs → explicit block. */
export function computeOperatingLimits(ctx: LimitContext): LimitsSnapshot {
  const limits = [
    evaluateBuyingPower(ctx),
    evaluateSessionLegality(ctx),
    evaluateDailyLossRemaining(ctx),
    evaluateOrderFrequency(ctx),
  ];

  const overallPass = limits.every((l) => l.status === 'pass');

  return {
    schemaVersion: 1,
    companyId: ctx.companyId,
    moduleId: ctx.moduleId,
    mode: ctx.mode,
    evaluatedAt: new Date(ctx.nowMs).toISOString(),
    sessionPhase: ctx.sessionPhase,
    limits,
    overallPass,
  };
}
