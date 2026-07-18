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
| engine_day_trading | full spine + funds | research→librarian→library→trend→trading→policy; analyzer verify; funds via Math |
| engine_trend_research | research/data/trend/verify | concat to_desk_stream |
| research_* | research packs | librarian→library system-framed; dual research subtypes distinct; research→librarian where ordered |
| engine_crypto / prediction / long_term | same spine specialty | explicit analyzer emitMode |
| engine_hft | empty stub | unchanged |

## Nature map

| Nature | LinkKinds / slots | Visual |
|--------|-------------------|--------|
| data | data_feed (payload) | solid blue |
| system | directive, verification; librarian→library curation | dashed amber/green |
| fund | fund_route | teal |
| time | clock_in, schedule_out, time_bus_out | violet accent |
