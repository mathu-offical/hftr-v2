import { describe, expect, it } from 'vitest';
import type { EvidencePackage } from '@hftr/contracts';
import {
  canonicalizeUrl,
  dedupeEvidenceByNearHash,
  hammingDistance,
  simHash64,
  simHash64Hex,
} from './evidence-quality';

function pkg(title: string, summary: string): EvidencePackage {
  return {
    sourceKind: 'brave_search',
    feedClass: 'brave_search',
    title,
    summary,
    digest: `digest-${title}`,
    legalUseClass: 'ALLOWED',
    expiresAt: null,
    artifactRefs: [],
    externalRef: null,
    authorityClass: 'DETERMINISTIC',
  };
}

describe('canonicalizeUrl', () => {
  it('lowercases host, strips hash, and drops tracking params', () => {
    expect(canonicalizeUrl('HTTPS://Example.COM/path/?utm_source=x&b=2#section')).toBe(
      'https://example.com/path?b=2',
    );
  });
});

describe('simHash64', () => {
  it('is stable for identical text', () => {
    const a = simHash64('semiconductor supply chain outlook');
    const b = simHash64('semiconductor supply chain outlook');
    expect(a).toBe(b);
    expect(simHash64Hex('semiconductor supply chain outlook')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for materially different text', () => {
    const a = simHash64('semiconductor supply chain outlook');
    const b = simHash64('macro rates and inflation policy');
    expect(hammingDistance(a, b)).toBeGreaterThan(3);
  });
});

describe('dedupeEvidenceByNearHash', () => {
  it('removes near-duplicate packages', () => {
    const packages = [
      pkg('Chip demand steady', 'Foundry utilization remains firm across leading nodes.'),
      pkg('Chip demand steady', 'Foundry utilization remains firm across leading nodes.'),
      pkg('Oil producers cut guidance', 'Energy majors reduce capex amid softer demand.'),
    ];

    const deduped = dedupeEvidenceByNearHash(packages, 3);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.title).toBe('Chip demand steady');
    expect(deduped[1]?.title).toBe('Oil producers cut guidance');
  });
});
