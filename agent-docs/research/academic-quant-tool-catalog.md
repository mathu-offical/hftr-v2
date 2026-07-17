# Academic Quant Tool Catalog (hftr-v2)

## Metadata

- owner: research
- lastUpdated: 2026-07-17
- tags: research, deterministic_tool_catalog, bounded_range_bands, live_gates, guardrails, operating_limits
- status: **research baseline — NOT live-trading approval**

This document maps deterministic tool and limit families to academic and practitioner literature.
Seeded bands in `packages/db/src/seed/catalogs/` and `tier-lever-and-bounded-range-reference.md`
are starting points for paper experimentation only.

Aligned with vendored v1 reference at `agent-docs/research/v1-reference/academic-quant-tool-catalog.md`.

## Purpose

HFTR's model-bearing tiers select among deterministic tools and bounded levers; dispatch and
verification below compile remain model-free. This catalog explains **why** limit and guardrail
families exist — not whether they are approved for live trading.

## Live-gate and operating-limit families

| family | tool / limit id | literature / practice | freezeState |
| --- | --- | --- | --- |
| Volatility-managed exposure | `portfolio_vol_target_band` | **Moreira & Muir (2017)** — volatility-managed portfolios scale gross exposure by target/realized vol. <https://doi.org/10.1016/j.jfineco.2017.05.012> | testing_baseline_v1_not_live_signoff |
| Optimal execution participation | `participation_rate_band`, `participation_rate` (live gate) | **Almgren & Chriss (2000)** — optimal execution balances market impact vs timing risk via participation rate. Practitioner IS frameworks (Perold 1988). | testing_baseline_v1_not_live_signoff |
| Fractional Kelly sizing | `risk_per_trade_pct_band` | **Kelly (1956)** — optimal growth fraction; HFTR defers fractional-Kelly auto-signoff (research note only). | testing_baseline_v1_not_live_signoff |
| Drawdown / daily loss brakes | `daily_loss_bps` (live gate), guardrail heat caps | Industry practice: daily loss limits and portfolio heat brakes (CFTC/regulatory risk controls, prop-shop drawdown policies). Not a single canonical paper — treated as compliance/risk overlay. | testing_baseline_v1_not_live_signoff |
| Session legality | `session_constraints` catalog, `grd-007` | Exchange session rules and order-type matrices; deterministic legality at dispatch (v1 session catalog). | testing_baseline_v1_not_live_signoff |
| Guardrail packages | `guardrail_packages` catalog | Immutable failure semantics + recovery ladders; block/defer/reroute without model discretion below compile. | immutable at runtime |

## Pipeline tools (summary)

See v1 reference §1 for full run-node spine. Key execution-quality grounding:

- **compile_instruction** → Almgren–Chriss participation / IS order-shape choice
- **submit_and_verify** → Perold (1988) implementation shortfall as verification metric
- **set_portfolio_vol_target** → Moreira–Muir vol targeting overlay

## Policy rule

Literature citations explain design intent. **No citation implies live approval.** Live arming
requires fresh `live_gate_evidence`, operator `live_armed_at`, and passing deterministic
checklist (D-029).
