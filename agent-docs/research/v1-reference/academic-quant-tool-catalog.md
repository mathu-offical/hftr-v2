# Academic Quant Tool Catalog

## Metadata

- owner: research
- lastUpdated: 2026-05-29
- tags: research, markdown, knowledge_libraries, tier_lever_model, bounded_range_bands, deterministic_trade_action_layer, execution_agent_tier, deterministic_tool_catalog, literature_registry
- linkedIndexes: research-index.json, ../wiki/wiki-index.json, ../architecture/architecture.json
- jsonTerms: knowledge_libraries, tier_lever_model, bounded_range_bands, deterministic_trade_action_layer, execution_agent_tier

This document should stay aligned with [tier-lever-and-bounded-range-reference.md](tier-lever-and-bounded-range-reference.md), [seeded-strategy-catalog.json](seeded-strategy-catalog.json), [trend-lead-pattern-library.json](trend-lead-pattern-library.json), [execution-microstructure-and-order-quality.md](execution-microstructure-and-order-quality.md), [hft-and-short-term-strategy-compendium.md](hft-and-short-term-strategy-compendium.md), [runtime-control-profile-derivation.md](runtime-control-profile-derivation.md), [../wiki/tier-lever-model.md](../wiki/tier-lever-model.md), [../wiki/executable-state-model.md](../wiki/executable-state-model.md), and [../architecture/trading-engine-implementation-spec.md](../architecture/trading-engine-implementation-spec.md).

## Purpose

HFTR's model-bearing tiers do not emit discretionary trades. They select among **deterministic tools** — fixed pipeline steps and bounded **levers** — that refine one decision tree and an **executable state** (`watch` / `wait` / `order` / `blocked` / `fallback`). This catalog maps each tool class to academic and practitioner literature so seeds, wiki pages, and code agents can cite why a lever or transition exists and which band family it binds to.

Deterministic dispatch and trade verification remain model-free below the execution-agent tier. Guardrails, legality, and verification schemas are immutable; weights and band positions inside seeded envelopes are mutable (see [tier-lever-and-bounded-range-reference.md](tier-lever-and-bounded-range-reference.md)).

HFTR treats **strategy outcomes**, **execution quality** (implementation shortfall, slippage, fill quality), **risk controls** (heat, vol target, stops), and **compliance posture** (session legality, guardrails, verification) as co-equal objectives. Literature citations here explain why a lever or transition exists; they are **research starting points**, not live-trading approvals.

## How To Read This Catalog

| Column | Meaning |
| --- | --- |
| `tool_id` | Stable id in `seeded-strategy-catalog.json#/deterministicToolCatalog` or pipeline `TOOL_REGISTRY` |
| `tier_scope` | `strategic`, `tactical`, `execution`, `pipeline`, or `state` (executable-state transitions) |
| `band_ref` | Bounded-range family in seeded catalogs (when applicable) |
| `literature` | Primary academic or practitioner grounding (not an approval to trade live) |

Pipeline tools advance the run-node spine; lever tools reposition values inside bands; state tools move executable status without bypassing verification.

---

## 1. Pipeline Tools (run-node spine)

These tools are fixed in `apps/hftr-web/src/lib/pipeline/nodes/registry.ts` and described in [../architecture/trading-engine-implementation-spec.md](../architecture/trading-engine-implementation-spec.md). The agent at each `NodeKind` chooses among them; the orchestrator executes them deterministically.

