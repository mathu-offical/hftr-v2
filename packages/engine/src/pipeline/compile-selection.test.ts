import { describe, expect, it } from 'vitest';
import { CompileSelectionOutput } from '@hftr/contracts';
import { computeQuantity } from './compile';
import { mergeCompileSelection } from './compile-selection';

describe('mergeCompileSelection', () => {
  const baseInstruction = {
    actionVerb: 'buy' as const,
    symbol: 'AAPL',
    orderType: 'market' as const,
    timeInForce: 'day' as const,
    quantity: 1,
  };

  it('prefers model orderShape and timeInForce while quantity stays external', () => {
    const selection = CompileSelectionOutput.parse({
      orderShape: 'limit',
      timeInForce: 'gtc',
      sizingBand: 'typical',
      sizingPlanId: 'default_risk_bps',
      blockReasons: [],
    });

    const merged = mergeCompileSelection(baseInstruction, selection, 100);
    expect(merged.instruction.orderType).toBe('limit');
    expect(merged.instruction.timeInForce).toBe('gtc');
    expect(merged.provider).toBe('model');

    const qtyFromModel = 999;
    const withBadModelQty = { ...merged.instruction, quantity: qtyFromModel };
    const deterministicQty = computeQuantity(1_000_000n, 20_000, merged.adjustedSizingBasisBps);
    const finalInstruction = { ...withBadModelQty, quantity: deterministicQty };
    expect(finalInstruction.quantity).toBe(deterministicQty);
    expect(finalInstruction.quantity).not.toBe(qtyFromModel);
  });

  it('returns deterministic defaults when selection is null', () => {
    const merged = mergeCompileSelection(baseInstruction, null, 100);
    expect(merged.instruction.orderType).toBe('market');
    expect(merged.instruction.timeInForce).toBe('day');
    expect(merged.provider).toBe('deterministic_placeholder');
    expect(merged.adjustedSizingBasisBps).toBe(100);
  });
});
