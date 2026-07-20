import { describe, expect, it } from 'vitest';
import {
  classifyLiveApiSource,
  isQueryLiveApiKind,
  isQueryProcessRoute,
} from './market-hub-live-source-class';

describe('classifyLiveApiSource', () => {
  it('keeps market/news bars and headlines as live streams', () => {
    expect(classifyLiveApiSource({ kind: 'alpaca_bars', domain: 'equity_bars' })).toBe(
      'stream',
    );
    expect(classifyLiveApiSource({ kind: 'alpaca_news', domain: 'equity_news' })).toBe(
      'stream',
    );
    expect(classifyLiveApiSource({ kind: 'gdelt_news', domain: 'news' })).toBe('stream');
    expect(classifyLiveApiSource({ kind: 'fred_macro', domain: 'macro' })).toBe('stream');
    expect(classifyLiveApiSource({ nodeId: 'live:finnhub_news' })).toBe('stream');
  });

  it('classifies Brave / EDGAR as query research APIs', () => {
    expect(classifyLiveApiSource({ kind: 'brave_search', domain: 'web_search' })).toBe(
      'query',
    );
    expect(classifyLiveApiSource({ kind: 'sec_edgar', domain: 'filings' })).toBe('query');
    expect(classifyLiveApiSource({ domain: 'web_search' })).toBe('query');
    expect(classifyLiveApiSource({ processRoute: 'web_search' })).toBe('query');
    expect(classifyLiveApiSource({ processRoute: 'filings' })).toBe('query');
    expect(isQueryLiveApiKind('brave_search')).toBe(true);
    expect(isQueryProcessRoute('web_search')).toBe(true);
  });

  it('resolves query class from adapter / process / cluster node ids', () => {
    expect(classifyLiveApiSource({ nodeId: 'live:brave_search' })).toBe('query');
    expect(classifyLiveApiSource({ nodeId: 'adapter:brave_search:web' })).toBe('query');
    expect(classifyLiveApiSource({ nodeId: 'process:brave_search:fetch' })).toBe('query');
    expect(classifyLiveApiSource({ nodeId: 'cluster:process:web_search' })).toBe('query');
    expect(classifyLiveApiSource({ nodeId: 'cluster:process:filings' })).toBe('query');
    expect(classifyLiveApiSource({ nodeId: 'adapter:alpaca_bars:ohlc' })).toBe('stream');
  });
});
