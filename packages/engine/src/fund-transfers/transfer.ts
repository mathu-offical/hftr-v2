import type { fundTransfers } from '@hftr/db/schema';
import type { FundTransferProposal } from './fund-route-walker';

export type FundTransferRow = typeof fundTransfers.$inferSelect;
export type FundTransferStatus = FundTransferRow['status'];
export type FundEndpointKind = FundTransferRow['fromKind'];
export type FundTransferRequestedBy = FundTransferRow['requestedBy'];

/** Row shape for inserting walker proposals — always `requested`; approval via inbox. */
export interface FundTransferInsertFromProposal {
  fromKind: FundTransferProposal['fromKind'];
  fromModuleId: string;
  toKind: FundTransferProposal['toKind'];
  toModuleId: string;
  amountCents: bigint;
  status: 'requested';
  requestedBy: FundTransferRequestedBy;
}

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

export interface ModuleTransferLedgerEntry {
  moduleId: string;
  description: string;
  amountCents: bigint;
  balanceAfterCents: bigint;
}

export interface ModuleTransferLedgerBalances {
  fromModuleBalanceCents: bigint;
  toModuleBalanceCents: bigint;
}

export function isModuleToModuleTransfer(
  transfer: Pick<FundTransferRow, 'fromKind' | 'toKind'>,
): boolean {
  return transfer.fromKind === 'module' && transfer.toKind === 'module';
}

/**
 * Paired module ledger rows for module↔module hops. Amounts sum to zero; company pool unchanged
 * (`transferLedgerDeltaCents` is 0). `companyBalanceCents` is the caller's current company pool
 * balance (unchanged by these rows). Caller writes both rows on approve.
 */
export function moduleTransferLedgerEntries(
  transfer: Pick<
    FundTransferRow,
    'fromKind' | 'fromModuleId' | 'toKind' | 'toModuleId' | 'amountCents'
  >,
  companyBalanceCents: bigint,
  moduleBalances: ModuleTransferLedgerBalances,
): ModuleTransferLedgerEntry[] {
  if (!isModuleToModuleTransfer(transfer)) return [];
  const fromId = transfer.fromModuleId;
  const toId = transfer.toModuleId;
  if (!fromId || !toId) return [];
  const amount = transfer.amountCents;
  if (amount <= 0n) return [];

  void companyBalanceCents;

  const base = transferDescription(transfer);
  return [
    {
      moduleId: fromId,
      description: `${base} (debit)`,
      amountCents: -amount,
      balanceAfterCents: moduleBalances.fromModuleBalanceCents - amount,
    },
    {
      moduleId: toId,
      description: `${base} (credit)`,
      amountCents: amount,
      balanceAfterCents: moduleBalances.toModuleBalanceCents + amount,
    },
  ];
}

/**
 * Net company-pool ledger delta when a transfer is approved.
 * Module↔module moves are bookkeeping-only (zero company delta); use
 * `moduleTransferLedgerEntries` for paired module rows.
 *
 * Approve path: write ledger (company delta and/or paired module entries), set `approvedAt`,
 * then status **`settled`** (not `approved` alone).
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

/**
 * Map fund-route walker proposals to fund_transfers insert rows.
 * Uses `requestedBy: 'module'` (schema enum) for fund-router/system-initiated hops.
 * Does not auto-approve or settle — operator inbox still required.
 */
export function fundTransferRowsFromProposals(
  proposals: readonly FundTransferProposal[],
  requestedBy: FundTransferRequestedBy = 'module',
): FundTransferInsertFromProposal[] {
  return proposals.map((proposal) => ({
    fromKind: proposal.fromKind,
    fromModuleId: proposal.fromModuleId,
    toKind: proposal.toKind,
    toModuleId: proposal.toModuleId,
    amountCents: proposal.amountCents,
    status: 'requested' as const,
    requestedBy,
  }));
}
