# Tier Lever and Bounded-Range Reference

## Metadata

- owner: research
- lastUpdated: 2026-05-29
- tags: research, markdown, knowledge_libraries, execution_agent_tier, deterministic_trade_action_layer, tier_lever_model, bounded_range_bands
- linkedIndexes: research-index.json, ../wiki/wiki-index.json, ../architecture/architecture.json
- jsonTerms: knowledge_libraries, execution_agent_tier, deterministic_trade_action_layer, tier_lever_model, bounded_range_bands

This document should stay aligned with seeded-strategy-catalog.json, trend-lead-pattern-library.json, seeded-testing-baseline-defaults.md, runtime-control-profile-derivation.md, execution-microstructure-and-order-quality.md, strategy-risk-control-matrix.md, hft-and-short-term-strategy-compendium.md, ../wiki/tier-lever-model.md, and ../wiki/runtime-control-profiles.md.

## Purpose

The HFTR pipeline refines one progressively-built decision tree across three model-bearing tiers. Each tier sets DETERMINISTIC LEVERS — configs, amounts, order-shape parameters, thresholds, and recovery parameters — inside bounded ranges scoped to its authority. Every lever below deterministic dispatch is then executed model-free.

This reference grounds each tier's levers in current (2026) trade-execution and quant-finance practice and gives each lever a realistic seeded band. Bands are mutable runtime inputs (weights and bounded ranges per oq-009); legality, verification schemas, and guardrail contracts that wrap them are immutable.

Seeded bands support **multi-objective** tuning: strategy nomination (momentum/mean-reversion/pairs), **execution quality** (IS, slippage, participation), **risk** (heat, vol target, stops), and **compliance** (session legality, guardrails). They are research starting points, not live-trading approvals.

## How To Read The Bands

- bands are seeded research starting points, not live-trading approvals; runtime may reposition inside a band but may not widen the immutable caps that wrap it (see runtime-control-profile-derivation.md)
- bands are expressed as `min / typical / max` where a numeric range is meaningful, and as enumerations where the lever is categorical
- percentile positions in seeded-testing-baseline-defaults.md index into these bands; this document defines the underlying band each percentile maps onto
- paper-mode positions must keep the realism penalties described in execution-microstructure-and-order-quality.md before any value is treated as live-facing

## Tier Authority Summary

| Tier | Latency | Owns | Lever classes |
| --- | --- | --- | --- |
| Strategic | long (pre-market, ~3h, on trigger) | cross-symbol / portfolio structure, regime classification, trend nomination | portfolio heat, per-name risk budget, concentration caps, volatility target, regime thresholds, correlation/sympathy gates |
| Tactical | mid (within ~30m) | decision-tree shape for one lead: branches, entries/exits, invalidations, recovery ladders, allowed order classes | ATR stop multiplier, RR target ladder, scale-out fractions, max pullback / invalidation, time stop, re-entry policy, pyramiding policy |
| Execution / compile | short (<=5m) | order-SHAPE parameters for one instruction | order type, time-in-force, participation rate, limit offset / peg, slippage tolerance, fill timeout, cancel/replace policy, child-slice / iceberg sizing |

---

## 1. Strategic Tier Levers (cross-symbol / portfolio)

The strategic tier tracks trends across multiple symbols and sets portfolio-level structure. Its levers are about how much aggregate risk is live, how it is distributed, and which regime the playbook should assume. Volatility targeting at the portfolio level and fixed-fractional risk budgeting at the name level are the two complementary practices it controls.

### 1.1 Per-name risk budget (`risk_per_trade_pct_band`)

- concept: fixed-fractional risk — a constant percentage of equity risked per position, so dollar risk stays steady as equity and volatility change; **Kelly (1956)** growth-optimal fraction informs optional fractional-Kelly overlays (deferred oq-036)
- current practice: beginners/low-capital 0.5–1%, experienced up to 2–3%, with ~1% the common default; weak edge or new system uses 0.5%
- seeded band: `0.25 / 0.75 / 2.0` (% of workspace equity). HFTR's low-entry-capital posture biases toward the low end in paper-first runs
- immutable wrapper: hard per-trade and per-day loss caps from guardrails remain above any band reposition

