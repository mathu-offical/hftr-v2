# Paper HFT engine + microstructure research pack (D-157)

**Status:** implementation  
**Date:** 2026-07-18  
**Decision:** D-157

## Intent

Ship a **usable paper** high-frequency-oriented ENGINE (retail-API framing, not colocated HFT) with:

- Full execution spine (research → librarian → library → live feed → trend → trading → analyzer → policy + funds via Math)
- Use-case research pack `research_microstructure_lab`
- Dedicated throttle baseline `paper_hft_swarm_v1`
- Engine Data Hub family wiring (D-140 / D-153)
- Live remains **fail-closed** (paper mode only; no live gate unlock)

Grounded in product-spec §Trading presets, M5 plan (throttle + swarm sizing), seeded `strat-007` quote/microstructure, `trendPosture: microstructure_swarm`, and academic microstructure literature (Kyle, Glosten–Milgrom, Easley/VPIN) already indexed in seed catalogs.

## Framing (compliance)

Operators see: **“High-frequency-oriented (paper / retail API)”**.  
Docs and UI avoid colocated-HFT claims. Synthetic/paper feeds do not prove live microstructure.

## Templates

### `research_microstructure_lab`

| Module | Config |
|--------|--------|
| Microstructure Context Research | `researchSubtype: microstructure_context` |
| Quote Quality News Research | `external_market_news` |
| Microstructure Librarian | `librarian_relevance` |
| Microstructure Evidence Library | `specialty_evidence` |
| Alpaca Bars Feed | `venue: alpaca`, `feedClass: iex_free` or bars, `pollSeconds: 5` |
| Microstructure Lab Scanner | `trendPosture: research_only`, cadence 5 |
| Microstructure Lab Concat | `to_desk_stream` |

Strict librarian spine; terminal concat → `data_out`.

### `engine_hft` (available: true for paper)

| Module | Config |
|--------|--------|
| Microstructure Desk Research | `microstructure_context` |
| Microstructure Evidence Librarian | `librarian_relevance` |
| Microstructure Evidence Library | `specialty_evidence` |
| High-cadence Market Feed | **Paper-first** `paper_sim` / `synthetic_sim`, `pollSeconds: 5` (Alpaca IEX on bind; D-174) |
| Microstructure Swarm Scanner | `microstructure_swarm`, maxActiveTrends 24, cadence 5 |
| Paper HFT Execution | `subtype: hft`, `strat-007`, exitTimelineDays 0, cadenceMinutes 1 |
| Paper HFT Holding Fund | `allocationPolicyRef: paper_hft_swarm_v1` |
| HFT Fund Router | `policyEnvelopeRef: paper_hft_swarm_v1` |
| HFT Execution Monitor | `verify_loopback` |
| Paper HFT Policy | `paper_hft_swarm_v1` + notes on fail-closed live |

Links: identical to day-trading (D-143).  
Deps: `EXECUTION_ENGINE_RESEARCH_DEPENDENCIES.engine_hft = ['research_microstructure_lab']`.

## Throttle baseline `paper_hft_swarm_v1`

Paper-only testing baseline: elevated MD/stream budgets for swarm watching; bounded trade req/min and low burstCap so retail-API abuse fails closed. Live unlock still requires M5 live gate.

## Novel stable enforcement

1. Immutable guardrail packages (microstructure class) remain model-free at dispatch  
2. Verify loopback + policy directive on every swarm path  
3. Policy envelope version on traces  
4. Data Hub nests research libraries; query → trading; returns → hub  

## Out of scope

- Live HFT arming  
- Colocation / sub-ms matching  
- Cadence below contract mins without a separate contracts decision  
