import { describe, expect, it } from 'vitest';
import {
  canDecideTransfer,
  fundTransferRowsFromProposals,
  moduleTransferLedgerEntries,
  transferDescription,
  transferLedgerDeltaCents,
  validateTransferDecision,
} from './transfer';

describe('fund transfer decisions', () => {
  const base = {
    fromKind: 'company_pool' as const,
    fromModuleId: null,
    toKind: 'module' as const,
    toModuleId: '11111111-1111-1111-1111-111111111111',
    amountCents: 50_000n,
  };

  it('allows approve/reject only from requested', () => {
    expect(canDecideTransfer('requested')).toBe(true);
    expect(canDecideTransfer('approved')).toBe(false);
    expect(validateTransferDecision({ status: 'requested' }, 'approve').ok).toBe(true);
    expect(validateTransferDecision({ status: 'rejected' }, 'approve').ok).toBe(false);
  });

  it('computes company-pool ledger deltas', () => {
    expect(transferLedgerDeltaCents({ ...base, fromKind: 'company_pool', toKind: 'module' })).toBe(
      -50_000n,
    );
    expect(transferLedgerDeltaCents({ ...base, fromKind: 'module', toKind: 'company_pool' })).toBe(
      50_000n,
    );
    expect(transferLedgerDeltaCents({ ...base, fromKind: 'module', toKind: 'module' })).toBe(0n);
  });

  it('builds human-readable transfer descriptions', () => {
    const desc = transferDescription(base);
    expect(desc).toContain('company_pool');
    expect(desc).toContain('module:11111111');
    expect(desc).toContain('50000');
  });

  it('maps walker proposals to requested insert rows', () => {
    const proposals = [
      {
        fromKind: 'module' as const,
        fromModuleId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        toKind: 'module' as const,
        toModuleId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        amountCents: 25_000n,
      },
    ];
    expect(fundTransferRowsFromProposals(proposals)).toEqual([
      {
        ...proposals[0],
        status: 'requested',
        requestedBy: 'module',
      },
    ]);
    expect(fundTransferRowsFromProposals(proposals, 'policy')[0]!.requestedBy).toBe('policy');
  });

  it('moduleTransferLedgerEntries conserves company pool and module amounts', () => {
    const transfer = {
      fromKind: 'module' as const,
      fromModuleId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      toKind: 'module' as const,
      toModuleId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      amountCents: 25_000n,
    };
    const companyBalanceCents = 1_000_000n;
    const entries = moduleTransferLedgerEntries(transfer, companyBalanceCents, {
      fromModuleBalanceCents: 100_000n,
      toModuleBalanceCents: 50_000n,
    });

    expect(entries).toHaveLength(2);
    expect(transferLedgerDeltaCents(transfer)).toBe(0n);
    expect(entries.reduce((sum, e) => sum + e.amountCents, 0n)).toBe(0n);
    expect(entries[0]!.amountCents).toBe(-25_000n);
    expect(entries[0]!.balanceAfterCents).toBe(75_000n);
    expect(entries[1]!.amountCents).toBe(25_000n);
    expect(entries[1]!.balanceAfterCents).toBe(75_000n);
    expect(entries[0]!.moduleId).toBe(transfer.fromModuleId);
    expect(entries[1]!.moduleId).toBe(transfer.toModuleId);
  });

  it('moduleTransferLedgerEntries returns empty for pool hops', () => {
    expect(
      moduleTransferLedgerEntries(
        {
          fromKind: 'company_pool',
          fromModuleId: null,
          toKind: 'module',
          toModuleId: '11111111-1111-1111-1111-111111111111',
          amountCents: 10_000n,
        },
        500_000n,
        { fromModuleBalanceCents: 0n, toModuleBalanceCents: 0n },
      ),
    ).toEqual([]);
  });
});
