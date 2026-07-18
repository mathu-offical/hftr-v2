import type { BranchNode } from '@hftr/contracts';

/**
 * Deterministic compile placeholder (v1 execution-agent-compile.md). Applies
 * the v1 block reason taxonomy to a decision tree and, when eligible, emits
 * the field values a real execution-agent tier would compile. Sizing is a
 * fixed deterministic rule (1% of balance, clamped 1..100 units) — no model
 * reads or writes any of these numbers.
 */

export type CompileBlockReason =
  | 'incomplete_branch'
  | 'unsupported_order_class'
  | 'missing_recovery_ladder'
  | 'price_precision_mismatch'
  | 'policy_mismatch'
  | 'missing_context';

export interface CompileTreeInput {
  symbol: string;
  direction: 'up' | 'down' | 'flat';
  branches: BranchNode[];
  recoveryLadder: string[];
}

export interface CompileContext {
  balanceCents: bigint;
  priceCents: number;
  /** From philosophy risk_appetite → sizing BPS (default 100 = 1%). */
  sizingBasisBps?: number;
}

export interface CompiledInstructionFields {
  actionVerb: 'buy';
  symbol: string;
  orderType: 'market' | 'limit';
  timeInForce: 'day' | 'gtc' | 'ioc';
  quantity: number;
}

export type CompileOutcome =
  | { result: 'compiled'; instruction: CompiledInstructionFields }
  | { result: 'blocked'; blockReason: CompileBlockReason };

export const MIN_QTY = 1;
export const MAX_QTY = 100;
/** Sizing basis: 1% of company balance per entry. */
export const SIZING_BASIS_BPS = 100;

export function computeQuantity(
  balanceCents: bigint,
  priceCents: number,
  sizingBasisBps: number = SIZING_BASIS_BPS,
): number {
  const bps =
    Number.isFinite(sizingBasisBps) && sizingBasisBps > 0 ? sizingBasisBps : SIZING_BASIS_BPS;
  const budgetCents = Number(balanceCents) * (bps / 10_000);
  const raw = Math.floor(budgetCents / priceCents);
  return Math.min(MAX_QTY, Math.max(MIN_QTY, raw));
}

/**
 * ATR risk-geometry size (v1 identity):
 * qty = floor((equity × risk_per_trade_pct / 100) / (atr × atr_mult))
 * when risk distance is in $ terms per share (= atrCents × atrMult).
 * Returns 0 when inputs cannot size (caller falls back to budget qty).
 */
export function computeAtrRiskQuantity(
  balanceCents: bigint,
  riskPerTradePct: number,
  atrCents: number,
  atrMultiplier: number,
): number {
  if (balanceCents <= 0n) return 0;
  if (!Number.isFinite(riskPerTradePct) || riskPerTradePct <= 0) return 0;
  if (!Number.isFinite(atrCents) || atrCents <= 0) return 0;
  if (!Number.isFinite(atrMultiplier) || atrMultiplier <= 0) return 0;
  const riskBudgetCents = (Number(balanceCents) * riskPerTradePct) / 100;
  const riskPerShareCents = Math.max(1, Math.floor(atrCents * atrMultiplier));
  const raw = Math.floor(riskBudgetCents / riskPerShareCents);
  if (raw <= 0) return 0;
  return Math.min(MAX_QTY, Math.max(MIN_QTY, raw));
}

/**
 * Entry qty = min(budget-BPS qty, ATR-risk qty) when ATR risk resolves;
 * otherwise budget-BPS. Polarization already folded into sizingBasisBps.
 */
export function resolveEntryQuantity(args: {
  balanceCents: bigint;
  priceCents: number;
  sizingBasisBps: number;
  riskPerTradePct: number;
  atrCents: number;
  atrMultiplier: number;
}): number {
  const budgetQty = computeQuantity(
    args.balanceCents,
    args.priceCents,
    args.sizingBasisBps,
  );
  const atrQty = computeAtrRiskQuantity(
    args.balanceCents,
    args.riskPerTradePct,
    args.atrCents,
    args.atrMultiplier,
  );
  if (atrQty <= 0) return budgetQty;
  return Math.min(budgetQty, atrQty);
}

export function compileInstruction(tree: CompileTreeInput, ctx: CompileContext): CompileOutcome {
  const hasEntry = tree.branches.some((b) => b.id === 'entry');
  const hasInvalidation = tree.branches.some((b) => b.id === 'invalidation');
  if (!hasEntry || !hasInvalidation) {
    return { result: 'blocked', blockReason: 'incomplete_branch' };
  }
  if (tree.direction === 'down') {
    // Paper v1 forbids shorting; a down lead has no supported order class.
    return { result: 'blocked', blockReason: 'unsupported_order_class' };
  }
  if (tree.direction === 'flat') {
    // No directional thesis: the strategy family context needed to act is missing.
    return { result: 'blocked', blockReason: 'missing_context' };
  }
  if (tree.recoveryLadder.length === 0) {
    return { result: 'blocked', blockReason: 'missing_recovery_ladder' };
  }
  if (!Number.isInteger(ctx.priceCents) || ctx.priceCents <= 0) {
    return { result: 'blocked', blockReason: 'price_precision_mismatch' };
  }

  return {
    result: 'compiled',
    instruction: {
      actionVerb: 'buy',
      symbol: tree.symbol,
      orderType: 'market',
      timeInForce: 'day',
      quantity: computeQuantity(ctx.balanceCents, ctx.priceCents, ctx.sizingBasisBps),
    },
  };
}