| tool_id | node_kind | produces | literature / practice |
| --- | --- | --- | --- |
| `seed_research_topics` | root | research_topic | Research-program design: structured decomposition of hypotheses (analogous to factor “research pipelines” in quant shops); bounded fan-out caps mirror exploration budgets in systematic research. |
| `decompose_topic` | research_topic | research_topic | Hierarchical topic trees for progressive granularity; aligns with knowledge-seeding progressive access in [knowledge-seeding-and-validation-plan.md](knowledge-seeding-and-validation-plan.md). |
| `emit_trends` | research_topic | trend | **Time-series momentum** (Moskowitz, Ooi, Pedersen, 2012): own past returns predict future returns at 1–12 month horizons; HFTR uses shorter intraday windows for nomination bias only. <https://doi.org/10.1016/j.jfineco.2011.11.003> |
| `nominate_leads` | trend | lead | Cross-sectional and lead-lag sympathy: **Gatev–Goetzmann–Rouwenhorst (2006)** distance pairs plus **Engle–Granger (1987)** / **Johansen (1988)** cointegration gates; correlation floor in `correlation_health_band`; spread z-score in `pairs_spread_zscore_band`. <https://doi.org/10.1093/rfs/hhj020> |
| `expand_tree` | lead | tree | Tactical decomposition into branch taxonomy ([seeded-strategy-catalog.json](seeded-strategy-catalog.json) `decisionTreeBranchTaxonomy`); structure-based invalidation distinct from hard stops (practitioner risk geometry). |
| `compile_instruction` | tree | compile | **Optimal execution** order-shape choice: Almgren–Chriss implementation shortfall balances impact vs timing risk; maps to participation, TIF, offset bands. <https://www.smallake.kr/wp-content/uploads/2016/03/optliq.pdf> |
| `dispatch_instruction` | compile | dispatch | Hand-off to model-free broker matrix; no further LLM interpretation. |
| `submit_and_verify` | dispatch | (terminal) | Post-trade verification against immutable schemas; Perold (1988) implementation shortfall as outcome metric. |
| `retune_tree` | loop_refine | compile | Bounded re-analysis on the **same** tree after verification outcomes; **Perold (1988)** implementation-shortfall recovery and **Almgren–Chriss** trajectory realignment via `recoveryLadderTemplates` (including `rec-006`), not a new tree. |

---

## 2. Strategic-Tier Lever Tools (portfolio / multi-symbol)

Authority: cross-symbol structure, regime bias, nomination. Bands: [tier-lever-and-bounded-range-reference.md](tier-lever-and-bounded-range-reference.md) §1.

| tool_id | band_ref | literature / practice |
| --- | --- | --- |
| `set_risk_per_trade_pct` | `risk_per_trade_pct_band` | **Kelly (1956)** optimal-growth fraction bounds fixed-fractional risk; HFTR uses conservative fixed-fractional seeds until replay signs off fractional Kelly (oq-036). Practitioner ranges 0.5–2% per trade; seeds `0.25 / 0.75 / 2.0`. |
| `set_portfolio_heat_pct` | `portfolio_heat_pct_band` | Aggregate open-risk cap; **Grinold & Kahn (2000)** active risk budgeting intuition — sum of per-name budgets must not stack correlated bets. |
| `set_portfolio_vol_target` | `portfolio_vol_target_band` | **Moreira & Muir (2017)** volatility-managed portfolios: scale exposure by `target_vol / realized_vol` with leverage clamp. |
| `set_sector_concentration_pct` | `sector_concentration_pct_band` | Diversification constraint for low-entry capital product goal. |
| `set_max_concurrent_names` | `max_concurrent_names_band` | Cardinality cap on simultaneous positions. |
| `set_regime_router_thresholds` | `regime_router_thresholds` | **Hamilton (1989)** Markov regime switching; **Guidolin & Timmermann (2007)** multivariate calibration target; Hurst persistence and **ADX** as intraday proxies (oq-035). <https://doi.org/10.2307/1912510> |
| `set_realized_vol_shock_threshold` | `vol_shock_regime_band` | **Ang & Bekaert (2002)** bear/shock regime: rolling realized vol vs median; shock tightens heat, sympathy, and participation. <https://doi.org/10.1093/rfs/15.4.1137> **Guidolin & Timmermann (2007)** multivariate regime switching motivates joint vol/correlation gates. <https://doi.org/10.1016/j.jedc.2006.09.002> |
| `set_correlation_health_floor` | `correlation_health_band` | Engle–Granger / Johansen cointegration for pairs and baskets: sympathy only when equilibrium relationship intact. Engle & Granger (1987); Johansen (1988) VECM rank tests. |
| `set_pairs_spread_zscore_gate` | `pairs_spread_zscore_band` | **Gatev et al. (2006)** pairs rule: enter when normalized spread diverges ≥ typical 2σ, exit on convergence; complements cointegration screen. **Krauss (2017)** warns distance-only pairs can be spurious without cointegration confirmation. |
| `screen_pairs_by_normalized_distance` | (derived) | GGR minimum Euclidean distance on normalized price paths for pair nomination before cointegration tests (computational pre-screen); taxonomy per **Krauss (2017)** distance approach. |
| `nominate_momentum_bias` | (derived) | Moskowitz et al. (2012) **time-series** momentum vs cross-sectional momentum (Asness et al., 2013); strategic tier emits bias, not orders. |
| `nominate_cross_sectional_momentum_bias` | (derived) | **Jegadeesh & Titman (1993)** cross-sectional momentum: rank winners/losers relative to peers; 3–12 month formation mapped to intraday bar windows via `momentum_lookback_band`. <https://doi.org/10.1111/j.1540-6261.1993.tb04702.x> |
| `nominate_mean_reversion_bias` | (derived) | **Avellaneda & Lee (2010)** contrarian stat-arb on mean-reverting idiosyncratic residuals; OU / cointegrated spreads; anti-persistent Hurst (`H < 0.45`) bias. Lo & MacKinlay (1988) variance-ratio tests motivate non-random-walk regime priors, not discretionary entry. |

