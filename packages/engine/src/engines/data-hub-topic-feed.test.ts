import { describe, expect, it } from 'vitest';
import { ingestHubTopicCandidate, mirrorHubTopicToAttachedResearch } from './data-hub-topic-feed';

describe('data-hub-topic-feed exports (D-216)', () => {
  it('exports ingest + mirror helpers', () => {
    expect(typeof ingestHubTopicCandidate).toBe('function');
    expect(typeof mirrorHubTopicToAttachedResearch).toBe('function');
  });
});
