import { describe, expect, it } from 'vitest';
import {
  canDecideTransfer,
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
});
