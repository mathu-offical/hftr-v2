import { describe, expect, it } from 'vitest';
import {
  balanceLabel,
  brokerBuyingPowerHeadline,
  currentValueHeadline,
  executionCapitalChip,
  fundTransfersHeadline,
  fundsHeadline,
  masterEquityHeadline,
  normalizeCapitalMode,
  pnlHeadline,
} from './capital-mode-label';

describe('capital-mode-label', () => {
  it('normalizes unknown modes to paper (fail-closed for capital copy)', () => {
    expect(normalizeCapitalMode(undefined)).toBe('paper');
    expect(normalizeCapitalMode('live')).toBe('live');
    expect(normalizeCapitalMode('weird')).toBe('paper');
  });

  it('keeps Paper balance string for e2e / operator muscle memory', () => {
    expect(balanceLabel('paper')).toBe('Paper balance');
    expect(balanceLabel('live')).toBe('Live balance');
  });

  it('labels equity and funds with mode on the noun', () => {
    expect(currentValueHeadline('paper')).toBe('Paper equity');
    expect(masterEquityHeadline('paper')).toBe('Paper master equity');
    expect(fundsHeadline('live')).toBe('Live funds');
    expect(pnlHeadline('realized', 'paper')).toBe('Paper realized PnL');
  });

  it('distinguishes paper sim venue from live fills', () => {
    expect(executionCapitalChip('paper', 'paper_sim')).toBe('paper sim');
    expect(executionCapitalChip('paper', 'alpaca')).toBe('paper');
    expect(executionCapitalChip('live', 'alpaca')).toBe('live');
  });

  it('labels broker buying power and virtual transfers', () => {
    expect(brokerBuyingPowerHeadline('paper')).toBe('Paper broker buying power');
    expect(fundTransfersHeadline('paper')).toContain('paper');
  });
});
