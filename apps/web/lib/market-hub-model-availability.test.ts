import { describe, expect, it } from 'vitest';
import type { MarketHubModelLiveSource } from '@hftr/contracts';
import {
  isAvailableLiveSource,
  resolveModelTrackCapabilities,
  tracksFromCapabilities,
} from './market-hub-model-availability';

function src(
  partial: Partial<MarketHubModelLiveSource> & Pick<MarketHubModelLiveSource, 'kind' | 'status'>,
): MarketHubModelLiveSource {
  return {
    label: partial.kind,
    domain: 'market',
    authMode: 'research_key',
    canvasBoundCount: 0,
    contributed: false,
    operation: 'idle',
    amount: '0',
    ...partial,
  };
}

describe('market-hub-model-availability (D-163)', () => {
  it('treats ready/public/contributed/bound as available', () => {
    expect(isAvailableLiveSource(src({ kind: 'alpaca_bars', status: 'ready' }))).toBe(true);
    expect(isAvailableLiveSource(src({ kind: 'gdelt_news', status: 'public' }))).toBe(true);
    expect(
      isAvailableLiveSource(src({ kind: 'gdelt_news', status: 'missing_key', contributed: true })),
    ).toBe(true);
    expect(
      isAvailableLiveSource(src({ kind: 'fred_macro', status: 'stub', canvasBoundCount: 1 })),
    ).toBe(true);
    expect(isAvailableLiveSource(src({ kind: 'gdelt_news', status: 'missing_key' }))).toBe(false);
  });

  it('derives tracks from available providers only', () => {
    const caps = resolveModelTrackCapabilities({
      liveSources: [src({ kind: 'alpaca_bars', status: 'ready' })],
      librarySources: [],
    });
    expect(caps.hasEntitle).toBe(true);
    expect(caps.hasCompound).toBe(true);
    expect(caps.hasSector).toBe(false);
    expect(tracksFromCapabilities(caps)).toEqual(['entitle', 'compound', 'daily', 'compose']);
  });

  it('enables sector when a news provider is ready', () => {
    const caps = resolveModelTrackCapabilities({
      liveSources: [src({ kind: 'gdelt_news', status: 'ready' })],
      librarySources: [],
    });
    expect(caps.hasSector).toBe(true);
    expect(tracksFromCapabilities(caps)).toContain('sector');
  });
});
