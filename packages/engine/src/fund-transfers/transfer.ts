import type { fundTransfers } from '@hftr/db/schema';

export type FundTransferRow = typeof fundTransfers.$inferSelect;
export type FundTransferStatus = FundTransferRow['status'];
export type FundEndpointKind = FundTransferRow['fromKind'];

export type TransferDecision = 'approve' | 'reject';

const TERMINAL: ReadonlySet<FundTransferStatus> = new Set([
  'approved',
  'auto_approved',
  'rejected',
  'settled',
]);

export function canDecideTransfer(status: FundTransferStatus): boolean {
  return status === 'requested';
}

export function validateTransferDecision(
  transfer: Pick<FundTransferRow, 'status'>,
  decision: TransferDecision,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (!canDecideTransfer(transfer.status)) {
    return {
      ok: false,
      code: 'transfer_not_pending',
      detail: `transfer status ${transfer.status} is not awaiting approval`,
    };
  }
  if (decision !== 'approve' && decision !== 'reject') {
    return { ok: false, code: 'invalid_decision', detail: 'decision must be approve or reject' };
  }
  return { ok: true };
}

/**
 * Net company-pool ledger delta when a transfer is approved.
 * Module↔module moves are bookkeeping-only in this stub (zero company delta).
 */
export function transferLedgerDeltaCents(
  transfer: Pick<FundTransferRow, 'fromKind' | 'toKind' | 'amountCents'>,
): bigint {
  const amount = transfer.amountCents;
  if (amount <= 0n) return 0n;

  const fromPool = transfer.fromKind === 'company_pool';
  const toPool = transfer.toKind === 'company_pool';
  const fromReserve = transfer.fromKind === 'reserve';
  const toReserve = transfer.toKind === 'reserve';

  if (fromPool && !toPool) return -amount;
  if (toPool && !fromPool) return amount;
  if (fromReserve && toPool) return amount;
  if (fromPool && toReserve) return -amount;
  return 0n;
}

export function transferDescription(
  transfer: Pick<
    FundTransferRow,
    'fromKind' | 'fromModuleId' | 'toKind' | 'toModuleId' | 'amountCents'
  >,
): string {
  const amount = transfer.amountCents.toString();
  const from =
    transfer.fromKind === 'module' && transfer.fromModuleId
      ? `module:${transfer.fromModuleId.slice(0, 8)}`
      : transfer.fromKind;
  const to =
    transfer.toKind === 'module' && transfer.toModuleId
      ? `module:${transfer.toModuleId.slice(0, 8)}`
      : transfer.toKind;
  return `fund transfer ${from} → ${to} (${amount}¢)`;
}

export function isTerminalTransferStatus(status: FundTransferStatus): boolean {
  return TERMINAL.has(status);
}
