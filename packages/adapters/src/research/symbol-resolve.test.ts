import { describe, expect, it } from 'vitest';
import { extractTickerSymbols } from './symbol-resolve';

describe('extractTickerSymbols', () => {
  it('extracts dollar-prefixed and bare tickers', () => {
    expect(extractTickerSymbols('Watch $AAPL and MSFT vs NVDA')).toEqual(['AAPL', 'MSFT', 'NVDA']);
  });

  it('dedupes and caps at twelve symbols', () => {
    const text = [
      '$AAA',
      '$BBB',
      'CCC',
      'DDD',
      'EEE',
      'FFF',
      'GGG',
      'HHH',
      'III',
      'JJJ',
      'KKK',
      'LLL',
      'MMM',
      '$AAA',
    ].join(' ');
    expect(extractTickerSymbols(text)).toHaveLength(12);
    expect(extractTickerSymbols(text)[0]).toBe('AAA');
  });

  it('skips common stopwords', () => {
    expect(extractTickerSymbols('THE CEO OF A CO IN US')).toEqual(['CO']);
  });
});