---

## 3. Tactical-Tier Lever Tools (decision-tree geometry)

Authority: branches, entries, exits, invalidations, recovery hooks. Bands: §2 of tier-lever reference.

| tool_id | band_ref | literature / practice |
| --- | --- | --- |
| `set_atr_stop_multiplier` | `atr_stop_multiplier_band` | Volatility-adjusted stops (Wilder ATR); position size = risk budget / (ATR × multiplier). **Gatheral (2010)** transitory impact motivates vol-scaled risk geometry so stop distance tracks liquidity horizon. |
| `set_rr_target_ladder` | `rr_target_ladder` | Scaled exits at R-multiples; breakeven after TP1 (practitioner trade management). |
| `set_scale_out_fraction` | `scale_out_fraction_band` | Partial profit-taking tranches. |
| `set_trail_multiplier` | `trail_multiplier_band` | Chandelier / ATR trailing stop: `highest_high(N) − k×ATR`. |
| `set_time_stop` | `time_stop_band` | Maximum holding horizon; stale-thesis exit. |
| `set_reentry_policy` | `reentry_band` | Bounded re-entries after invalidation; suppressed in blackout/shock. |
| `set_pyramiding_policy` | `pyramiding_band` | Add-to-winner with decay; default off Tier A. |
| `set_invalidation_thresholds` | `invalidation_thresholds` | Structure break before hard stop (thesis failure). |
| `declare_branch_order_classes` | `branch_order_class_set` | Tactical declares allowed order types; execution narrows only. |
| `set_momentum_formation_window` | `momentum_lookback_band` | Jegadeesh–Titman formation/holding horizon scaled to intraday bars; biases trend nomination without emitting orders. |
| `attach_recovery_ladder` | `recoveryLadderTemplates` | Phased slippage / failure ladders: observe → constrain → reprice → cancel/replace → escalate. |
| `advance_recovery_ladder_phase` | `recoveryLadderTemplates` | Deterministic phase promotion on trigger (slippage breach, timeout, partial-fill drift); **Perold IS** measured at each phase boundary. |

Branch types in JSON: `branch-entry-primary`, `branch-entry-retest`, `branch-scale-in`, `branch-target-ladder`, `branch-trail`, `branch-invalidation`, `branch-time-stop`, `branch-reentry`, `branch-recovery`.

---

## 4. Execution-Tier Lever Tools (order shape)

Authority: one instruction's type, TIF, participation, offsets, timeouts. Bands: §3 of tier-lever reference. **Almgren–Chriss** and **Perold IS** frame the objective; **VWAP / TWAP / POV** are practitioner benchmarks.

