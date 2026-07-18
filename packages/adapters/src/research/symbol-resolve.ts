const TICKER_STOPWORDS = new Set([
  'A',
  'AN',
  'AND',
  'ARE',
  'AS',
  'AT',
  'BE',
  'BY',
  'FOR',
  'FROM',
  'IN',
  'IS',
  'IT',
  'OF',
  'ON',
  'OR',
  'THE',
  'TO',
  'VS',
  'WATCH',
  'WITH',
  'INTO',
  'OVER',
  'UNDER',
  'NEAR',
  'ABOUT',
  'CEO',
  'CFO',
  'IPO',
  'ETF',
  'USD',
  'EUR',
  'GBP',
  'NYSE',
  'SEC',
  'FDA',
  'AI',
  'US',
  'UK',
  'EU',
]);

function addTicker(seen: Set<string>, out: string[], symbol: string): void {
  if (symbol.length < 1 || symbol.length > 5) return;
  if (TICKER_STOPWORDS.has(symbol)) return;
  if (seen.has(symbol)) return;
  seen.add(symbol);
  out.push(symbol);
}

/**
 * Uppercase tickers from `$TICKER` or bare 1–5 letter tokens; deduped, max 12.
 */
export function extractTickerSymbols(text: string): string[] {
  const upper = text.toUpperCase();
  const seen = new Set<string>();
  const out: string[] = [];

  for (const match of upper.matchAll(/\$([A-Z]{1,5})\b/g)) {
    addTicker(seen, out, match[1]!);
    if (out.length >= 12) return out;
  }

  for (const match of upper.matchAll(/\b([A-Z]{1,5})\b/g)) {
    addTicker(seen, out, match[1]!);
    if (out.length >= 12) return out;
  }

  return out;
}
