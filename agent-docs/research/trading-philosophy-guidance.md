# Trading Philosophy Guidance

## Metadata

- owner: research / product
- lastUpdated: 2026-07-17
- status: phase_1_guidance
- sources:
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/packages/db/src/seed/catalogs/seeded-strategy-catalog.json`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/research/v1-reference/tier-lever-and-bounded-range-reference.md` (read-only)
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/testing/philosophy-axis-taxonomy.md`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/product/product-spec.md`

## Purpose

Operator-facing guidance for how **trading philosophy** (natural language intent + module
configuration) relates to deterministic system behavior in hftr-v2.

This document frames trading as **multi-objective and constraint-bound**: strategy nomination,
execution quality, risk controls, and compliance posture are co-equal. It does **not** promise
returns, optimal performance, or live-readiness from paper experiments.

---

## 1. What "philosophy" means in hftr-v2

A company philosophy is not a single strategy. It is a **declaration bundle**:

| Layer | What the operator provides | What the system derives |
| --- | --- | --- |
| Language | `philosophy_prompt`, goals, reinvestment policy | Research tone, trend bias (M2+), axis hints |
| Topology | Template + canvas modules | Data flow, verification attachments, fund routes |
| Scope | `topic_sectors`, instruments, feed class | Nomination universe, entitlement truthfulness |
| Capital | Seed, per-module allocations (ValueRefs) | Sizing inputs — never model-emitted |
| Risk posture | Strategy families + future band positions | Lever positions inside immutable guardrails |
| Compliance | Policy modules, mode=paper | Session legality, language lint, live fail-closed |

Philosophy **constrains** the pipeline; it does not bypass guardrails, verification, or session law.

---

## 2. Multi-objective framing (no guaranteed returns)

Every philosophy should be read against four objectives simultaneously:

```text
        Strategy nomination          Execution quality
               \                         /
                \                       /
                 ▼                     ▼
            ┌─────────────────────────────┐
            │   Declared philosophy       │
            │   (axes + modules)          │
            └─────────────────────────────┘
                 ▲                     ▲
                /                       \
               /                         \
        Risk controls              Compliance posture
```

| Objective | Question the operator asks | System surfaces |
| --- | --- | --- |
| Strategy nomination | What regimes and families fit my beliefs? | Research + trend modules; `strat-*` families |
| Execution quality | How hard should orders press the book? | Execution-tier bands: participation, slippage, IS urgency |
| Risk controls | How much can I lose at once / in aggregate? | Strategic bands + `grd-*` hard caps |
| Compliance | Is this legal, entitled, and honestly labeled? | Session catalog, compliance packages, paper/live gates |

**Conflict is normal.** Aggressive nomination with tight risk caps should produce **smaller live
orders or more `blocked` states**, not guardrail violations. See philosophy-axis-taxonomy
"Conflicting axes" table.

---

## 3. How axes relate to intentions

Map natural-language intentions to slideable axes (full detail:
`/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/testing/philosophy-axis-taxonomy.md`).

| If the operator says… | Primary axes | Catalog / lever anchors |
| --- | --- | --- |
| "Preserve capital" | risk (min), concentration (min), exit_discipline (tight stops) | `risk_per_trade_pct_band` min, `atr_stop_multiplier_band` min |
| "Ride trends" | regime (trend), horizon (longer lookback), entry_style (breakout) | `regime_router_thresholds`, `momentum_lookback_band` max |
| "Quick scalps" | horizon (short time_stop), execution_urgency (high), liquidity (tight slippage) | `time_stop_band` min, `is_urgency_scalar_band` high |
| "Mean reversion only" | regime (revert), entry_style (fade), evidence_bar (higher) | Hurst revert threshold, pairs z-score bands |
| "Don't trade illiquid names" | liquidity (tight), session (regular), research_breadth (narrow) | `max_slippage_bps_band` min, spread ceilings |
| "Scale into winners" | exit_discipline (pyramiding), risk (heat cap) | `pyramiding_band` — default off Tier A |
| "Flat overnight" | session (close flatten), horizon (day) | `time_stop_band` session_close; day trading preset |
| "No shorts" | compliance + tactical order classes | Short branches suppressed — ORD-009 |
| "Research deeply first" | research_breadth (exploration), evidence_bar (Tier A) | curiosity=exploration; slower promotion |

