import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../clock';
import { getSyntheticQuote } from '../dispatch/quotes';
import { compileInstruction, computeQuantity, type CompileTreeInput } from './compile';
import { DEFAULT_FRESHNESS_WINDOW_MS, evaluateGates, gatesPass, type GateInput } from './gates';
import { buildDecisionTree } from './tree';

const NOW_MS = 1_750_000_000_000;

function baseGateInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    symbol: 'AAPL',
    direction: 'up',
    scannedAtMs: NOW_MS - 60_000,
    nowMs: NOW_MS,
    sessionPhase: 'closed',
    mode: 'paper',
    ...overrides,
  };
}

describe('six-gate admission', () => {
  it('returns all six gates with explicit evidence', () => {
    const gates = evaluateGates(baseGateInput());
    expect(gates).toHaveLength(6);
    expect(gates.map((g) => g.gate)).toEqual([
      'regime_fit',
      'symbol_universe_fit',
      'session_fit',
      'broker_fit',
      'market_structure_fit',
      'evidence_fit',
    ]);
    for (const g of gates) expect(g.evidence.length).toBeGreaterThan(0);
    expect(gatesPass(gates)).toBe(true);
  });

  it('passes session fit via paper waiver when market is closed', () => {
    const gates = evaluateGates(baseGateInput({ sessionPhase: 'closed', mode: 'paper' }));
    const session = gates.find((g) => g.gate === 'session_fit')!;
    expect(session.result).toBe('pass');
    expect(session.evidence).toBe('paper_mode_session_waiver');
  });

  it('fails session fit when market is closed in live mode', () => {
    const gates = evaluateGates(baseGateInput({ sessionPhase: 'overnight', mode: 'live' }));
    expect(gates.find((g) => g.gate === 'session_fit')!.result).toBe('fail');
    expect(gatesPass(gates)).toBe(false);
  });

  it('fails evidence fit for stale scans and passes for fresh ones', () => {
    const stale = evaluateGates(
      baseGateInput({ scannedAtMs: NOW_MS - DEFAULT_FRESHNESS_WINDOW_MS - 1 }),
    );
    expect(stale.find((g) => g.gate === 'evidence_fit')!.result).toBe('fail');

    const fresh = evaluateGates(
      baseGateInput({ scannedAtMs: NOW_MS - DEFAULT_FRESHNESS_WINDOW_MS + 1 }),
    );
    expect(fresh.find((g) => g.gate === 'evidence_fit')!.result).toBe('pass');
  });

  it('fails symbol-universe fit for bad symbols and out-of-universe symbols', () => {
    const bad = evaluateGates(baseGateInput({ symbol: 'aapl$' }));
    expect(bad.find((g) => g.gate === 'symbol_universe_fit')!.result).toBe('fail');

    const outside = evaluateGates(baseGateInput({ symbol: 'MSFT', instruments: ['AAPL'] }));
    expect(outside.find((g) => g.gate === 'symbol_universe_fit')!.result).toBe('fail');

    const inside = evaluateGates(baseGateInput({ symbol: 'AAPL', instruments: ['aapl'] }));
    expect(inside.find((g) => g.gate === 'symbol_universe_fit')!.result).toBe('pass');
  });
});

describe('decision tree building', () => {
  const quote = getSyntheticQuote('AAPL', createFixedClock(NOW_MS));

  it('builds an order entry branch plus invalidation for up leads', () => {
    const tree = buildDecisionTree({ symbol: 'AAPL', direction: 'up' }, quote);
    expect(tree.sourceClass).toBe('deterministic_placeholder');
    expect(tree.branches.map((b) => b.id)).toEqual(['entry', 'invalidation']);
    expect(tree.branches[0]!.emits).toBe('order');
    expect(tree.branches[1]!.condition).toContain('price_drift_beyond_band');
    expect(tree.recoveryLadder).toEqual(['defer', 'cancel', 'escalate']);
  });

  it('marks the entry blocked for down leads (no shorting in paper v1)', () => {
    const tree = buildDecisionTree({ symbol: 'AAPL', direction: 'down' }, quote);
    expect(tree.branches[0]!.emits).toBe('blocked');
  });
});

function compilable(overrides: Partial<CompileTreeInput> = {}): CompileTreeInput {
  const quote = getSyntheticQuote('AAPL', createFixedClock(NOW_MS));
  const built = buildDecisionTree({ symbol: 'AAPL', direction: 'up' }, quote);
  return {
    symbol: built.symbol,
    direction: 'up',
    branches: built.branches,
    recoveryLadder: built.recoveryLadder,
    ...overrides,
  };
}

describe('compile placeholder', () => {
  const ctx = { balanceCents: 1_000_000n, priceCents: 20_000 }; // $10,000 balance, $200 price

  it('compiles an up tree into a market buy with deterministic sizing', () => {
    const out = compileInstruction(compilable(), ctx);
    expect(out.result).toBe('compiled');
    if (out.result === 'compiled') {
      expect(out.instruction.actionVerb).toBe('buy');
      expect(out.instruction.orderType).toBe('market');
      // 1% of 1,000,000¢ = 10,000¢ budget / 20,000¢ price → floor 0 → clamped to 1
      expect(out.instruction.quantity).toBe(1);
    }
  });

  it('blocks down direction with unsupported_order_class', () => {
    const out = compileInstruction(compilable({ direction: 'down' }), ctx);
    expect(out).toEqual({ result: 'blocked', blockReason: 'unsupported_order_class' });
  });

  it('blocks missing branches with incomplete_branch', () => {
    const out = compileInstruction(compilable({ branches: [] }), ctx);
    expect(out).toEqual({ result: 'blocked', blockReason: 'incomplete_branch' });
  });

  it('blocks an empty recovery ladder with missing_recovery_ladder', () => {
    const out = compileInstruction(compilable({ recoveryLadder: [] }), ctx);
    expect(out).toEqual({ result: 'blocked', blockReason: 'missing_recovery_ladder' });
  });

  it('blocks non-integer or non-positive prices with price_precision_mismatch', () => {
    expect(compileInstruction(compilable(), { balanceCents: 1_000_000n, priceCents: 0 })).toEqual({
      result: 'blocked',
      blockReason: 'price_precision_mismatch',
    });
  });

  it('sizes at 1% of balance, clamped to [1, 100]', () => {
    // 1% of $1,000,000.00 = $10,000 / $50.00 → 200 → clamped to 100
    expect(computeQuantity(100_000_000n, 5_000)).toBe(100);
    // 1% of $10,000.00 = $100 / $20.00 → 5
    expect(computeQuantity(1_000_000n, 2_000)).toBe(5);
    // Tiny balance clamps up to 1 (dispatch capital gate is the real stop)
    expect(computeQuantity(100n, 5_000)).toBe(1);
  });
});
