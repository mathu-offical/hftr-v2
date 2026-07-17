# Philosophy Axis Taxonomy

## Metadata

- owner: testing / research
- lastUpdated: 2026-07-17
- status: phase_1_intent_alignment
- sources:
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/packages/db/src/seed/catalogs/seeded-strategy-catalog.json`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/packages/db/src/seed/catalogs/session-constraint-catalog.json`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/packages/db/src/seed/catalogs/broker-policy-envelope-catalog.json`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/packages/db/src/seed/catalogs/guardrail-recovery-package-catalog.json`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/research/v1-reference/tier-lever-and-bounded-range-reference.md` (read-only)
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/packages/contracts/src/pipeline.ts` (`LeverSetting`)

## Purpose

This document defines **slideable philosophy axes** — the operator-facing dimensions a company
philosophy prompt and module configs are expected to influence. Each axis maps to one or more
**bounded-range band families** or **enum levers** in the seeded catalogs, then to a v2
`LeverSetting` that the deterministic pipeline may apply.

Axes are **research starting points for paper experimentation**, not live-trading approvals.
No axis position guarantees returns.

## LeverSetting mapping rule (v2)

v2 contracts (`packages/contracts/src/pipeline.ts`) express lever positions as:

```ts
// band position — never a literal number in model output
{ mode: 'band', bandId: string, position: 'min' | 'typical' | 'max' }

// derived value via calculator ops over ValueRefs
{ mode: 'calc', bandId: string, calcOpName: string, args: Record<string, string> }
```

### Mapping pipeline

| Step | Rule |
| --- | --- |
| 1. Philosophy → axis intent | Operator philosophy prompt + module `topic_sectors` / strategy family selection declare intent on axes below. |
| 2. Axis → band family | Each axis row lists `bandId`(s) from `seeded-strategy-catalog.json` → `runtimeControlSurface.boundedRangeFamilies` and `boundedRangeFamilyDefinitions`. |
| 3. Band → position | `min` / `typical` / `max` index into seeded min/typical/max from catalog or tier-lever reference. Percentile profiles (future) index the same bands. |
| 4. Position → layer | Strategic / tactical / execution per `tierLeverModel` ownership in catalog. Out-of-layer settings are **rejected fail-closed** (`out_of_scope`). |
| 5. Application | Accepted settings accumulate on the decision tree as lineage-bearing refinements; dispatch reads the final tree only. |

### Immutable vs mutable

| Class | Examples | Runtime behavior |
| --- | --- | --- |
| **Immutable** | Guardrail packages (`grd-001…008`), verification schemas, session legality matrix, compliance policy packages, platform hard caps above bands, `enforceScopeStrict` lever registry | Cannot widen at runtime; violations → `blocked` / hard-fail in alignment scoring |
| **Mutable inside envelope** | Band **positions** (`min`/`typical`/`max`), weight envelopes inside seeded profiles, broker envelope **selection** within catalog, recovery ladder **phase activation** inside `rec-*` templates | Repositionable per run/refinement; must stay inside immutable caps |
| **Operator input (NRA)** | `capital_allocation_ref`, `target_exit_ref`, seed amount | UI → `operator_input` ValueRefs; never model-emitted numbers |
| **Catalog version** | `catalog_version` bumps | New seeds require explicit migration; old runs replay against version pinned in trace |

---

## Axis families

### 1. Risk (`risk`)

Portfolio and per-name loss appetite. Complements guardrail hard caps — axes bias **band position**, not cap removal.

| Sub-axis | bandId(s) | min / typical / max | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Per-name risk budget | `risk_per_trade_pct_band` | 0.25 / 0.75 / 2.0 % equity | strategic | Position sizing via calc op `position_size`; heat stacking |
| Portfolio heat | `portfolio_heat_pct_band` | 1.5 / 4.0 / 8.0 % open risk | strategic | Concurrent position cap; sympathy suppression when exceeded |
| Volatility target | `portfolio_vol_target_band` | 8 / 14 / 20 % ann. | strategic | Gross exposure scalar vs realized vol |
| ATR stop width | `atr_stop_multiplier_band` | 1.5 / 2.25 / 3.0 × ATR | tactical | Stop distance → size identity |

**LeverSetting examples**

