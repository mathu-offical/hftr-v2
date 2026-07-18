import { describe, expect, it } from 'vitest';
import type { EvidencePackage } from '@hftr/contracts';
import { corroborateAndNormalize, isSealValid } from './verified-normalize';

function pkg(overrides: Partial<EvidencePackage> = {}): EvidencePackage {
  return {
    sourceKind: 'brave_search',
    feedClass: 'brave_search',
    title: 'Semiconductor leadership note',
    summary: 'Qualitative leadership shift without raw figures.',
    digest: 'digest-alpha',
    legalUseClass: 'ALLOWED',
    expiresAt: null,
    artifactRefs: [],
    externalRef: null,
    authorityClass: 'DETERMINISTIC',
    ...overrides,
  };
}

describe('corroborateAndNormalize', () => {
  const nowMs = Date.parse('2026-07-18T12:00:00.000Z');

  it('returns null for empty evidence', () => {
    expect(
      corroborateAndNormalize({
        evidence: [],
        kind: 'movers_board',
        subjectKey: 'broad',
        title: 'Movers board',
        nowMs,
      }),
    ).toBeNull();
  });

  it('returns null when RESTRICTED packages are present', () => {
    expect(
      corroborateAndNormalize({
        evidence: [pkg({ legalUseClass: 'RESTRICTED' })],
        kind: 'sector_bulletin',
        subjectKey: 'energy',
        title: 'Sector bulletin',
        nowMs,
      }),
    ).toBeNull();
  });

  it('seals with low corroboration for a single domain', () => {
    const bundle = corroborateAndNormalize({
      evidence: [pkg()],
      kind: 'movers_board',
      subjectKey: 'broad',
      title: 'Movers board',
      nowMs,
    });
    expect(bundle).not.toBeNull();
    expect(bundle!.corroborationBand).toBe('low');
    expect(bundle!.sealId.startsWith('sha256-')).toBe(true);
    expect(bundle!.view.items.length).toBe(1);
  });

  it('raises corroboration band with independent domains', () => {
    const bundle = corroborateAndNormalize({
      evidence: [
        pkg({ sourceKind: 'brave_search', digest: 'digest-a' }),
        pkg({ sourceKind: 'gdelt_news', digest: 'digest-b', title: 'GDELT headline cluster' }),
        pkg({ sourceKind: 'alpha_vantage_news', digest: 'digest-c', title: 'AV headline cluster' }),
      ],
      kind: 'sector_bulletin',
      subjectKey: 'semiconductors',
      title: 'Sector bulletin — semiconductors',
      nowMs,
      topicScope: 'system:sector_news',
      topicSectors: ['semiconductors'],
    });
    expect(bundle!.corroborationBand).toBe('high');
    expect(bundle!.gatesSnapshot.some((g) => g.gateId === 'corroboration' && g.passed)).toBe(true);
  });

  it('is stable for the same evidence set', () => {
    const evidence = [
      pkg({ digest: 'digest-a' }),
      pkg({ sourceKind: 'gdelt_news', digest: 'digest-b' }),
    ];
    const a = corroborateAndNormalize({
      evidence,
      kind: 'daily_summary_phase',
      subjectKey: 'close',
      title: 'Close phase summary',
      nowMs,
    });
    const b = corroborateAndNormalize({
      evidence,
      kind: 'daily_summary_phase',
      subjectKey: 'close',
      title: 'Close phase summary',
      nowMs,
    });
    expect(a!.sealId).toBe(b!.sealId);
  });
});

describe('isSealValid', () => {
  const nowMs = Date.parse('2026-07-18T12:00:00.000Z');

  it('accepts unexpired bundles with digests', () => {
    const bundle = corroborateAndNormalize({
      evidence: [pkg(), pkg({ sourceKind: 'gdelt_news', digest: 'digest-b' })],
      kind: 'movers_board',
      subjectKey: 'broad',
      title: 'Movers board',
      nowMs,
    })!;
    expect(isSealValid(bundle, nowMs)).toBe(true);
    expect(isSealValid(bundle, Date.parse(bundle.expiresAt) + 1)).toBe(false);
  });
});