| tool_id | band_ref | literature / practice |
| --- | --- | --- |
| `set_order_type` | `order_type_set` | Market vs limit vs stop family; **Obizhaeva & Wang (2013)** optimal scheduling in a limit-order book; session legality from [session-constraint-catalog.json](session-constraint-catalog.json). <https://doi.org/10.1093/rfs/hht018> |
| `set_time_in_force` | `tif_set` | DAY / GTC / IOC / FOK semantics; IOC/FOK immediate partial-fill behavior; Cartea–Jaimungal–Penalva (2015) Ch. 10 order-type taxonomy. |
| `set_participation_rate` | `participation_rate_band` | POV (% of volume); **Gatheral (2010)** / **Almgren et al. (2005)** square-root and concave impact laws cap child participation vs ADV. |
| `select_execution_benchmark` | (enum) | VWAP (volume clock), TWAP (time clock), Implementation Shortfall (urgency vs arrival); Almgren–Chriss trajectory as IS minimization. |
| `set_limit_offset_bps` | `limit_offset_bps_band` | Aggressive vs passive peg; **Roll (1984)** effective spread; **Hasbrouck (1991)** information shares inform passive peg width. |
| `set_max_slippage_bps` | `max_slippage_bps_band` | IS guard: `IS_bps = (P_exec − P_arrival) / P_arrival × 10⁴`. |
| `set_fill_timeout_ms` | `fill_timeout_ms_band` | Verify-and-confirm on timeout; **Amihud (2002)** illiquidity motivates longer timeouts on thin names; no blind resend. <https://doi.org/10.1016/S0304-405X(02)00065-6> |
| `set_cancel_replace_policy` | `cancel_replace_band` | Bounded cancel/replace with jittered backoff; **Obizhaeva & Wang (2013)** reschedule/resubmit timing; preserves queue priority vs cancel+new (FIX cancel/replace semantics). |
| `set_adverse_selection_guard_bps` | `adverse_selection_bps_band` | **Glosten & Milgrom (1985)** bid–ask spread / adverse-selection cushion on limit offsets when informed-flow probability is elevated. <https://doi.org/10.1016/0304-405X(85)90044-3> **Easley & O'Hara (1992)** price-adjustment / informed-trade framework; **Easley, López de Prado & O'Hara (2012)** VPIN-style flow-toxicity motivates widening passive pegs in shock regimes (research proxy only). |
| `set_is_urgency_scalar` | `is_urgency_scalar_band` | **Almgren–Chriss** risk-aversion λ proxy: higher scalar front-loads trajectory toward arrival price; lower scalar spreads POV/TWAP slices. |
| `set_recovery_backoff_ms` | `recovery_backoff_ms_band` | Cooldown between cancel/replace attempts in recovery ladders; halves round-trip vs cancel-then-new. |
| `apply_square_root_impact_budget` | `participation_rate_band` | **Kyle (1985)** λ; **Gatheral (2010)** no-dynamic-arbitrage impact; **Almgren et al. (2005)** empirical square-root: cap child size vs ADV before POV pacing. |
| `set_iceberg_peak_ratio` | `iceberg_peak_ratio` | Display size vs hidden reserve; **Obizhaeva & Wang (2013)** liquidity supply in LOB; fallback to paced limits if unsupported. |

---

## 5. Executable-State Transition Tools

Authority: map tree/compile/verification events to operator-visible status. Contract: `packages/contracts/src/executable-state.ts`; transition logic: `apps/hftr-web/src/lib/pipeline/nodes/executable-state.ts`; programmatic rollup: `nodes/executable-summary.ts` (`ExecutableSummary`). Compile path: `compile-pipeline.ts` (`prepareTreeCompile`) before `emit_compile_ready_order` / `emit_compile_blocked`.

| tool_id | from → to | literature / practice |
| --- | --- | --- |
| `emit_tree_shaped_watch` | (none) → `watch` | Branch conditions as **watch intents** (monitoring state until trigger); analogous to conditional orders / alert arms in execution systems. |
| `emit_await_entry_wait` | → `wait` | Explicit delay until `resumeCondition`; matches TWAP/POV schedule “pause until next slice”. |
| `emit_compile_ready_order` | → `order` | Executable instruction ref attached; ready for model-free dispatch. |
| `emit_compile_blocked` | → `blocked` | Legality or precision failure; wait with `recompile_after_retune`. |
| `emit_verification_fallback` | → `fallback` | On `needs_recovery` / `no_fill`: reuse **`lastVerifiedPatternRef`** when present (best validated pattern under stale analysis); else tier retune. Bounded recovery, not discretionary override. |
| `emit_recovery_ladder_active` | → `watch` | Recovery ladder attached (`rec-001`…`rec-006`); operator sees active phase without bypassing verification. |
| `emit_slippage_observe_wait` | → `wait` | **Perold IS** observe phase: pause new slices until slippage vs arrival is re-measured; analogous to TWAP schedule hold. |
| `refresh_last_verified_pattern` | (side effect) | Stores pattern id on `filled` / `partial_fill`; supports “most recent best-validated pattern” product goal. |