**Phase 1 honesty:** automatic NLP → axis extraction is **not wired**. Operators express intent
via template choice, strategy family, module setup, and explicit **`philosophyProfile` axis sliders**
in the top drawer Philosophy tab (`TopDrawer.tsx`).

### 3.1 Runtime wiring (2026-07-17)

As of 2026-07-17, the synthetic paper spine reads structured axes at promote and compile:

| Stage | File | Behavior |
| --- | --- | --- |
| Promote | `packages/engine/src/handlers/promote.ts` | `resolvePhilosophyControl({ philosophyProfile })` → lever state + sizing basis |
| Compile | `packages/engine/src/pipeline/compile.ts` | `sizingBasisBps` from `philosophySizingBasisBps(risk_appetite)` — not model-emitted |
| Contracts | `packages/contracts/src/philosophy.ts` | `philosophyProfileToLeverState` maps 10 axes → `LeverSetting` band positions |
| UI | `apps/web/components/shell/TopDrawer.tsx` | PATCH company with `philosophyProfile` + `philosophyPrompt` |

Free-text `philosophy_prompt` remains **narrative only** for alignment scoring vector **D**; band
positions come from `philosophyProfile.axes`. Full `S_axis` subscore still waits on M3 lever
resolver wiring (intent-alignment-scoring §8).

---

## 4. Catalog and lever citations

### Strategy families (`seeded-strategy-catalog.json`)

- **Tier A** — highest activation evidence bar; conservative defaults; suited to capital
  preservation philosophies.
- **Tier B** — balanced intraday/swing decomposition.
- **Tier C** — specialized / higher complexity; requires stronger verification discipline.

Families bind `trendLeadBindings`, `hardControls`, and `runtimeControlSurface` band families.
Example day-trading preset references `strat-001` in `ENGINE_TEMPLATES`.

### Bounded ranges (`tier-lever-and-bounded-range-reference.md`)

Bands are **mutable positions inside immutable caps**:

- Strategic: `risk_per_trade_pct_band`, `portfolio_heat_pct_band`, `portfolio_vol_target_band`,
  `sector_concentration_pct_band`, regime thresholds, `vol_shock_regime_band`
- Tactical: `atr_stop_multiplier_band`, `rr_target_ladder`, `time_stop_band`, `pyramiding_band`,
  `branch_order_class_set`
- Execution: `order_type_set`, `tif_set`, `participation_rate_band`, `max_slippage_bps_band`,
  `cancel_replace_band`, `is_urgency_scalar_band`

v2 `LeverSetting` representation:

```ts
{ mode: 'band', bandId: 'risk_per_trade_pct_band', position: 'min' }
```

### Guardrails (`guardrail-recovery-package-catalog.json`)

Immutable packages `grd-001…008` wrap band repositioning. Philosophy cannot disable them.

### Session + broker (`session-constraint-catalog.json`, `broker-policy-envelope-catalog.json`)

Philosophy cannot override:

- Extended/overnight limit-only rules
- Throttle envelopes (`paper_balanced_general_v1`, etc.)
- Trace requirements for audit

---

## 5. Paper vs live honesty

| Topic | Paper | Live (gated) |
| --- | --- | --- |
| Feed | Synthetic or paper entitlement | Production entitlement — must match UI label |
| Slippage / queue | Discounted realism | Broker-native; wider compliance burden |
| Fund movement | Topology visible; movement M1 unwired | Real broker balances |
| Band exercise | May explore min/typical/max inside caps | Starts guarded percentiles (oq-035 live signoff) |
| Alignment claims | UI + config + partial traces | Full O vector + gate checklist |

**Do not** infer live execution quality from paper alignment scores.

---

## 6. Writing a good philosophy prompt

Effective prompts are **constraint-forward**, not return-forward:

**Strong patterns**

