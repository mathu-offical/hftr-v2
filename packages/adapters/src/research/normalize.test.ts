import { describe, expect, it } from 'vitest';
import { digestEvidence, normalizeToEvidencePackage, redactDigitHeavyText } from './normalize';

describe('redactDigitHeavyText', () => {
  it('replaces digit runs with [n]', () => {
    expect(redactDigitHeavyText('Revenue grew 42% to $1,234,567 in 2024')).toBe(
      'Revenue grew [n]% to $[n],[n],[n] in [n]',
    );
  });

  it('leaves text without digits unchanged', () => {
    expect(redactDigitHeavyText('Qualitative market backdrop')).toBe('Qualitative market backdrop');
  });
});

describe('digestEvidence', () => {
  it('returns stable sha256 hex truncated to max 128 chars', () => {
    const a = digestEvidence(['brave_search', 'title', 'summary', '']);
    const b = digestEvidence(['brave_search', 'title', 'summary', '']);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a.length).toBeLessThanOrEqual(128);
  });

  it('changes when inputs change', () => {
    const a = digestEvidence(['a']);
    const b = digestEvidence(['b']);
    expect(a).not.toBe(b);
  });
});

describe('normalizeToEvidencePackage', () => {
  it('redacts title/summary and validates EvidencePackage', () => {
    const pkg = normalizeToEvidencePackage({
      sourceKind: 'brave_search',
      feedClass: 'brave_search',
      title: 'Apple Q3 2024 earnings beat',
      summary: 'Revenue up 12% year over year to $94 billion.',
      externalRef: 'https://example.com/article/123',
    });

    expect(pkg.title).not.toMatch(/\d/);
    expect(pkg.summary).not.toMatch(/\d/);
    expect(pkg.sourceKind).toBe('brave_search');
    expect(pkg.feedClass).toBe('brave_search');
    expect(pkg.digest.length).toBeGreaterThanOrEqual(8);
    expect(pkg.externalRef).toBe('https://example.com/article/123');
  });

  it('produces identical digest for same normalized content', () => {
    const input = {
      sourceKind: 'sec_edgar' as const,
      feedClass: 'sec_edgar_free',
      title: '10-K filing',
      summary: 'Annual report available for review.',
      externalRef: 'acc-001',
    };
    const a = normalizeToEvidencePackage(input);
    const b = normalizeToEvidencePackage(input);
    expect(a.digest).toBe(b.digest);
  });
});
