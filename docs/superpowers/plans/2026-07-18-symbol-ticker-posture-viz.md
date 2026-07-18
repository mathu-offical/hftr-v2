# SymbolTicker + posture viz Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Shared SymbolTicker + posture charts seeded from baseline market hub algorithm (D-109).

**Architecture:** Extend `MarketHubResponse` with `MarketHubSymbolViz` + `MarketHubCharts`; hub API builds sparks via synthetic quote walk; UI SVG components; held P&L color wins.

**Tech Stack:** Zod contracts, engine `getSyntheticQuote` + `createFixedClock`, React SVG (no chart lib).

## Global Constraints

- Held up/down color wins over relevance orange/lime
- Every metric has non-color encoding (glyph, band word, ticks)
- Never invent broker mark history; synthetic sparks labeled `synthetic_sim`
- Text-first status; no LLM digits

---

### Task 1: Contracts
- [ ] Add `MarketHubSymbolViz`, `MarketHubCharts` to market-hub.ts
- [ ] Attach viz to positions; itemViz on movers; charts on response

### Task 2: Engine spark helper
- [ ] `buildSyntheticSparkSeries` + tests
- [ ] Export from index

### Task 3: Hub API seed
- [ ] Project viz + charts in market-hub route

### Task 4: UI components
- [ ] SparklineSvg, SymbolTicker, PieChart, MetricBars
- [ ] Wire overlay + panel
- [ ] Tokens + format helpers + tests

### Task 5: Docs + verify
- [ ] ui-spec, decisions-log D-109
- [ ] typecheck/tests/commit
