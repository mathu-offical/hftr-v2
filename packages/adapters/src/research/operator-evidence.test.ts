import { describe, expect, it } from 'vitest';
import {
  deriveOperatorArticleTitle,
  normalizeOperatorArticleEvidence,
} from './operator-evidence';

describe('operator article evidence (D-079)', () => {
  it('derives title from first markdown heading for text', () => {
    expect(
      deriveOperatorArticleTitle({
        kind: 'text',
        content: '# Leadership rotation thesis\n\nBody copy.',
      }),
    ).toBe('Leadership rotation thesis');
  });

  it('derives title from URL host for links', () => {
    expect(
      deriveOperatorArticleTitle({
        kind: 'link',
        content: 'https://www.example.com/article',
      }),
    ).toBe('Operator link: example.com');
  });

  it('normalizes OPERATOR_INPUT evidence with redacted digits in summary', () => {
    const pkg = normalizeOperatorArticleEvidence({
      kind: 'text',
      title: 'Test note',
      body: 'Moved about 12 percent in sympathy — qualitative framing.',
    });
    expect(pkg.sourceKind).toBe('operator');
    expect(pkg.authorityClass).toBe('OPERATOR_INPUT');
    expect(pkg.summary).not.toMatch(/\d/);
    expect(pkg.digest.length).toBeGreaterThanOrEqual(8);
  });
});