- Session posture: "Regular hours only; flat by close."
- Risk: "Small per-trade risk; prefer many uncorrelated names."
- Style: "Enter on retest confirmation; exit on structure break."
- Compliance: "Long-only; no margin; paper until manually reviewed."
- Research: "Prioritize liquid large-cap sectors; ignore microcap rumors."

**Weak / non-actionable**

- "Make money fast" — no axis mapping
- "Always win" — violates compliance baseline
- "Use AI to predict prices" — contradicts NRA and pipeline design
- Specific price targets or dates — must be operator ValueRefs, not prompt literals

The assistant (M2+) may help translate philosophy → axis checklist; M1 assistant is read-only
lookup only (D-022).

---

## 7. Module topology and philosophy fit

| Template | Philosophy fit | Notes |
| --- | --- | --- |
| `blank` | Custom / experimental | Operator owns validation burden |
| `day_trading_starter` | Intraday, flat-by-close, paper execution | Full fund-route topology; movement not wired |
| `trend_research_lab` | Research-heavy, low execution urgency | No trading node — nomination only |
| `engine_day_trading` | Same as starter, inserted mid-life | Requires inline setup per D-024 |

Fund path `holding_fund → math → fund_router → trading` expresses **capital routing intent**.
Deterministic movement is future work — philosophy should not assume transfers occur in M1.

---

## 8. Experiment learnings

> **This section accumulates findings from paper experiments run under
> `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/research/paper-experimentation-protocol.md`.**
> Do not add claims without drift report + scorecard artifacts.

### 8.1 Baselines established

| baseline_ref | template | feed_class | alignment | notes |
| --- | --- | --- | --- | --- |
| EXP-2026-07-17-01 | unit (philosophy control) | synthetic_sim | pass | risk_appetite → sizing BPS; fail-closed levers |
| EXP-2026-07-17-02 | multi-company live-data | — | deferred | blocked on venue adapters |
| EXP-2026-07-17-03 | 3× day_trading_starter | synthetic_sim | pass | min < typical < max quantities; company-scoped traces; unsupported short blocked |

See `testing/experiment-log.md` for full scorecards.

### 8.2 Observed tensions

- Free-text philosophy alone never changed sizing (pre-D-025) — structured axes required.
- Strategy family UI toggles were ignored until promote read `strategyFamilies[0]`.
- Labeling synthetic quotes as `live_feed` created false provenance confidence — fixed to `synthetic_sim`.
- Equal strategy/symbol inputs across three companies preserved the declared risk ordering in
  deterministic quantities. This validates control responsiveness, not expected profitability.
- `capitalAllocationRef` now caps compile budget via `resolveCompileSizingBudget` before risk-axis
  BPS (D-061). Allocation-vs-risk alignment should be scored against that capped budget.

### 8.3 Operator patterns that score well

- Set **risk_appetite** explicitly before promoting; typical is the safe paper default.
- Pair a named strategy family on the trading module with a matching narrative philosophy prompt.
- Keep **compliance_tightness** at typical/max in paper until verification pass rates are measured.

### 8.4 Common drift modes

- Declared aggressive risk but empty `strategyFamilies` → falls back to `trend_following_v1`.
- Declared live-grade provenance while still on synthetic quotes — audit must fail until adapters land.
- Multi-tenant verification leakage via unscoped `/activity` (fixed D-025).

---

## 9. Related workflows

| Task | Document |
| --- | --- |
| Pick test scenarios | `testing/scenario-encyclopedia.md` |
| Map bands to axes | `testing/philosophy-axis-taxonomy.md` |
| Score a run | `testing/intent-alignment-scoring.md` |
| Run an experiment | `research/paper-experimentation-protocol.md` |
| Product behavior | `product/product-spec.md` |
| Number/time safety | `architecture/number-handling.md` |
| Pipeline tiers | `architecture/llm-pipeline.md` |

---

## 10. Compliance reminder

- No guaranteed-returns language in philosophy prompts, UI, or docs.
- Entitlement labels must match adapter reality (HF-008).
- Live trading remains fail-closed until `plans/master-build-plan.md` gates pass.
- Seeded bands cite academic/practitioner literature as **research starting points** — not
  approvals. See tier-lever reference §5 sources.