- Conservative: `{ mode: 'band', bandId: 'risk_per_trade_pct_band', position: 'min' }`
- Aggressive (paper only): `{ mode: 'band', bandId: 'risk_per_trade_pct_band', position: 'max' }` — still under `grd-*` hard caps

**REQ links:** D-008 (NRA), `product-spec.md` §Companies policies, `guardrail-recovery-package-catalog.json`

---

### 2. Concentration (`concentration`)

How concentrated vs diversified the book may become.

| Sub-axis | bandId(s) | min / typical / max | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Sector gross exposure | `sector_concentration_pct_band` | 15 / 30 / 45 % | strategic | Sector sleeve caps in nomination |
| Concurrent names | `max_concurrent_names_band` | 5 / 15 / 40 count | strategic | Open position count gate |
| Pairs eligibility | `correlation_health_band` | 0.45 / 0.60 / 0.75 floor | strategic | Sympathy/pairs branch suppression |

**LeverSetting example:** `{ mode: 'band', bandId: 'sector_concentration_pct_band', position: 'typical' }`

---

### 3. Regime (`regime`)

Trend vs mean-reversion vs shock posture.

| Sub-axis | bandId(s) | min / typical / max / enum | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Hurst / ADX thresholds | `regime_router_thresholds` | H trend 0.55, revert 0.45; ADX 25/20 | strategic | Strategy family nomination bias |
| Vol shock gate | `vol_shock_regime_band` | 1.25 / 1.75 / 3.0 × median vol | strategic | Risk-off, heat tighten, sympathy off |
| Regime smoothing | `regime_smoothing_half_life_band` | (catalog) | strategic | Flip-flop damping on regime labels |
| Momentum lookback | `momentum_lookback_band` | 5 / 20 / 120 bars | strategic / tactical | Formation window for CSMOM tools |
| Pairs z-score | `pairs_spread_zscore_band` | 1.5 / 2.0 / 3.0 σ | strategic | Pairs entry gate |

**Note:** Regime axes **bias nomination only** — they never soften session legality or guardrails
(tier-lever reference §1.5).

---

### 4. Horizon (`horizon`)

Holding period and cadence intent.

| Sub-axis | bandId(s) | min / typical / max | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Time stop | `time_stop_band` | 10 min / 60 min / session_close | tactical | Stale-thesis exit |
| Momentum lookback | `momentum_lookback_band` | 5 / 20 / 120 bars | strategic | Nomination horizon proxy |
| Target exit (operator) | `target_exit_ref` (ValueRef) | `timestamp_ms` operator input | n/a (module config) | Module deactivation / flatten policy hook |
| Trading module `exitTimelineDays` | enum in module config | 1 (day) … 365+ | module | Cadence + family filter in `seeded-strategy-catalog.json` |

**LeverSetting example:** `{ mode: 'band', bandId: 'time_stop_band', position: 'min' }` for scalp posture

**REQ links:** D-024 (target exit ValueRef), `m1-sprint-spec.md` module setup

---

### 5. Entry style (`entry_style`)

How entries are triggered and confirmed.

| Sub-axis | bandId(s) | min / typical / max / enum | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Entry confirmation | `entry_confirmation_band` | (catalog) | tactical | Pullback / breakout confirmation depth |
| Retest tolerance | `retest_tolerance_band` | (catalog) | tactical | Failed-retest invalidation |
| Volume confirmation | `volume_confirmation_band` | (catalog) | tactical | Participation filter on entry branch |
| Blackout cooldown | `blackout_cooldown_band` | (catalog) | tactical | Post-event re-entry delay |
| Branch order classes | `branch_order_class_set` | enum set per family | tactical | Allowed compile targets |

Families in `seeded-strategy-catalog.json` (`strat-001` day, `strat-002` swing, etc.) bind default
entry tool ids to these bands.

---

### 6. Exit discipline (`exit_discipline`)

Stops, targets, trails, invalidations.