**Staleness rule (implemented):** when tier refresh is overdue or evidence freshness fails, status enters `fallback` and execution prefers session-legal `lastVerifiedPatternRef` over a fresh unverified compile until retune completes (oq-037 resolved in `executable-state.ts` / `session-legality.ts`).

---

## 6. Research And Training Loop Tools (first-class processes)

| tool_id | scope | literature / practice |
| --- | --- | --- |
| `run_adhoc_research_query` | research | Progressive catalog queries (`overview` / `analyst` / `lineage`); supports human-in-the-loop and agent curation. |
| `run_long_running_research_track` | research | Continuous validation tracks in strategy/sector catalogs (`researchModes.longRunning`). |
| `run_paper_training_replay` | training | Walk-forward and replay adjust band **positions** inside envelopes, not immutable caps ([seeded-testing-baseline-defaults.md](seeded-testing-baseline-defaults.md)). |
| `apply_control_snapshot_delta` | training | Traceable deltas to `WeightEnvelope` / `RangeSeedProfile` per [runtime-control-profile-derivation.md](runtime-control-profile-derivation.md). |
| `run_regime_switch_calibration` | research | Walk-forward calibration of `regime_router_thresholds` and `vol_shock_regime_band` inside seeded envelopes; **Hamilton (1989)** / **Ang & Bekaert (2002)** / **Guidolin & Timmermann (2007)** methodology, paper-only until replay sign-off (oq-035). |
| `run_pairs_cointegration_screen` | research | Batch Engle–Granger / Johansen screens with GGR distance pre-filter; outputs eligible sympathy/pairs refs for `nominate_leads`. **Krauss (2017)** cointegration vs distance taxonomy. |
| `run_krauss_pairs_taxonomy_review` | research | Offline review of candidate pairs against Krauss (2017) five-framework taxonomy (distance, cointegration, time-series, stochastic control, other); flags distance-only spurious pairs before sympathy activation. |

---

## 7. Decision tree seeding, routing patterns, and tier retune (runtime binding)

The execution-agent tier does not invent pipeline topology. **Routing patterns** (`apps/hftr-web/src/lib/pipeline/nodes/patterns.ts`) seed the allowed `NodeKind` spine and per-stage **toolsets** that match `TOOL_REGISTRY`. The **engine** (`engine.ts`) expands nodes by calling the tool id for each kind (`expand_tree`, `compile_instruction`, …). **Tier retune** (`retune.ts`) repositions levers on the **same** `decisionTreeId` and may enqueue `loop_refine` → `retune_tree` → `compile_instruction` without forking a new tree.

| binding_id | module | feeds (deterministic) | LLM-tier effect |
| --- | --- | --- | --- |
| `bind_routing_pattern_shape` | `patterns.ts` | `DEFAULT_PATTERN` / library patterns set fanout, recursion depth, verification loop caps | Agent selects pattern id; interpreter fixes which tools run at each `NodeKind` |
| `classify_regime_snapshot_for_nomination` | `engine.ts` (`nominate_leads`) | `RegimeSnapshot` + `regime_router_thresholds` order lead families | Strategic bias only; no orders |
| `expand_tree_from_lead` | `engine.ts` (`expand_tree`) | `decisionTreeBranchTaxonomy` branches, tactical lever seeds | Tactical tier later sets ATR/RR/trail bands on this tree |
| `compile_instruction_from_tree` | `engine.ts` (`compile_instruction`) | execution-tier bands → compiled instruction ref | Moves executable state toward `order` when legal |
| `execute_tier_retune_pass` | `retune.ts` | `executeTierRefresh` + `persistTreeRefinement` + `syncExecutableStateAfterTierRetune` | Repositions in-scope levers; may spawn `retune_tree` child |
| `apply_scoped_lever_batch` | `levers.ts` / tier executors | `applyScopedLevers` fail-closed vs `LEVER_REGISTRY` + `bands.ts` | LLM proposes lever deltas; orchestrator applies inside envelope |
| `emit_executable_state_transition` | `executable-state.ts` | maps verification / compile events → `watch`/`wait`/`order`/`blocked`/`fallback` | Operator-visible status; `fallback` prefers `lastVerifiedPatternRef` |

