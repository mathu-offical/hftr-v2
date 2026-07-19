# Canvas connection-point audit (2026-07-18)

**Status:** living — drives port catalogs + default ENGINE wiring  
**Decision:** D-108  
**Related:** chip-zone layout, D-088 labels, D-091 Time hub

## Labeling standard

Info-type labels only (no peer names as primary). Distinct per nature on one card — never two “Data” pins of different natures.

## ModuleType matrix

| Type | Data in | Data out | System in | System out | Time (additive) | Fund | Gaps closed |
|------|---------|----------|-----------|------------|-----------------|------|-------------|
| research | Sources | Findings (master) | — | — | clock_in | Math dock | clock_in additive |
| librarian | Ingest | Evidence | — | Curation→library (data_feed framed system) | clock_in | Math dock | Curation label |
| library | Corpus in | Corpus out (master) | Curation in | — | clock_in | — | clock_in |
| live_api | — | Market feed | — | — | — | — | — |
| trend | Inputs | Signals (master) | Directive in | Trade directive | clock_in | Math dock | — |
| trading | Desk data | Trade data | Execution order | Directive / Verify | clock_in | via Math | — |
| analyzer | Observe | Analysis / Concat / ExecMon | Verify in | Verify out | clock_in | Math dock | emitMode labels |
| policy | — | — | Policy check | Policy directive | clock_in | — | — |
| holding_fund | Capital in | Capital out | — | — | — | fund_route | shelf zone |
| fund_router | Route in | Route out | — | — | — | fund_route | shelf zone |
| math | Calc ref (top) | Calc ref (top) | — | — | — | Fund L/R | no clock_in |
| clock | Clock in | Now | — | — | source | — | clock→time only |
| time | Authority in (L) | Schedule (top) + Time bus (R) | — | — | hub | — | split outs |
| display | Display in | — | — | — | clock_in | — | — |
| simulator | Sim in | Sim data | — | Verify | if bearing | Math dock | — |
| generator | — | Generated | — | — | — | Math dock | — |

## ENGINE template notes

| Template | Zone fit | Link notes |
|----------|----------|------------|
| engine_day_trading | full spine + funds | research→librarian→library→trend→trading→policy (no research→library bypass); seeds `research_market_regime_lab` + `research_desk_aligned`; Session Desk Research inline; Day-Trade Fund Router; Data Hub (D-140/D-153) |
| engine_trend_research | research/data/trend/verify | research→librarian→library→trend; Trend Research Concat to_desk_stream (no Data Hub — research section) |
| trend_research_lab | company starter | mirrors engine_trend_research (specialty_desk + streamDescriptor) |
| research_* | research packs | use-case-specific packs for execution deps (D-153); research→librarian→library only; context-specific Concat names |
| engine_crypto | execution specialty (gated) | seeds `research_crypto_context`; Crypto Fund Router; philosophy→trend |
| engine_prediction | execution specialty | seeds `research_prediction_niche`; Prediction Fund Router |
| engine_long_term | full spine + funds | seeds `research_filings_fundamentals` + `research_event_catalyst`; Paper Horizon Holding Fund |
| engine_hft | empty stub | no research dep until microstructure pack ships |

**Strict librarian spine (D-143):** When a template has both `research` and `library`,
ingest must go `research→librarian→library`. Parallel `research→library` data_feed edges are
forbidden (contract-tested). Research→analyzer fan-in for concat remains allowed.
`topicScope` create/insert inputs fan out to research + librarian + library via
`alsoTargets` so the spine stays scoped together.

**Chrome (D-110 / D-143):** Fn + subtype chips, nature rails/labels, family silhouettes on
dominant agent/control types, Math tool token parity, create-preview bus/group parity —
operators should not need manual cleanup to read a default day-trading or research ENGINE insert.

## Nature map

| Nature | LinkKinds / slots | Visual |
|--------|-------------------|--------|
| data | data_feed (payload) | solid blue |
| system | directive, verification; librarian→library curation | dashed amber/green |
| fund | fund_route | teal |
| time | clock_in, schedule_out, time_bus_out | violet accent |