| Sub-axis | bandId(s) | min / typical / max | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| RR ladder | `rr_target_ladder` | tp1 1R/50%, tp2 2R/25%, tp3 trail | tactical | Scale-out branches |
| Scale-out fraction | `scale_out_fraction_band` | 25 / 33 / 50 % | tactical | Per-tranche exit size |
| Trail multiplier | `trail_multiplier_band` | 1.5 / 2.5 / 4.0 × ATR | tactical | Chandelier ratchet |
| Invalidation thresholds | `invalidation_thresholds` | structure / pullback bps | tactical | Thesis-break exits before hard stop |
| Re-entry | `reentry_band` | max 0 / 1 / 3 | tactical | Cooldown after stop-out |

---

### 7. Execution urgency (`execution_urgency`)

How aggressively orders interact with the book.

| Sub-axis | bandId(s) | min / typical / max / enum | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| IS urgency scalar | `is_urgency_scalar_band` | 0.2 / 1.0 / 3.0 | execution | AC trajectory front-loading |
| Participation rate | `participation_rate_band` | 3 / 8 / 20 % | execution | POV pacing |
| Limit offset | `limit_offset_bps_band` | passive −15…aggressive +8 bps | execution | Peg distance |
| Peg mode | `peg_mode` | none / midpoint / primary | execution | Adverse selection cushion |
| Fill timeout | `fill_timeout_ms_band` | 2s / 8s / 30s | execution | Stale order escalation |
| Cancel/replace | `cancel_replace_band` | 1 / 3 / 5 attempts | execution | Recovery ladder pacing |
| Adverse selection | `adverse_selection_bps_band` | 2 / 8 / 25 bps | execution | Spread cushion |

**LeverSetting example:** `{ mode: 'band', bandId: 'is_urgency_scalar_band', position: 'max' }` with
tactical `branch_order_class_set` still limiting to legal types.

---

### 8. Liquidity (`liquidity`)

Book depth and impact assumptions.

| Sub-axis | bandId(s) | min / typical / max | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Max slippage | `max_slippage_bps_band` | 5–25 liquid; 15–60 thin | execution | IS breach → recovery tree |
| Participation rate | `participation_rate_band` | 3 / 8 / 20 % | execution | Thin-tape cap |
| Child slice / iceberg | `child_slice_band`, `iceberg_peak_ratio` | 5 / 10 / 20 % visible | execution | Parent order slicing |
| Session spread ceiling | `session_spread_ceiling_band` | (session catalog) | session overlay | Extended-hours veto |
| Flow toxicity | `flow_toxicity_vpin_band` | (catalog) | tactical | Toxic-flow guard tools |

**Paper honesty:** Alpaca paper does not model queue position or hidden liquidity — paper runs
carry realism penalties per tier-lever reference §3.8.

---

### 9. Recovery (`recovery`)

Behavior after partial fills, rejects, slippage breaches, halts.

| Sub-axis | bandId(s) | min / typical / max | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Recovery backoff | `recovery_backoff_ms_band` | 500 / 2500 / 15000 ms | execution | Ladder phase spacing |
| Cancel/replace policy | `cancel_replace_band` | 1 / 3 / 5 | execution | Obizhaeva–Wang reschedule |
| Recovery ladder ref | `recoveryLadderRef` | `rec-001…006` packages | tactical | Phased slippage / IS realign |
| Pyramiding | `pyramiding_band` | levels 1 / 2 / 3 | tactical | Add-on winners policy |

Source: `guardrail-recovery-package-catalog.json`

---

### 10. Session (`session`)

When and how trading may occur.

| Sub-axis | bandId(s) / source | enum / range | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Session clock state | `session-constraint-catalog.json` | regular / pre / post / overnight / closed | platform | Order-type matrix |
| Order legality | `order_legality_band` | per session row | execution | market vs limit-only |
| TIF set | `tif_set` | DAY, GTC, IOC, FOK, … | execution | Expiry semantics |
| Feed freshness | `feed_freshness_band` | ms TTL | data | Stale quote veto |
| Extended hours flag | module + session | boolean | module config | `extended_hours` on instructions |

**REQ links:** `session-constraint-catalog.json`, D-023 paper topology

---

### 11. Evidence bar (`evidence_bar`)

How much research confirmation a lead needs before nomination.

| Sub-axis | bandId(s) / source | range | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Entry confirmation | `entry_confirmation_band` | catalog | tactical | Branch gating |
| Verification reliability weight | `verification_reliability` driver | strategy catalog weightingDrivers | strategic | Trend→lead promotion threshold |
| Research breadth | module `curiosity` enum | exploration / balanced / exploitation | module | Research cadence + topic fan-out |
| Library coverage | concept graph metrics | qualitative | research | Activation validation inputs |

