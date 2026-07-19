import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetUserSettingsCacheForTests,
  invalidateKeyVerify,
  mergeExistenceFromServer,
  needsProbe,
  peekUserSettingsCache,
  providersNeedingVerify,
  removeLlmExistence,
  setKeyVerifyStatus,
  setLlmExistence,
  setResearchExistence,
} from './user-settings-cache';

describe('user-settings-cache', () => {
  beforeEach(() => {
    __resetUserSettingsCacheForTests();
  });

  it('persists existence independently of verify status', () => {
    setLlmExistence([
      {
        provider: 'anthropic',
        keyHint: 'abcd',
        retentionAttested: 'none',
        updatedAt: '2026-07-19T00:00:00.000Z',
      },
    ]);
    setKeyVerifyStatus('anthropic', 'verified');
    invalidateKeyVerify('anthropic');
    const snap = peekUserSettingsCache();
    expect(snap.llmKeys).toHaveLength(1);
    expect(snap.llmKeys[0]?.keyHint).toBe('abcd');
    expect(snap.verify.anthropic).toBeUndefined();
    expect(needsProbe(snap.verify.anthropic)).toBe(true);
  });

  it('does not re-probe verified keys on merge when identity unchanged', () => {
    setLlmExistence([
      {
        provider: 'groq',
        keyHint: 'zzzz',
        retentionAttested: 'none',
        updatedAt: '2026-07-19T00:00:00.000Z',
      },
    ]);
    setKeyVerifyStatus('groq', 'verified');
    const merged = mergeExistenceFromServer({
      llm: [
        {
          provider: 'groq',
          keyHint: 'zzzz',
          retentionAttested: 'none',
          updatedAt: '2026-07-19T00:00:00.000Z',
        },
      ],
      research: [],
    });
    expect(merged.needsVerify).toEqual([]);
    expect(peekUserSettingsCache().verify.groq).toBe('verified');
  });

  it('invalidates verify when keyHint or updatedAt changes', () => {
    setLlmExistence([
      {
        provider: 'mistral',
        keyHint: 'old1',
        retentionAttested: 'none',
        updatedAt: '2026-07-19T00:00:00.000Z',
      },
    ]);
    setKeyVerifyStatus('mistral', 'verified');
    const merged = mergeExistenceFromServer({
      llm: [
        {
          provider: 'mistral',
          keyHint: 'new2',
          retentionAttested: 'none',
          updatedAt: '2026-07-19T01:00:00.000Z',
        },
      ],
      research: [],
    });
    expect(merged.needsVerify).toEqual(['mistral']);
    expect(peekUserSettingsCache().verify.mistral).toBe('unknown');
  });

  it('queues failed and unknown for probe; skips verified_deferred', () => {
    setLlmExistence([
      {
        provider: 'anthropic',
        keyHint: 'a',
        retentionAttested: 'org_zdr',
        updatedAt: 't',
      },
      {
        provider: 'groq',
        keyHint: 'b',
        retentionAttested: 'none',
        updatedAt: 't',
      },
      {
        provider: 'cerebras',
        keyHint: 'c',
        retentionAttested: 'none',
        updatedAt: 't',
      },
    ]);
    setResearchExistence([{ provider: 'brave', keyHint: 'd', updatedAt: 't' }]);
    setKeyVerifyStatus('anthropic', 'verified_deferred');
    setKeyVerifyStatus('groq', 'failed');
    setKeyVerifyStatus('cerebras', 'unknown');
    // brave has no status → needs probe
    expect(providersNeedingVerify(peekUserSettingsCache().llmKeys, peekUserSettingsCache().researchKeys)).toEqual(
      ['groq', 'cerebras', 'brave'],
    );
  });

  it('removeLlmExistence drops row and verify', () => {
    setLlmExistence([
      {
        provider: 'fireworks',
        keyHint: 'ff',
        retentionAttested: 'none',
        updatedAt: 't',
      },
    ]);
    setKeyVerifyStatus('fireworks', 'verified');
    removeLlmExistence('fireworks');
    expect(peekUserSettingsCache().llmKeys).toEqual([]);
    expect(peekUserSettingsCache().verify.fireworks).toBeUndefined();
  });
});
