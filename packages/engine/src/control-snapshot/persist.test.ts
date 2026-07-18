import { describe, expect, it } from 'vitest';
import {
  ControlSnapshot,
  DEFAULT_PHILOSOPHY_PROFILE,
  philosophyProfileToLeverState,
} from '@hftr/contracts';
import {
  canonicalControlSnapshotJson,
  controlSnapshotContentHash,
} from './persist';
import { CATALOG_VERSION, LIVE_GATE_BANDS_VERSION } from '../limits/catalog-loader';

const COMPANY_ID = '00000000-0000-4000-8000-000000000003';
const MODULE_ID = '00000000-0000-4000-8000-000000000004';
const CAPTURED_AT = '2026-07-17T12:00:00.000Z';

function sampleWithoutHash() {
  return {
    schemaVersion: 1 as const,
    companyId: COMPANY_ID,
    moduleId: MODULE_ID,
    philosophyProfile: DEFAULT_PHILOSOPHY_PROFILE,
    leverState: philosophyProfileToLeverState(DEFAULT_PHILOSOPHY_PROFILE),
    envelopeVersions: {
      policyEnvelopeVersion: 'paper_balanced_general_v1',
      brokerEnvelopeVersion: 'bpe-001',
      sessionCatalogVersion: CATALOG_VERSION,
      guardrailCatalogVersion: CATALOG_VERSION,
      liveGateBandsVersion: LIVE_GATE_BANDS_VERSION,
    },
    capturedAt: CAPTURED_AT,
  };
}

describe('control snapshot persist hashing', () => {
  it('produces stable content hash for identical input', () => {
    const a = sampleWithoutHash();
    const b = sampleWithoutHash();
    expect(controlSnapshotContentHash(a)).toBe(controlSnapshotContentHash(b));
    expect(controlSnapshotContentHash(a)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes hash when philosophy axes differ', () => {
    const base = sampleWithoutHash();
    const variant = {
      ...base,
      philosophyProfile: {
        ...DEFAULT_PHILOSOPHY_PROFILE,
        axes: { ...DEFAULT_PHILOSOPHY_PROFILE.axes, risk_appetite: 'max' as const },
      },
    };
    expect(controlSnapshotContentHash(variant)).not.toBe(controlSnapshotContentHash(base));
  });

  it('canonical JSON sorts keys deterministically', () => {
    const payload = sampleWithoutHash();
    const json = canonicalControlSnapshotJson(payload);
    expect(json).toBe(canonicalControlSnapshotJson({ ...payload }));
    expect(json.indexOf('"capturedAt"')).toBeLessThan(json.indexOf('"companyId"'));
  });

  it('ControlSnapshot.parse round-trips hashed payload', () => {
    const withoutHash = sampleWithoutHash();
    const contentHash = controlSnapshotContentHash(withoutHash);
    const parsed = ControlSnapshot.parse({ ...withoutHash, contentHash });
    expect(parsed.contentHash).toBe(contentHash);
    expect(parsed.envelopeVersions.brokerEnvelopeVersion).toBe('bpe-001');
    expect(parsed.envelopeVersions.sessionCatalogVersion).toBe(CATALOG_VERSION);
    expect(ControlSnapshot.parse(parsed)).toEqual(parsed);
  });
});