### 1.2 Portfolio heat (`portfolio_heat_pct_band`)

- concept: sum of simultaneous open risk (sum of per-position risk budgets) capped so correlated positions cannot stack into a single oversized bet; **Grinold & Kahn (2000)** active risk budgeting frames aggregate heat as a portfolio-level constraint on stacked per-name budgets
- seeded band: `1.5 / 4.0 / 8.0` (% aggregate open risk). Tighten in volatility-shock regimes and when correlation across open names is high

### 1.3 Volatility target (`portfolio_vol_target_band`)

- concept: portfolio volatility targeting — **Moreira & Muir (2017)** volatility-managed portfolios scale gross exposure up when realized portfolio sigma is below target and down when above, to hold risk roughly constant across regimes (<https://doi.org/10.1016/j.jfineco.2017.05.012>)
- seeded band: annualized target `8% / 14% / 20%`; exposure scalar = target_vol / realized_vol, clamped to a max gross leverage cap
- note: this is a portfolio-level overlay distinct from per-trade ATR sizing; the two are combined in practice

### 1.4 Concentration caps (`sector_concentration_pct_band`, `max_concurrent_names_band`)

- concept: diversification controls so the low-entry, high-diversification product goal is enforced structurally, not just suggested
- seeded bands: per-sector gross exposure `15% / 30% / 45%`; concurrent names `5 / 15 / 40` depending on capital and per-name minimums
- per-name exposure cap interacts with broker buying-power and PDT/intraday-margin posture (see market-structure-and-regulatory-reform-2026.md and oq-033)

### 1.5 Regime classification thresholds (`regime_router_thresholds`)

- concept: regime detection routes the playbook — trend-following bias in persistent regimes, mean-reversion bias in anti-persistent regimes, risk-off in random-walk / shock regimes
- current-practice quant signals:
  - Hurst exponent H: `H > 0.55` trending (momentum bias), `H < 0.45` mean-reverting (reversion bias), `0.45 <= H <= 0.55` random walk (reduce size / flat). Recompute on a rolling window and recalibrate window/lags for intraday resolution. Persistence priors follow Mandelbrot & Wallis (1969) R/S analysis; Lo & MacKinlay (1988) variance-ratio tests motivate treating non-random-walk structure as a regime **prior**, not a standalone trade signal (<https://doi.org/10.1093/rfs/1.1.41>)
  - ADX(14): `ADX > 25` trending strength, `ADX <= 20–25` ranging. ADX is lagging and direction-agnostic, so it confirms strength but should not stand alone
  - realized-volatility regime: classify low / normal / shock from rolling realized vol; shock regime forces risk-off and reduced size
- seeded thresholds: Hurst trend `0.55`, revert `0.45`; ADX trend `25`, range `20`; treat disagreement between Hurst and ADX as neutral until price/volume/breadth confirm
- **Markov regime switching (Hamilton 1989; Ang & Bekaert 2002; Guidolin & Timmermann 2007):** discrete normal vs bear/shock states bias nomination; bear regimes show higher cross-asset correlation and lower mean returns — tighten `portfolio_heat_pct_band` and suppress sympathy when `vol_shock_regime_band` fires
- boundary: these thresholds bias nomination only; they never soften legality or guardrail enforcement

### 1.5a Volatility shock regime (`vol_shock_regime_band`)

- concept: **Ang & Bekaert (2002)** bear-market regime — realized vol spike vs rolling median signals shock/risk-off; complements Hurst/ADX point estimates
- seeded band: multiplier on median realized vol `1.25 / 1.75 / 3.0`; above typical triggers reduced size, sympathy suppression, and wider `max_slippage_bps_band`
- note: distinct from `portfolio_vol_target_band` (exposure scalar); this is a discrete regime gate

### 1.6 Correlation / sympathy gates (`correlation_health_band`)

- concept: multi-symbol sympathy, lead-lag, and pairs eligibility require correlation to be intact; broken correlation is a veto, not a discount
- seeded band: rolling correlation floor for sympathy eligibility `0.45 / 0.60 / 0.75`; below floor, lead-lag and pairs variants are suppressed

### 1.7 Pairs spread z-score gate (`pairs_spread_zscore_band`)

- concept: **Gatev, Goetzmann & Rouwenhorst (2006)** pairs-trading rule — normalized spread entry at historical divergence (typical 2σ), exit on convergence; used with Engle–Granger/Johansen confirmation
- seeded band: entry z-score `1.5 / 2.0 / 3.0` (σ); pairs pre-screened by minimum normalized-price distance before cointegration tests
- note: distance-only pairs can be spurious (**Krauss 2017**, <https://doi.org/10.1111/joes.12153>); cointegration gate remains mandatory for sympathy activation. Mean-reversion sympathy on sector residuals follows **Avellaneda & Lee (2010)** (<https://doi.org/10.1080/14697680903124632>)

### 1.8 Momentum formation window (`momentum_lookback_band`)

- concept: **Jegadeesh & Titman (1993)** cross-sectional momentum formation horizon (3–12 months academically) scaled to intraday bar count for HFTR nomination
- seeded band: `5 / 20 / 120` bars (intraday proxy per session profile); pairs with Moskowitz et al. (2012) time-series momentum bias tools

---

## 2. Tactical Tier Levers (decision-tree shape)

The tactical tier decomposes one nominated lead into a full decision tree: entries, exits, invalidations, recovery ladders, and which order classes each branch may use. Its levers are volatility-aware risk geometry, not order plumbing.

### 2.1 ATR stop multiplier (`atr_stop_multiplier_band`)

- concept: volatility-based stop distance using Average True Range, so stops sit outside normal noise; position size then follows from risk_per_trade / stop_distance
- current practice: 1.5× aggressive/scalp, 2.0–2.5× intraday sweet spot, 3.0× swing/trend; lookback ATR(14) intraday, ATR(22) for chandelier-style trailing
- seeded band: `1.5 / 2.25 / 3.0` (× ATR); lookback band `ATR(10) / ATR(14) / ATR(22)`
- position-size identity: `position = (equity * risk_per_trade_pct) / (atr * atr_stop_multiplier * point_value)`

### 2.2 Target / reward-to-risk ladder (`rr_target_ladder`)

- concept: scaled exits — take partial profit at fixed R-multiples, slide stop to breakeven after the first target, and trail the remainder to capture extended moves
- current practice: TP1 ~1R take ~50%, TP2 ~2R take ~25%, TP3 ~3–3.5R or trail remainder; move stop to breakeven once TP1 fills
- seeded template: `tp1 = 1.0R (scale 50%)`, `tp2 = 2.0R (scale 25%)`, `tp3 = 3.0R or trail (remainder)`; breakeven-on-TP1 = true
- scale-out fraction band: `25% / 33% / 50%` per tranche

### 2.3 Trailing-stop method (`trail_method_band`)

- concept: ratchet stops that only move in the trade's direction; ATR / chandelier trailing is the standard
- chandelier: `long_stop = highest_high(N) - ATR(N) * mult`, `short_stop = lowest_low(N) + ATR(N) * mult`
- seeded band: trail multiplier `1.5 / 2.5 / 4.0` (× ATR), lookback `N = 14 / 22 / 22`; tighten for short-horizon, widen for trend continuation
- note: Alpaca trailing-stop election is regular-session only, so off-hours protection must use other deterministic controls (see execution-microstructure-and-order-quality.md)

### 2.4 Invalidation criteria (`invalidation_thresholds`)

- concept: explicit structure-based exits that fire before the protective stop when the thesis breaks
- seeded levers: `max_pullback_depth_bps` band (per family), `structure_break = lower_low_after_entry` for continuation families, `failed_retest_count` band `1 / 2 / 3`, `benchmark_freshness_max_ms` for reversion families, `leader_failure_abort` for sympathy families
- every branch must carry at least one invalidation distinct from its hard stop

### 2.5 Time stop (`time_stop_band`)

- concept: cap holding time so a stale thesis is exited even without a price stop, especially in thin sessions where slow drift is costly
- seeded band (intraday): `10 min / 60 min / session_close`; off-hours profiles compress this further

### 2.6 Re-entry policy (`reentry_band`)

- seeded levers: `max_reentry_count` band `0 / 1 / 3`, `reentry_delay` band (cooldown), blackout-aware suppression after invalidation
- re-entries are disabled by default during active blackout or shock regimes

### 2.7 Pyramiding policy (`pyramiding_band`)

- concept: add to winners only on confirmed continuation, with smaller later adds and one pyramid-wide stop protecting the stack
- current practice: add when price advances > ~2× ATR with trend confirmation; later tranches sized smaller; tighter trailing on recent adds
- seeded band: `max_pyramid_levels` `1 / 2 / 3`; add-trigger `>= 1.5–2.0× ATR` advance; add-size decay `0.75×` of prior tranche
- pyramiding is off by default for Tier A activation and enabled only with replay evidence

### 2.8 Allowed order classes per branch (`branch_order_class_set`)

- the tactical tier declares which order classes each branch may compile into (market, limit, stop, stop_limit, trailing_stop, bracket/OTO), constrained by session legality; the execution tier may only pick from this set

---

## 3. Execution / Compile Tier Levers (order shape)

The execution-agent tier compiles one instruction's order shape. It tunes how the order touches the book, not whether the trade should happen. All values must be precision-safe and session-legal before deterministic dispatch.

### 3.1 Order type (`order_type_set`)

- enumeration: `market`, `limit`, `stop`, `stop_limit`, `trailing_stop`; pre-IPO symbols accept limit-only; extended/overnight equities are limit-only
- choice band by liquidity/urgency: marketable limit for liquid high-urgency, passive limit for spread capture, stop/stop_limit for breakout triggers

### 3.2 Time-in-force (`tif_set`)

- enumeration: `DAY`, `GTC`, `IOC`, `FOK`, `OPG`, `CLS` (IOC/FOK/CLS are v2; OPG/CLS gated to Elite Smart Router); crypto supports only `GTC` and `IOC`
- session legality: extended/overnight = `limit` + (`DAY` or `GTC`) + `extended_hours=true` only
- semantics: DAY expires at session end; GTC persists (Alpaca ages at 90 days, so `expires_at` must be traced); IOC fills available-now and cancels remainder; FOK is all-or-nothing immediate
- seeded default by family: liquid intraday continuation = `DAY`; high-conviction immediate = `IOC`; all-or-none block-sensitive = `FOK`; off-hours = `DAY`/`GTC` limit only

### 3.3 Participation rate / POV (`participation_rate_band`)

- concept: percentage-of-volume participation blends a child-sliced order into real-time market volume to limit impact; **Gatheral (2010)** and **Almgren et al. (2005)** square-root impact laws cap participation vs ADV before pacing
- current practice: conservative 5–10%, moderate 10–20%, aggressive 20–30%; start 3–8% for liquid cash, 2–5% midcap; sizing vs ADV: `<1% ADV` simple limit (no algo), `1–5% ADV` VWAP, `>5% ADV` POV 5–10% with a max-duration cap
- seeded band: `3% / 8% / 20%` participation; always pair with a max-duration cap so a thin tape cannot leave the order stuck
- benchmark choice band: VWAP for impact-minimizing liquid flow, TWAP for thin names, Implementation Shortfall for high-conviction arrival-price capture (front-load early, e.g. ~40% in first slice, then decay)

### 3.4 Limit offset / peg (`limit_offset_bps_band`, `peg_mode`)

- concept: where the limit sits relative to NBBO / midpoint; **Roll (1984)** effective spread and **Hasbrouck (1991)** information shares inform passive peg width; midpoint peg reduces adverse selection
- seeded band: aggressive offset (cross toward far side) `0 / +2 / +8` bps for urgency; passive offset (rest behind near side) `-2 / -5 / -15` bps for spread capture; `peg_mode` in `{none, midpoint, primary}`
- precision: limit/stop prices must satisfy two decimals at `>= $1.00` and four decimals below `$1.00`

### 3.5 Slippage tolerance (`max_slippage_bps_band`)

- concept: implementation shortfall guard — reject or escalate when expected/realized slip versus arrival exceeds tolerance; `IS_bps = (P_exec - P_arrival) / P_arrival * 10000`
- seeded band by liquidity/session: liquid regular `5 / 12 / 25` bps; mid/lower-liquidity `15 / 30 / 60` bps; extended/overnight wider still
- breaches route into the phased slippage tree (observe -> constrain -> reprice -> cancel/replace -> escalate)

### 3.6 Fill timeout (`fill_timeout_ms_band`)

- concept: dynamic, agent-policy-set timeout inside bounded ranges; **Amihud (2002)** illiquidity motivates longer timeouts on thin names; on timeout, verify-and-confirm rather than blind resend (a timed-out order may already be routed)
- seeded band: liquid intraday `2000 / 8000 / 30000` ms; thin/off-hours longer; timeout policy changes are trace-logged as contract versions, not ad hoc mutations

### 3.7 Cancel / replace policy (`cancel_replace_band`)

- concept: **Obizhaeva & Wang (2013)** optimal reschedule timing in a limit-order book; FIX cancel/replace preserves queue priority vs cancel+new
- seeded band: `max_cancel_replace_attempts` `1 / 3 / 5`, with bounded cooldown between attempts and jittered backoff; never blind-resend
- each cancel/replace must carry recovery-path attribution in ActionTrace

### 3.7a Adverse-selection guard (`adverse_selection_bps_band`)

- concept: **Glosten & Milgrom (1985)** — bid–ask spread compensates market makers for informed order flow; limit offsets widen when adverse-selection probability is elevated
- seeded band: extra spread cushion `2 / 8 / 25` bps added to passive limit offsets; pairs with midpoint peg (`peg_mode`) to reduce selection cost

### 3.7b Implementation-shortfall urgency (`is_urgency_scalar_band`)

- concept: **Almgren & Chriss (2000)** mean–variance efficient frontier — normalized risk-aversion scalar controls front-loading vs participation pacing on the AC trajectory
- seeded band: `0.2 / 1.0 / 3.0` (unitless); high urgency → shorter horizon / higher early participation; low urgency → TWAP-like pacing
- recovery template `rec-006` re-aligns slices when realized path deviates from scheduled IS trajectory

### 3.7c Recovery backoff (`recovery_backoff_ms_band`)

- concept: cancel/replace round-trip minimization (FIX Order Cancel/Replace vs cancel+new); jittered cooldown between ladder phase attempts
- seeded band: `500 / 2500 / 15000` ms between cancel/replace attempts inside `recoveryLadderTemplates`

### 3.8 Child-slice / iceberg sizing (`child_slice_band`, `iceberg_peak_ratio`)

- concept: large parent orders are sliced; **Obizhaeva & Wang (2013)** liquidity supply in the LOB; iceberg/reserve orders display a small peak with a hidden reserve that replenishes on fill (venue/broker dependent)
- seeded band (where supported): visible peak `5% / 10% / 20%` of parent; child-slice size derived from participation_rate and observed volume; if reserve orders are unsupported by the active adapter, fall back to participation-paced child limits
- note: Alpaca paper does not model queue position, hidden-liquidity priority, or market impact, so iceberg/peg realism is paper-discounted

---

## 4. Cross-Tier Consistency Rules

- bands flow down only inside the allowed set the upstream tier declared: strategic risk budget bounds tactical sizing; tactical `branch_order_class_set` bounds execution `order_type_set`; session legality bounds TIF and order type at every step
- one coherent control snapshot carries the active `WeightEnvelope`, `RangeSeedProfile`, and `GranularityControlProfile` ids plus the chosen band positions, so replay can reconstruct why each lever landed where it did
- conflict resolution follows runtime-control-profile-derivation.md: legality beats ranking, structured evidence beats unstructured, instrument-specific beats generalized bias, simulator-only success cannot widen live-facing bands
- new numeric band signoff for live enablement remains tracked in oq-035; paper-first runs may exercise full bands, live runs start from guarded percentile positions

## 5. Sources

- ATR position sizing and volatility-adjusted sizing: <https://finaur.com/blog/en/risk-management/atr-trading-strategy/>, <https://setup4alpha.substack.com/p/how-to-implement-volatility-adjusted>, <https://blog.traderspost.io/article/position-sizing-algorithms>
- fixed-fractional risk-per-trade ranges and fractional Kelly: <https://adventuresofgreg.com/blog/2026/01/16/risk-per-trade-position-sizing-explained/>
- execution algorithms (VWAP, TWAP, POV, Implementation Shortfall) and participation-rate ranges: <https://positioned.app/traders-glossary/percentage-of-volume-order>, <https://medium.com/@simomenaldo/a-deep-dive-into-execution-algorithms-757d0f77c3d6>, <https://education.signalpilot.io/curriculum/advanced/70-execution-algorithms-twap-vwap.html>
- order types and time-in-force semantics (IOC/FOK/DAY/GTC/OPG/CLS, iceberg, peg): <https://alpaca.markets/learn/13-order-types-you-should-know-about>, <https://www.investopedia.com/terms/t/timeinforce.asp>, <https://www.investopedia.com/terms/i/icebergorder.asp>
- regime detection (Hurst exponent, ADX): <https://fractalcycles.com/guides/trending-vs-ranging-markets>, <https://dev.to/ayratmurtazin/charting-market-rhythms-the-rolling-hurst-exponent-in-python-3ii>
- trailing stops, chandelier exit, scaled exits, pyramiding: <https://stratbase.ai/en/blog/average-true-range-trailing-stop>, <https://www.tradingwithrayner.com/trailing-stop-loss/>, <https://blog.traderspost.io/article/pyramiding-trading-strategies-guide>
- broker order/session constraints and paper realism gaps: <https://docs.alpaca.markets/us/docs/orders-at-alpaca>, <https://docs.alpaca.markets/us/docs/paper-trading>
- optimal execution and IS: Almgren & Chriss (2000) <https://doi.org/10.21314/JOR.2001.041>; Perold (1988); Bertsimas & Lo (1998); Obizhaeva & Wang (2013) <https://doi.org/10.1093/rfs/hht018>; Almgren et al. (2005) square-root impact
- position sizing: Kelly (1956); Moreira & Muir (2017) <https://doi.org/10.1016/j.jfineco.2017.05.012>; Grinold & Kahn (2000)
- momentum: Moskowitz et al. (2012) <https://doi.org/10.1016/j.jfineco.2011.11.003>; Jegadeesh & Titman (1993) <https://doi.org/10.1111/j.1540-6261.1993.tb04702.x>
- regime switching: Hamilton (1989) <https://doi.org/10.2307/1912510>; Ang & Bekaert (2002) <https://doi.org/10.1093/rfs/15.4.1137>; Guidolin & Timmermann (2007) <https://doi.org/10.1016/j.jedc.2006.09.002>
- pairs/cointegration: Gatev et al. (2006) <https://doi.org/10.1093/rfs/hhj020>; Krauss (2017) <https://doi.org/10.1111/joes.12153>; Avellaneda & Lee (2010) <https://doi.org/10.1080/14697680903124632>; Engle & Granger (1987); Johansen (1988)
- microstructure: Kyle (1985); Glosten & Milgrom (1985) <https://doi.org/10.1016/0304-405X(85)90044-3>; Easley & O'Hara (1992); Easley, López de Prado & O'Hara (2012) <https://doi.org/10.1093/rfs/hhs053>; Gatheral (2010) <https://doi.org/10.1080/14697688.2010.502111>; Roll (1984) <https://doi.org/10.1111/j.1540-6261.1984.tb03897.x>; Hasbrouck (1991) <https://doi.org/10.1111/j.1540-6261.1991.tb03743.x>; Amihud (2002) <https://doi.org/10.1016/S0304-405X(02)00065-6>; Cartea, Jaimungal & Penalva (2015)
- non-random-walk / Hurst priors: Lo & MacKinlay (1988) <https://doi.org/10.1093/rfs/1.1.41>; Mandelbrot & Wallis (1969) R/S persistence