**Seeding flow (one lead):** `bind_routing_pattern_shape` → `emit_trends` → `nominate_leads` (regime + pairs/momentum tools) → `expand_tree` (tactical geometry) → strategic/tactical/execution lever tools on `TreeLeverState` → `compile_instruction` → executable-state tools → model-free `dispatch_instruction` / `submit_and_verify` → on failure `retune_tree` or `execute_tier_retune_pass`.

Indexed in `seeded-strategy-catalog.json#/deterministicToolCatalog/processBindingTools`.

---

## 8. Cross-Tier Consistency (tool composition rules)

1. **Downward closure:** strategic bands constrain tactical sizing; tactical `branch_order_class_set` constrains execution `order_type_set`; session legality constrains all.
2. **One tree:** `retune_tree` and tier refresh mutate levers on the same `decisionTreeId`; they do not fork alternate trees without a new lead node.
3. **Fail-closed levers:** `applyScopedLevers` rejects `out_of_scope`, `out_of_range`, and `unknown_lever` (see `packages/contracts/src/levers.ts`).
4. **Verification gate:** no `order` status bypasses `submit_and_verify`; `fallback` may only replay verified pattern refs or enqueue retune.

---

## 9. Sources (academic and practitioner)

### Optimal execution and implementation shortfall

- Almgren, R., & Chriss, N. (2000). Optimal execution of portfolio transactions. *Journal of Risk*, 3(2), 5–39. DOI: <https://doi.org/10.21314/JOR.2001.041> PDF: <https://www.smallake.kr/wp-content/uploads/2016/03/optliq.pdf>
- Bertsimas, D., & Lo, A. W. (1998). Optimal control of execution costs. *Journal of Financial Markets*, 1(1), 1–50.
- Perold, A. F. (1988). The implementation shortfall approach to trading. *Journal of Portfolio Management*, 14(4), 4–17.
- Obizhaeva, A. A., & Wang, J. (2013). Optimal trading strategy and supply/demand dynamics. *Review of Financial Studies*, 26(8), 3184–3220. <https://doi.org/10.1093/rfs/hht018>
- Almgren, R., Thum, C., Hauptmann, E., & Li, H. (2005). Direct estimation of equity market impact. *Risk*, July 2005, 58–62. (Square-root impact calibration for participation caps.)

### Position sizing and volatility targeting

- Kelly, J. L. (1956). A new interpretation of information rate. *Bell System Technical Journal*, 35(4), 917–926. (Growth-optimal sizing; HFTR defers fractional Kelly to replay oq-036.)
- Moreira, L., & Muir, T. (2017). Volatility-managed portfolios. *Journal of Financial Economics*, 124(1), 22–54. <https://doi.org/10.1016/j.jfineco.2017.05.012>
- Grinold, R. C., & Kahn, R. N. (2000). *Active Portfolio Management* (2nd ed.). McGraw-Hill. (Risk budgeting and heat caps at portfolio level.)

### Momentum and mean reversion

- Moskowitz, T. J., Ooi, Y. H., & Pedersen, L. H. (2012). Time series momentum. *Journal of Financial Economics*, 104(2), 228–250. <https://doi.org/10.1016/j.jfineco.2011.11.003>
- Jegadeesh, N., & Titman, S. (1993). Returns to buying winners and selling losers. *Journal of Finance*, 48(1), 65–91. <https://doi.org/10.1111/j.1540-6261.1993.tb04702.x>
- Asness, C., Moskowitz, T. J., & Pedersen, L. H. (2013). Value and momentum everywhere. *Journal of Finance*, 68(3), 929–985.

### Regime detection

- Hamilton, J. D. (1989). A new approach to the economic analysis of nonstationary time series and the business cycle. *Econometrica*, 57(2), 357–384. <https://doi.org/10.2307/1912510>
- Ang, A., & Bekaert, G. (2002). International asset allocation with regime shifts. *Review of Financial Studies*, 15(4), 1137–1187. <https://doi.org/10.1093/rfs/15.4.1137>
- Guidolin, M., & Timmermann, A. (2007). Asset allocation under multivariate regime switching. *Journal of Economic Dynamics and Control*, 31(11), 3503–3544. <https://doi.org/10.1016/j.jedc.2006.09.002>
- Hurst exponent / ADX practitioner regime routing: see [tier-lever-and-bounded-range-reference.md](tier-lever-and-bounded-range-reference.md) §1.5.

### Cointegration, pairs, and multi-symbol structure

