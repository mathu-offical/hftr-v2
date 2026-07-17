import { eq } from 'drizzle-orm';
import type { HandoffEnvelope } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { actionInstructions } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { checkInput } from '../calc/sanity';
import { load } from '../calc/store';
import type { StoredRow } from '../calc/store';

export type InstructionFinalizeErrorCode =
  'instruction_not_found' | 'ref_missing' | 'stale_input' | 'sanity_block' | 'invalid_ref_kind';

export class InstructionFinalizeError extends Error {
  readonly code: InstructionFinalizeErrorCode;
  readonly ref: string | undefined;

  constructor(code: InstructionFinalizeErrorCode, message: string, ref?: string) {
    super(message);
    this.name = 'InstructionFinalizeError';
    this.code = code;
    this.ref = ref;
  }
}

export interface ResolvedInstruction {
  instructionId: string;
  companyId: string;
  moduleId: string;
  actionVerb: 'buy' | 'sell' | 'cancel' | 'replace' | 'close_position';
  symbol: string;
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  quantityInt: string;
  quantityScale: number;
  limitPriceCents: number | null;
  stopPriceCents: number | null;
  fillTimeoutMs: number;
  clientOrderId: string;
  envelope: HandoffEnvelope;
  lineage: {
    quantityRef: string;
    limitPriceRef: string | null;
    fillTimeoutRef: string;
  };
}

async function loadRefOrThrow(db: Db, clock: Clock, ref: string): Promise<StoredRow> {
  let row: StoredRow;
  try {
    row = await load(db, ref);
  } catch {
    throw new InstructionFinalizeError('ref_missing', `unknown ValueRef: ${ref}`, ref);
  }
  const sanity = checkInput(row, clock);
  if (!sanity.ok) {
    throw new InstructionFinalizeError(
      sanity.code === 'stale_input' ? 'stale_input' : 'sanity_block',
      sanity.detail,
      ref,
    );
  }
  return row;
}

function centsFromPriceRow(row: StoredRow, ref: string): number {
  if (row.kind !== 'price' && row.kind !== 'usd_cents') {
    throw new InstructionFinalizeError(
      'invalid_ref_kind',
      `${ref}: expected price ref, got ${row.kind}`,
      ref,
    );
  }
  if (row.scale !== 0) {
    throw new InstructionFinalizeError(
      'invalid_ref_kind',
      `${ref}: dispatch finalizer requires scale-0 price cents`,
      ref,
    );
  }
  const cents = Number(row.valueInt);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new InstructionFinalizeError('sanity_block', `${ref}: invalid price cents`, ref);
  }
  return cents;
}

function durationMsFromRow(row: StoredRow, ref: string): number {
  if (row.kind !== 'duration_ms') {
    throw new InstructionFinalizeError(
      'invalid_ref_kind',
      `${ref}: expected duration_ms ref, got ${row.kind}`,
      ref,
    );
  }
  const ms = Number(row.valueInt);
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new InstructionFinalizeError('sanity_block', `${ref}: invalid fill timeout`, ref);
  }
  return ms;
}

function quantityFromRow(
  row: StoredRow,
  ref: string,
): { quantityInt: string; quantityScale: number } {
  if (row.kind !== 'quantity' && row.kind !== 'count') {
    throw new InstructionFinalizeError(
      'invalid_ref_kind',
      `${ref}: expected quantity ref, got ${row.kind}`,
      ref,
    );
  }
  if (row.valueInt <= 0n) {
    throw new InstructionFinalizeError('sanity_block', `${ref}: quantity must be positive`, ref);
  }
  return { quantityInt: row.valueInt.toString(), quantityScale: row.scale };
}

/**
 * Load a compile-produced action instruction and resolve ValueRef handles into
 * deterministic task fields. Fail-closed on missing, stale, or invalid refs.
 */
export async function resolveInstructionFromRefs(
  db: Db,
  clock: Clock,
  instructionId: string,
): Promise<ResolvedInstruction> {
  const rows = await db
    .select()
    .from(actionInstructions)
    .where(eq(actionInstructions.id, instructionId))
    .limit(1);
  const instruction = rows[0];
  if (!instruction) {
    throw new InstructionFinalizeError(
      'instruction_not_found',
      `unknown instruction: ${instructionId}`,
    );
  }

  const quantityRow = await loadRefOrThrow(db, clock, instruction.quantityRef);
  const { quantityInt, quantityScale } = quantityFromRow(quantityRow, instruction.quantityRef);

  const limitPriceRef = instruction.limitPriceRef;
  let limitPriceCents: number | null = null;
  if (limitPriceRef) {
    const limitRow = await loadRefOrThrow(db, clock, limitPriceRef);
    limitPriceCents = centsFromPriceRow(limitRow, limitPriceRef);
  }

  const stopPriceRef = instruction.stopPriceRef;
  let stopPriceCents: number | null = null;
  if (stopPriceRef) {
    const stopRow = await loadRefOrThrow(db, clock, stopPriceRef);
    stopPriceCents = centsFromPriceRow(stopRow, stopPriceRef);
  }

  const timeoutRow = await loadRefOrThrow(db, clock, instruction.fillTimeoutRef);
  const fillTimeoutMs = durationMsFromRow(timeoutRow, instruction.fillTimeoutRef);

  return {
    instructionId: instruction.id,
    companyId: instruction.companyId,
    moduleId: instruction.moduleId,
    actionVerb: instruction.actionVerb,
    symbol: instruction.symbol,
    orderType: instruction.orderType,
    timeInForce: instruction.timeInForce,
    quantityInt,
    quantityScale,
    limitPriceCents,
    stopPriceCents,
    fillTimeoutMs,
    clientOrderId: instruction.clientOrderId,
    envelope: instruction.envelope as HandoffEnvelope,
    lineage: {
      quantityRef: instruction.quantityRef,
      limitPriceRef,
      fillTimeoutRef: instruction.fillTimeoutRef,
    },
  };
}

export function finalizeErrorToFailureCode(
  code: InstructionFinalizeErrorCode,
): 'stale_input' | 'numeric_sanity_block' | 'broker_policy_block' {
  switch (code) {
    case 'stale_input':
      return 'stale_input';
    case 'sanity_block':
    case 'invalid_ref_kind':
      return 'numeric_sanity_block';
    case 'instruction_not_found':
    case 'ref_missing':
      return 'broker_policy_block';
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
