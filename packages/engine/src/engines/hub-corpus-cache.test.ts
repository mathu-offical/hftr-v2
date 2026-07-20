import { describe, expect, it } from 'vitest';
import { HubCorpusCache } from '@hftr/contracts';
import {
  assembleHubModuleConfig,
  isHubCorpusCacheFresh,
} from './hub-corpus-cache';

describe('hub-corpus-cache helpers', () => {
  it('preserves compound shelves and merges symlink fields', () => {
    const ownerEngineInstanceId = '11111111-1111-4111-8111-111111111111';
    const nestedModuleIds = ['22222222-2222-4222-8222-222222222222'];
    const symlinks = [
      {
        refLibraryId: '33333333-3333-4333-8333-333333333333',
        role: 'posture_system' as const,
        topicScope: 'system:movers',
        access: 'read_through' as const,
      },
    ];

    const merged = assembleHubModuleConfig(
      {
        shelfOutputs: [
          {
            origin: 'sim_training',
            stream: 'semantic',
            bus: 'data_out',
            enabled: true,
          },
        ],
      },
      {
        ownerEngineInstanceId,
        nestedModuleIds,
        symlinks,
      },
    );

    expect(merged.engineDataHub).toBe(true);
    expect(merged.symlinks).toEqual(symlinks);
    expect(
      (merged.shelfOutputs as Array<{ enabled: boolean }>).some((row) => row.enabled),
    ).toBe(true);
  });

  it('detects fresh vs expired corpus cache', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const fresh = HubCorpusCache.parse({
      schemaVersion: 1,
      hubLibraryId: '44444444-4444-4444-8444-444444444444',
      hubRevision: 'rev',
      refreshedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      slices: [],
      digestIndex: {},
    });
    const stale = HubCorpusCache.parse({
      ...fresh,
      expiresAt: new Date(now.getTime() - 60_000).toISOString(),
    });

    expect(isHubCorpusCacheFresh(fresh, now)).toBe(true);
    expect(isHubCorpusCacheFresh(stale, now)).toBe(false);
  });
});