Maps to `activationTier` (A/B/C) in strategy families — Tier A highest evidence bar.

---

### 12. Capital (`capital`)

Trading capital allocation distinct from LLM operating budgets (D-024).

| Sub-axis | bandId(s) / ref | type | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Module allocation | `capital_allocation_ref` | `operator_input` ValueRef (`usd_cents` or `pct`) | module | Fund router inputs (topology today) |
| Company seed | ledger / credits | `usd_cents` | company | Paper buying power |
| Holding fund policy | `allocationPolicyRef` | e.g. `paper_balanced_general_v1` | module | Sleeve weights into router |
| Trade budget (broker) | `trade_budget_band` | broker catalog | broker envelope | API throttle, not alpha |

**REQ links:** D-024, `operating-budget.ts` / `llm_budgets` (separate meter)

---

### 13. Compliance (`compliance`)

Language, entitlement, and policy truthfulness.

| Sub-axis | source | type | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Compliance overlays | `compliance-policy-package-catalog.json` | immutable packages | platform | Copy lint, entitlement checks |
| Broker envelope | `broker-policy-envelope-catalog.json` | selectable envelope | broker | Throttle + trace requirements |
| Short sale / PDT | guardrails + session | boolean gates | platform | Shorts blocked scenarios |
| Guaranteed-returns language | compliance baseline | hard-fail lint | all surfaces | UI/docs/code scan |

---

### 14. Research breadth (`research_breadth`)

How wide and deep autonomous research runs.

| Sub-axis | source | enum / range | Layer | Deterministic effect surface |
| --- | --- | --- | --- | --- |
| Topic scope | `modules.topic_sectors` | operator text | module | Research/trend filter |
| Curiosity | research module config | exploration / balanced / exploitation | module | Topic fan-out ratio |
| Cadence | module `cadenceMinutes` | minutes | module | Job schedule materialization |
| Sector behavior seeds | `sector-behavior-seed-catalog.json` | per-sector priors | research | Concept tagging bias |

---

## Conflicting axes (expected tension)

Intent-alignment tests deliberately pair opposing axis positions:

| Axis A (min) | Axis B (max) | Expected resolution |
| --- | --- | --- |
| `risk_per_trade_pct_band` min | `pyramiding_band` max | Heat cap blocks stack before per-name budget widens |
| `execution_urgency` max | `liquidity` min (tight slippage) | Slippage tree → cancel/replace, not market chase |
| `regime` trend bias | `entry_style` mean-reversion family | Lower nomination score; no compile without lead |
| `research_breadth` exploration | `evidence_bar` Tier A | Promotion gate fails until verification fields satisfied |
| `horizon` day (`time_stop` min) | `momentum_lookback` max | Tactical tree uses shorter effective window via time stop |

Resolution order (from tier-lever reference §4): **legality > guardrails > structured evidence >
instrument-specific > generalized bias**.

---

## Catalog cross-reference index

| Catalog file | Axes primarily fed |
| --- | --- |
| `seeded-strategy-catalog.json` | risk, regime, horizon, entry, exit, execution, liquidity, evidence |
| `session-constraint-catalog.json` | session, liquidity (extended) |
| `broker-policy-envelope-catalog.json` | compliance, capital (API budgets), execution transport |
| `guardrail-recovery-package-catalog.json` | risk (hard caps), recovery |
| `compliance-policy-package-catalog.json` | compliance |
| `sector-behavior-seed-catalog.json` | research breadth, regime (sector priors) |
| `trend-lead-pattern-library.json` | evidence bar, entry/exit family bindings |

---

## Phase 1 gaps (honest)

| Gap | Status |
| --- | --- |
| v2 `chooseLeverSettings` wired to `LeverSetting` band mode | **Not implemented** — v1 reference uses `{key, value}` literals |
| Philosophy prompt → automatic axis extraction | **Not implemented** — operator declares via module/family selection today |
| Fund router deterministic movement | **Topology only** (D-023) |
| Live band sign-off | Open — paper may exercise full bands; live starts guarded (tier-lever §4) |
