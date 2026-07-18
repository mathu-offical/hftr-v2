# SymbolTicker + Market posture visualization (D-109)

## Intent

Universal symbol display for Market posture (and reusable UI-wide): spark + ticker metrics seeded by the **baseline market-awareness algorithm** (synthetic quote walk + movers/trend qualitative bands). No engine module required.

## Color vs non-color

| Cue | Held position | Non-held (watch / mover / trend) |
|-----|---------------|----------------------------------|
| Spark stroke | `--color-ok` / `--color-block` vs avg cost | Neutral ink (no P&L invent) |
| Relevance ticks | Text ticks only | Text ticks + optional orange→lime **fill** |
| Direction | Glyph `▲`/`▼`/`—` + label always | Same |
| Strength | Band word + tick count always | Same |

**Rule:** held up/down **always wins** over watchlist/relevance coloring when cost basis exists.

## Data

- `MarketHubSymbolViz` on positions (+ optional on watch/trend; `movers.itemViz[]`)
- Spark: deterministic `getSyntheticQuote` minute walk (`feedClass: synthetic_sim`) — honest, not invented broker history
- Charts: `MarketHubCharts` slices for allocation pie, watchlist tiers, trend strength, mover directions, source ready/missing

## Components

- `SparklineSvg` — generic path
- `SymbolTicker` — shared row
- `MarketPosturePieChart` / `MarketPostureMetricBars` — dashboard charts

## Safety

Text-first; color reinforces only. Numbers from ValueRef/synthetic quote path only — never LLM digits.