- Engle, R. F., & Granger, C. W. J. (1987). Co-integration and error correction. *Econometrica*, 55(2), 251–276.
- Johansen, S. (1988). Statistical analysis of cointegration vectors. *Journal of Economic Dynamics and Control*, 12(2–3), 231–254.
- Gatev, E., Goetzmann, W. N., & Rouwenhorst, K. G. (2006). Pairs trading: Performance of a relative-value arbitrage rule. *Review of Financial Studies*, 19(3), 797–827. <https://doi.org/10.1093/rfs/hhj020>
- Krauss, C. (2017). Statistical arbitrage pairs trading strategies: Review and outlook. *Journal of Economic Surveys*, 31(2), 513–545. <https://doi.org/10.1111/joes.12153>
- Avellaneda, M., & Lee, J.-H. (2010). Statistical arbitrage in the US equities market. *Quantitative Finance*, 10(7), 761–782. <https://doi.org/10.1080/14697680903124632>

### Microstructure and order placement

- Kyle, A. S. (1985). Continuous auctions and insider trading. *Econometrica*, 53(6), 1315–1335.
- Glosten, L. R., & Milgrom, P. R. (1985). Bid, ask and transaction prices in a specialist market. *Journal of Financial Economics*, 14(1), 71–100. <https://doi.org/10.1016/0304-405X(85)90044-3>
- Gatheral, J. (2010). No-dynamic-arbitrage and market impact. *Quantitative Finance*, 10(7), 749–759. <https://doi.org/10.1080/14697688.2010.502111>
- Roll, R. (1984). A simple implicit measure of the effective bid-ask spread in an efficient market. *Journal of Finance*, 39(4), 1127–1139. <https://doi.org/10.1111/j.1540-6261.1984.tb03897.x>
- Hasbrouck, J. (1991). Measuring the information content of stock trades. *Journal of Finance*, 46(1), 179–207. <https://doi.org/10.1111/j.1540-6261.1991.tb03743.x>
- Amihud, Y. (2002). Illiquidity and stock returns: cross-section and time-series effects. *Journal of Financial Markets*, 5(1), 31–56. <https://doi.org/10.1016/S0304-405X(02)00065-6>
- Back, K., & Baruch, S. (2004). Information in securities markets: Kyle meets Glosten and Milgrom. *Econometrica*, 72(2), 433–465.
- Easley, D., & O'Hara, M. (1992). Time and the process of security price adjustment. *Journal of Finance*, 47(2), 577–604.
- Easley, D., López de Prado, M. M., & O'Hara, M. (2012). Flow toxicity and liquidity in a high-frequency world. *Review of Financial Studies*, 25(5), 1457–1493. <https://doi.org/10.1093/rfs/hhs053>
- Cartea, Á., Jaimungal, S., & Penalva, J. (2015). *Algorithmic and High-Frequency Trading*. Cambridge University Press.
- Lo, A. W., & MacKinlay, A. C. (1988). Stock market prices do not follow random walks: Evidence from a simple specification test. *Review of Financial Studies*, 1(1), 41–66. <https://doi.org/10.1093/rfs/1.1.41>
- Mandelbrot, B. B., & Wallis, J. R. (1969). Robust R/S analysis of long run serial correlation. In *Proceedings of the 37th Session of the ISI* (pp. 59–104). (Hurst exponent persistence prior for `regime_router_thresholds`.)

### HFTR-specific execution and session constraints

- [execution-microstructure-and-order-quality.md](execution-microstructure-and-order-quality.md)
- [session-constraint-catalog.json](session-constraint-catalog.json)
- Alpaca order and paper-trading docs (broker adapter grounding): <https://docs.alpaca.markets/us/docs/working-with-orders>

---

## Related Surfaces And Why They Matter

- [tier-lever-and-bounded-range-reference.md](tier-lever-and-bounded-range-reference.md) defines numeric bands each lever tool must respect.
- [../architecture/trading-engine-implementation-spec.md](../architecture/trading-engine-implementation-spec.md) maps these tools to contracts, APIs, and pipeline modules for code agents.
- [../wiki/executable-state-model.md](../wiki/executable-state-model.md) explains watch/wait/order/fallback for operators.
- [seeded-strategy-catalog.json](seeded-strategy-catalog.json) `#/deterministicToolCatalog` is the machine-readable index of tool ids, `literatureRegistry` keys, and band bindings.
