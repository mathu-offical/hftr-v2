import { describe, expect, it } from 'vitest';
import { mergeTargetLibraryIds } from './research-hub-bind';

describe('mergeTargetLibraryIds', () => {
  it('appends a library id when absent', () => {
    const hubId = '11111111-1111-4111-8111-111111111111';
    expect(mergeTargetLibraryIds([], hubId)).toEqual([hubId]);
    expect(mergeTargetLibraryIds(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], hubId)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      hubId,
    ]);
  });

  it('is idempotent when the library id is already present', () => {
    const hubId = '11111111-1111-4111-8111-111111111111';
    expect(mergeTargetLibraryIds([hubId], hubId)).toEqual([hubId]);
  });
});
