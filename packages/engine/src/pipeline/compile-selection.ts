import type { CompileSelectionOutput } from '@hftr/contracts';
import type { CompileBlockReason, CompiledInstructionFields } from './compile';

const SIZING_BAND_MULTIPLIER = {
  min: 0.5,
  typical: 1,
  max: 1.5,
} as const;

const SAFE_ORDER_SHAPES = new Set(['market', 'limit']);
const SAFE_TIME_IN_FORCE = new Set(['day', 'gtc', 'ioc']);

/**
 * Merge execution-tier model selections into a deterministic compile result.
 * Quantity always comes from computeInstruction / computeQuantity — never the model.
 */
export function mergeCompileSelection(
  instruction: CompiledInstructionFields,
  selection: CompileSelectionOutput | null,
  sizingBasisBps: number,
): {
  instruction: CompiledInstructionFields;
  adjustedSizingBasisBps: number;
  provider: 'model' | 'deterministic_placeholder';
} {
  if (!selection) {
    return {
      instruction,
      adjustedSizingBasisBps: sizingBasisBps,
      provider: 'deterministic_placeholder',
    };
  }

  const multiplier = SIZING_BAND_MULTIPLIER[selection.sizingBand] ?? 1;
  const adjustedSizingBasisBps = Math.max(1, Math.round(sizingBasisBps * multiplier));

  const orderType = SAFE_ORDER_SHAPES.has(selection.orderShape)
    ? selection.orderShape
    : instruction.orderType;
  const timeInForce = SAFE_TIME_IN_FORCE.has(selection.timeInForce)
    ? selection.timeInForce
    : instruction.timeInForce;

  return {
    instruction: {
      ...instruction,
      orderType,
      timeInForce,
    },
    adjustedSizingBasisBps,
    provider: 'model',
  };
}

/** Map qualitative model block reasons to the v1 compile taxonomy when possible. */
export function modelBlockReasonToCompile(reasons: readonly string[]): CompileBlockReason {
  const joined = reasons.join(' ').toLowerCase();
  if (joined.includes('branch') || joined.includes('incomplete')) {
    return 'incomplete_branch';
  }
  if (joined.includes('order') || joined.includes('short') || joined.includes('unsupported')) {
    return 'unsupported_order_class';
  }
  if (joined.includes('recovery') || joined.includes('ladder')) {
    return 'missing_recovery_ladder';
  }
  if (joined.includes('price') || joined.includes('precision')) {
    return 'price_precision_mismatch';
  }
  if (joined.includes('context') || joined.includes('missing')) {
    return 'missing_context';
  }
  return 'policy_mismatch';
}
