import { describe, expect, it } from 'vitest';
import {
  buildMoversUniverse,
  compareCompoundScores,
  extractTickerCandidates,
  passesVerifyCorroboration,
  rankCompoundScores,
  scoreCompoundSymbol,
} from './movers-compound';
import { resolveSuggestionThresholds } from './suggestion-thresholds';

describe('resolveSuggestionThresholds', () => {
  it('uses typical defaults when no profile', () => {
    const t = resolveSuggestionThresholds({});
    expect(t.flatBps).toBe(20);
    expect(t.strongBps).toBe(60);
    expect(t.sourceClass).toBe('typical_defaults');
    expect(t.corroborationMinDomains).toBe(2);
  });

  it('maps tight presets inside envelopes', () => {
    const t = resolveSuggestionThresholds({
      profile: {
        driftFlatPreset: 'tight',
        driftStrongPreset: 'tight',
        universeCapPreset: 'narrow',
        corroborationFloor: 'multi',
      },
    });
    expect(t.flatBps).toBe(12);
    expect(t.strongBps).toBe(40);
    expect(t.universeCap).toBe(8);
    expect(t.corroborationMinDomains).toBe(3);
    expect(t.sourceClass).toBe('llm_profile');
  });

  it('forces strict freshness when evidence_bar max', () => {
    const t = resolveSuggestionThresholds({
      profile: { freshnessPreset: 'default_24h' },
      evidenceBarMax: true,
    });
    expect(t.freshnessWindowMs).toBe(12 * 60 * 60 * 1000);
  });
});

describe('movers-compound', () => {
  const thresholds = resolveSuggestionThresholds({});

  it('ranks higher corroboration first', () => {
    const a = scoreCompoundSymbol(
      {
        symbol: 'AAA',
        relStrengthAbsBps: 80,
        direction: 'up',
        volumeExpansionRatio: 1.2,
        corroborationDomains: 1,
        libraryQueryText: 'AAA semiconductors relative strength',
        corpusTexts: ['relative strength leaders semiconductors'],
        newsCorpusTexts: [],
        macroCorpusTexts: [],
        bookAtCap: false,
        inOpenBook: false,
      },
      thresholds,
    );
    const b = scoreCompoundSymbol(
      {
        symbol: 'BBB',
        relStrengthAbsBps: 25,
        direction: 'up',
        volumeExpansionRatio: 0.8,
        corroborationDomains: 3,
        libraryQueryText: 'BBB semiconductors relative strength',
        corpusTexts: ['relative strength leaders semiconductors'],
        newsCorpusTexts: ['BBB semiconductor supply'],
        macroCorpusTexts: ['risk off macro'],
        bookAtCap: false,
        inOpenBook: false,
      },
      thresholds,
    );
    expect(compareCompoundScores(b, a)).toBeLessThan(0);
    expect(rankCompoundScores([a, b])[0]!.symbol).toBe('BBB');
  });

  it('defaults link bands to low and prefers link coverage in rank order', () => {
    const sparse = scoreCompoundSymbol(
      {
        symbol: 'AAA',
        relStrengthAbsBps: 90,
        direction: 'up',
        volumeExpansionRatio: 2,
        corroborationDomains: 2,
        libraryQueryText: 'AAA',
        corpusTexts: ['AAA'],
        newsCorpusTexts: ['AAA'],
        macroCorpusTexts: [],
        bookAtCap: false,
        inOpenBook: false,
      },
      thresholds,
    );
    const linked = scoreCompoundSymbol(
      {
        symbol: 'BBB',
        relStrengthAbsBps: 10,
        direction: 'up',
        volumeExpansionRatio: 0.5,
        corroborationDomains: 2,
        libraryQueryText: 'BBB',
        corpusTexts: ['BBB'],
        newsCorpusTexts: ['BBB'],
        macroCorpusTexts: [],
        bookAtCap: false,
        inOpenBook: false,
        linkBands: {
          newsLinkBand: 'high',
          libraryLinkBand: 'high',
          trendLinkBand: 'high',
          linkCoverageBand: 'high',
        },
      },
      thresholds,
    );
    expect(sparse.newsLinkBand).toBe('low');
    expect(linked.newsLinkBand).toBe('high');
    expect(rankCompoundScores([sparse, linked])[0]!.symbol).toBe('BBB');
  });

  it('builds universe with SPY and cap', () => {
    const u = buildMoversUniverse({
      sectorPeers: ['NVDA', 'AMD'],
      evidenceSymbols: ['TSM'],
      trendSymbols: ['NVDA'],
      positionSymbols: [],
      fallbackLiquid: ['AAPL'],
      universeCap: 4,
    });
    expect(u[0]).toBe('SPY');
    expect(u.length).toBeLessThanOrEqual(4);
    expect(u).toContain('NVDA');
  });

  it('extracts tickers from evidence text', () => {
    const syms = extractTickerCandidates(
      ['NVDA leads semis while AMD follows'],
      8,
      ['NVDA', 'AMD', 'AAPL'],
    );
    expect(syms).toContain('NVDA');
    expect(syms).toContain('AMD');
  });

  it('only admits allowlisted symbols from free text', () => {
    const syms = extractTickerCandidates(
      ['A CORP filed with EDGAR while BUY rose and MADE highs; $AAPL held'],
      16,
    );
    expect(syms).toEqual(['AAPL']);
  });

  it('verify corroboration respects floor', () => {
    const score = scoreCompoundSymbol(
      {
        symbol: 'SPY',
        relStrengthAbsBps: 0,
        direction: 'flat',
        volumeExpansionRatio: 1,
        corroborationDomains: 1,
        libraryQueryText: 'SPY',
        corpusTexts: ['movers'],
        newsCorpusTexts: [],
        macroCorpusTexts: [],
        bookAtCap: false,
        inOpenBook: false,
      },
      thresholds,
    );
    expect(passesVerifyCorroboration(score, thresholds)).toBe(false);
    const dual = { ...score, corroborationDomains: 2 };
    expect(passesVerifyCorroboration(dual, thresholds)).toBe(true);
  });
});
