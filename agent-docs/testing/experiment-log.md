# Paper experiment log

Append-only scorecards for paper-only cohorts. Primary success = **intention alignment**,
not absolute paper P&L. No guaranteed-returns claims.

Protocol: `../research/paper-experimentation-protocol.md`
Scoring: `intent-alignment-scoring.md`

---

## EXP-2026-07-17-01 — Philosophy control plane unit cohort

| Field | Value |
|---|---|
| Status | completed (unit-level) |
| Mode | paper only |
| Quote source | `synthetic_sim` (honest `sourceClass`) |
| Venues | paper_sim (internal) |
| Companies | N/A (pure function cohort) |
| Hypothesis | Slideable `risk_appetite` changes compile sizing BPS; identical profiles replay identically; unknown levers fail closed |
| Declared intent | conservative vs aggressive risk axes; known band catalog only |
| Observed | `philosophy.test.ts` + contracts PhilosophyProfile tests |
| Alignment | **pass** — sizing min 25 bps < max 200 bps; enforceScopeStrict rejects unknown/out-of-scope; snapshots equal |
| Provenance | N/A at unit layer; code path now labels quotes `synthetic_sim` and tags simulator gaps |
| Hard fails | none |
| System fixes from run | wired philosophy→promote/compile; activity verification scoping; simulatorGapTags |
| Philosophy learnings | Risk axis is the highest-leverage intentional control for paper sizing until capitalAllocationRef joins the compile path |
| Not verified | Alpaca/Kalshi live-data cohort (see EXP-02). Multi-company browser cohort and TopDrawer philosophy axes completed in EXP-03 + IronBee |

### Scorecard (unit)

| Axis | Declared | Observed decision | Align? |
|---|---|---|---|
| risk_appetite min | sizing 25 bps | computeQuantity lower than max | yes |
| risk_appetite max | sizing 200 bps | computeQuantity higher | yes |
| strategy family override | opening_range_breakout | control.strategyFamily | yes |
| unknown lever | reject | throws unknown_lever | yes |
| execution lever on strategic | reject | throws out_of_scope | yes |

### Follow-ups

1. **Done (quantity):** EXP-03 asserts min < typical < max fill quantities across three companies.
   **Still open:** assert promote `controlSnapshot` philosophy axes / `sizingBasisBps` in E2E or DB integration
2. **Done (2026-07-18):** `resolveCompileSizingBudget` caps compile budget via
   `capitalAllocationRef` (D-061) before risk-axis BPS — see `balances.ts` + `compile-select.ts`
3. **Done:** Playwright philosophy drawer save + reload (`paper-intent-alignment.spec.ts` test 1)

### Browser verification (IronBee, 2026-07-17)

- Opened `/companies/{id}` → **Company ▾** → **Philosophy**
- Observed Risk appetite / Diversification / Hold horizon (and other axis) comboboxes + **Save philosophy**
- Set Risk appetite → `max`, saved; GET `/api/companies/{id}` returned `philosophyProfile.axes.risk_appetite: "max"`
- Live switch remains gated (text-first)
- Console: pre-existing React Flow `nodeTypes` warning; Fast Refresh noise during HMR — not philosophy-specific regressions
- Later EXP-03 cohort used API create + Playwright promote spine when template Required chips block multi-company UI create

---

## EXP-2026-07-17-02 — Multi-company live-data cohort (blocked)

| Field | Value |
|---|---|
| Status | deferred |
| Blocker | No live-data multi-company E2E cohort yet; Alpaca unit/adapter stubs exist but quotes remain synthetic_sim in paper spine |
| Plan | Activate when M3/M4 adapters + credentials exist; keep paper/demo only |
| Scenario refs | scenario-encyclopedia data provenance + multi-company isolation classes |

---

## EXP-2026-07-17-03 — Three-company synthetic paper intent cohort

| Field | Value |
|---|---|
| Status | completed |
| Mode | paper only; live gate exercised and remained fail-closed |
| Quote source | `synthetic_sim` |
| Venue | `paper_sim` |
| Companies | 3 isolated `day_trading_starter` companies |
| Hypothesis | `risk_appetite` min / typical / max produces strictly increasing deterministic quantities without cross-company trace leakage |
| Declared intent | conservative / balanced / aggressive risk positions; otherwise identical AAPL up-trend inputs |
| Observed | min < typical < max fill quantity; each activity response contained only its own `companyId` and trading module |
| Alignment | **pass** — declared risk ordering matched observed order-size ordering |
| Provenance | every sampled trace used mode=`paper`, venue=`paper_sim`, verification=`pass`, and simulator gap tags `synthetic_quote`, `inline_fill_model`, `no_venue_latency`, `no_partial_fills` |
| Hard fails | none; a separate unsupported NVDA short was blocked with verification=`blocked` and `pre_dispatch_block` |
| Browser evidence | Playwright flow visible in right-panel ledger; IronBee philosophy persistence + text-first live gate passed with zero fresh console errors |

### Verification

- `pnpm --filter @hftr/web exec playwright test e2e/paper-intent-alignment.spec.ts` — 2 passed
- `pnpm --filter @hftr/web test:e2e` — **4/4 passed** (companies + company-workspace + paper-intent)
- `pnpm typecheck` / `pnpm lint` / `pnpm test` — all seven workspaces passed; adapters 18 tests
  including unsupported-action fail-closed cases
- Database drift found during preflight (`llm_policy`, then generated module-name columns);
  migrations 0010 and 0011 applied before rerun
- IronBee (localhost:3001, DEV_AUTH_BYPASS): Company ▾ → Philosophy shows Risk appetite axes +
  Save philosophy; ribbon exposes text-first **Live trading (gated)** while mode remains paper.
  Console buffer still contains historical pre-migration 500s; fresh Playwright suite did not
  reproduce those failures.

### Findings and triage

1. **System fix:** broker adapters previously treated non-order action verbs as sell-like submissions.
   Alpaca mapping now throws and `paper_sim` rejects without a fill or balance mutation.
2. **Test infrastructure:** the full pipeline Playwright gap is closed for the currently shipped
   deterministic synthetic spine; real model and live-data variants remain deferred.
3. **E2E hardening (post-cohort):** `company-workspace.spec.ts` now collapses the right info panel
   before in-node Save setup (panel was intercepting clicks), scopes the trading node by type
   label under generated connection titles, and fills capital via `Capital allocation value`.
   Canvas ignores node-selection when the click target is an in-node control; decorative settings
   icon is no longer a focusable button competing with setup fields. Rename assertions re-scope
   the node locator after the custom title replaces the generated name.
4. **System fix (fill-path provenance):** venue fill finalization (`writeFillTrace`) was writing
   empty `simulatorGapTags` for paper_sim fills, regressing honest provenance on the promote→
   dispatch path. Tags restored via `paperSimGapTags` for paper_sim filled/recovered outcomes.
5. **Done (2026-07-18):** `capitalAllocationRef` now caps compile budget via
   `resolveCompileSizingBudget` before risk-axis BPS. Live Alpaca / Kalshi / Polymarket /
   Coinbase cohorts still require milestone adapters and credentials.
6. **Done (2026-07-18):** Bootstrap mirrors `auto_admitted` catalog seeds into trend-linked
   Strategy Evidence Library shelves so day_trading `evidence_fit` can pass (D-090 preserved).
7. **Done (2026-07-18):** Model-free `maintenance.position_exits` — catalog ATR stop
   (synthetic ATR proxy), RR tp1/tp2 scale-out + tp3, **measurable_gain_take** (fee-aware
   floor), **trail_stop** (chandelier peak ValueRef), breakeven (spread-buffered),
   `time_stop_band.typical_min`, session_close only when opened during open cash hours;
   **D-124** polarization×ATR-risk compile sizing; **D-125** portfolio_heat gate + weighted
   valves. Recovery phase labels on envelopes; tactical trees bind catalog recovery
   ladder phases when `strategyFamily` is set.

---

## EXP-2026-07-18-001 — Paper money-loop + promote after evidence mirror

| Field | Value |
|---|---|
| Status | partial pass |
| Mode | paper only |
| Quote source | `synthetic_sim` |
| Hypothesis | After evidence mirror + limits table fix, promote admits and paper fills; risk ladder sizes qty |
| Observed | Operator buy/sell ladder filled at qty 1/5/20 (round-trip −12¢/share). Promote: `evidence_fit` pass. Risk ladder at $100k seed + ~$388 synth F: qty **1 / 1 / 2** (min/typical/max). Inline drain `failed` often from deferred posture movers, not compile |
| System fixes | Applied missing `realized_pnl_events`; evidence shelf mirror; compile allocation cap; position exits; synthetic regime **directionBias**; promote drain execution-spine-only; movers deferred 30s LOW |
| Alignment | **partial** — core cash loop + promote fills work; risk ladder differentiates at high seed; catalog ATR/RR/session_close exits wired (synthetic ATR) |
| Follow-up (same day) | After regime directionBias + spine-only promote drain: **3/3** single-attempt promote fills, `failed:0`, regime/evidence pass |
| Not verified | Alpaca paper; live atr_stream; IronBee UI (browser closed) |

---

## EXP-2026-07-18-002 — Full user-flow observe + automate refinement

| Field | Value |
|---|---|
| Status | pass with fixes |
| Mode | paper only |
| Hypothesis | End-to-end create→setup→hub→sweep→promote→trade→scan surfaces automated jobs cleanly |
| Observed | Promote fill + gates pass; live gates fail-closed (expected paper); canvas returns `modules` (18); operator trade previously drained **21** jobs (cross-queue); market-hub refresh hung without drained ack; **service-coverage 500** from legacy Neon CHECK `module_service_bindings_source_check` rejecting `user_research_key` |
| System fixes | Migration **0040** drop legacy CHECK + reinstall XOR; trade drain DISPATCH-only; scan RESEARCH-only; market-hub returns `drained`/`drainError` |
| Re-verify | coverage 200 (18 modules); trade claimed 1; scan claimed 1 no deadlineHit; hub_refresh drained 3/3 failed 0 |
| Alignment | **aligned** for observed operator paths after fixes |

---

## EXP-2026-07-18-003 — Persistent headed browser processing-system pass

| Field | Value |
|---|---|
| Status | pass with fixes |
| Mode | paper only |
| Hypothesis | Headed persistent Chrome (CDP :9222) can drive companies → canvas → promote/trade → posture → hub drain without IronBee MCP attach |
| Observed | Promote drain 3/3; hub drain 2/2; live gate + posture panel/overlay; executions previously 500; AAPL buy/sell fills visible |
| System fixes | `UserMenu` → `@/lib/auth-client` (stop importing `@clerk/nextjs/server` into client); executions + timeline skip non-UUID causation refs (`atr_stop_catalog`); CDP scripts under `apps/web/scripts/cdp-*.ts` |
| Re-verify | executions 200 (2 fills); CDP SUMMARY **14/14**; Chrome left on company canvas with posture overlay |
| Alignment | **aligned** for processing UI paths; IronBee CallMcpTool still cannot address extension server id (use CDP attach to same profile) |
| Notes | Disk ~100% full caused `.next` ENOENT / Next churn; prefer nohup Next + clear `.next/cache` when packs fail. Trader desk session flattened NVDA/AAPL via weekend `session_close` at a small loss — fixed by measurable_gain_take priority + skip session_close when opened while cash session already closed. |

---

## EXP-2026-07-18-004 — Opportunistic multi-symbol + POV child-slice drain

| Field | Value |
|---|---|
| Status | pass with refinements |
| Mode | paper only |
| Hypothesis | Deep multi-symbol leverage + full position lifecycle (promote → scale → trim → exit scan) stays fail-closed; POV child slices drain as honest partial fills |
| Observed | Desk `Opp 205933` (`19bb1a62-…`): 8/8 promote drains, 6 operator ETF/names, scale-ins, 12 open symbols, `POST …/positions/exits` drained **27/27**; fee ledger rows present; heat/limits blocked some adds (expected). QQQ qty=6 fill produced **6** child legs + tag `child_slice_drain` after engine reload |
| System fixes | `materializeChildSliceFills` + paper_sim drain; operator qty≥2 POV plan; `POST …/positions/exits`; executions expose `simulatorGapTags`; CDP `cdp-opportunistic-multi.ts` |
| Alignment | **aligned** for paper lifecycle honesty; UI CDP flaky under disk ~100% (Next/CDP ECONNREFUSED) — API path verified |
| Not verified | IronBee MCP attach; credentialed Alpaca atr_stream soak |
| Decisions | D-129; follow-ons closed in D-134 |

---

## EXP-2026-07-18-005 — D-134 lifecycle follow-ons (snapshots / atr_stream / time-spaced drain)

| Field | Value |
|---|---|
| Status | pass (unit) |
| Mode | paper only |
| Hypothesis | Three D-129 follow-ons can ship model-free without breaking compile/dispatch |
| Observed | Parent vitest: **66** tests across control-snapshot, refresh-atr-stream, atr-stream handler, child-drain, position-exits |
| System fixes | Commits `3b87fa4` snapshots, `cd4b377` atr_stream, `42f406c`+`b5f9bd7` time-spaced drain (**0044**) |
| Alignment | **aligned** for paper engine; apply migration **0044** before runtime drains |
| Decisions | D-134 |

---

## EXP-2026-07-18-006 — Heat atr_stream + mid-drain partials + 0044 apply

| Field | Value |
|---|---|
| Status | pass (unit + migrate); atr soak blocked |
| Mode | paper only |
| Hypothesis | Heat gate + drain observability close remaining D-134 follow-ons without live keys |
| Observed | Migration **0044** applied on Neon; portfolio-heat uses per-position ATR; mid-drain writes `partial` traces; atr soak: open positions exist but **no** `companies.brokerConnectionId` → refresh skipped (fail-open) |
| Alignment | **aligned** for heat/partials; atr_stream live bars need broker-bound company |
| Decisions | D-135 |

---

## EXP-2026-07-18-007 — Atr cred discovery + drain ledger↔trace

| Field | Value |
|---|---|
| Status | pass (unit + credentialed soak) |
| Mode | paper only |
| Hypothesis | Owner/module Alpaca fallback unblocks atr_stream without forcing company.brokerConnectionId; per-slice ledger rows can carry partial/filled traceIds |
| Observed | `defaultLoadAlpacaPaperCredentials` returns creds via owner alpaca paper; soak refreshed AAPL/NVDA (`refreshed≥1`, `skipped:0`) on open-position desks; child-drain inserts ledger after partial/filled traces |
| Alignment | **aligned** |
| Decisions | D-137 |

---

## EXP-2026-07-18-007 — Atr cred discovery + drain ledger↔trace

| Field | Value |
|---|---|
| Status | pass (unit + credentialed soak) |
| Mode | paper only |
| Hypothesis | Owner/module Alpaca fallback unblocks atr_stream without forcing company.brokerConnectionId; per-slice ledger rows can carry partial/filled traceIds |
| Observed | `defaultLoadAlpacaPaperCredentials` returns creds via owner alpaca paper; soak refreshed AAPL/NVDA (`refreshed≥1`, `skipped:0`) on open-position desks; child-drain inserts ledger after partial/filled traces |
| Alignment | **aligned** |
| Decisions | D-137 |

---

## EXP-2026-07-19-01 — Paper system verification on Neon cutover (D-158)

| Field | Value |
|---|---|
| Status | API **18/18** + philosophy UI e2e pass; paper-loop UI e2e still flaky on activity poll |
| Mode | paper only |
| Quote source | `synthetic_sim` / paper_sim |
| Venues | paper_sim (internal funds_only) |
| Hypothesis | After cutover to Neon `calm-bird-16964297`, operator trade + promote→fill + elevate fail-closed remain honest and integrable |
| Declared intent | Verify D-122 Phases 1–5 end-to-end on fresh schema; leave `hftr-v2-backup-quota` intact |
| Observed | `paper-system-verify.ts` **18/18**: funds_only fill tags, promote filled_count=2, elevate `broker_policy_block`; contracts/engine/adapters paper unit paths green |
| Alignment | **pass (API + unit)** — Playwright/IronBee UI still closing |
| Provenance | activity tags include `funds_only_routing`, `inline_fill_model`, `no_partial_fills` |
| Hard fails | none on API after local `DATABASE_URL` uses **direct** endpoint (pooled cold path had intermittent `42P10` ON CONFLICT) |
| System fixes from run | DEV_AUTH_BYPASS `POST /api/queue/drain`; e2e drain-while-poll; Company profile toggle-close before live gate; promote probe in verify script |
| Not verified | IronBee DevTools MCP unavailable this session |

---

## EXP-2026-07-19-02 — Paper MarketModel live quote teacher (D-171)

| Field | Value |
|---|---|
| Status | unit **pass**; API paper-system-verify **20/20** |
| Mode | paper only (`funds_only` + `paper_sim`) |
| Quote source | Prefer **fresh** Alpaca IEX paper teacher (≤90s) when owner/module/company paper creds exist; else `synthetic_sim` |
| Venues | `paper_sim` (internal fill; no submitOrder on teacher path) |
| Hypothesis | Extending D-137 credential discovery to fill/compile/exit marks makes paper fills live-data-aware without elevating routing |
| Declared intent | Close D-122 gap: default unbound companies priced from live market model when entitled |
| Observed | `resolveDispatchMarketQuote` unit: owner teacher → live path; stale teacher dropped → synthetic; fail-open. Stale-teacher regression fixed after first blocked verify. API **20/20** with honesty tags `no_queue_position` / `no_market_impact`; this cohort used `synthetic_quote` (no fresh Alpaca teacher for `dev_local_user`) |
| Alignment | **aligned** |
| Decisions | D-171 (extends D-122 / D-137) |
| Provenance | `funds_only_routing`, `inline_fill_model`, `no_venue_latency`, `no_queue_position`, `no_market_impact`, `no_partial_fills` |

### Follow-ups
- Finish green `paper-loop` + `paper-intent-alignment` e2e
- IronBee: TradingConfigForm routing mode + broker bind when MCP available
- After backup quota resets (~2026-08-01), optional `pg_dump`/`pg_restore` if historical rows needed
- ~~Next realism: fuse canvas `live_api` / Data Hub ValueRef marks~~ → **D-177 / EXP-2026-07-19-04**

---

## EXP-2026-07-19-04 — ValueRef fusion + catalog slippage (D-177)

| Field | Value |
|---|---|
| Status | unit **pass**; API paper-system-verify **21/21** (`HFTR_REQUIRE_LIVE_QUOTE=1`) |
| Mode | paper only (`funds_only` + `paper_sim`) |
| Quote source | Adapter → ValueRef marks (`live_api` / alpaca) → owner Alpaca teacher → off-hours rebucket → synthetic |
| Fill model | Catalog `max_slippage_bps_band` + optional √participation impact proxy |
| Venues | `paper_sim` (internal fill; no submitOrder on teacher path) |
| Hypothesis | Persisting trend poll marks and catalog slippage makes paper fills more live-aware and realistically costly without elevating routing |
| Declared intent | Close D-171 follow-ups: ValueRef fusion + honest impact tags + weekend live mark |
| Observed | Owner Alpaca teacher returned IEX last print; weekend stale asOf rebucketed → `live_market_quote` + `prior_session_mark`. `paper-system-verify` **21/21**. Unit: ValueRef helpers, slippage band, off-hours rebucket, RTH stale drop |
| Alignment | **aligned** |
| Decisions | D-177 (extends D-171 / D-122) |
| Provenance | `live_market_quote`, `prior_session_mark`, `no_market_impact` (qty=1), `funds_only_routing` |

### Follow-ups
- RTH soak: fresh ≤90s `live_market_quote` without `prior_session_mark`
- ~~Multi-share path: assert `square_root_impact_proxy`~~ → **D-187 / EXP-2026-07-19-05**
- IronBee UI when MCP available

---

## EXP-2026-07-19-05 — Paper honesty emissions + multi-share impact (D-187)

| Field | Value |
|---|---|
| Status | unit **pass**; API **partial** (new checks green; full suite interrupted by Next hang) |
| Mode | paper only (`funds_only` + `paper_sim`) |
| UI | Executions tab + ticker show Live mark / Prior session / Impact proxy / Child drain / Funds-only |
| Hypothesis | Operators see sim honesty without digging into raw tags; multi-share path proves impact proxy |
| Declared intent | Close D-177 follow-ups for impact assertion + visual honesty emissions |
| Observed | qty=1: `live_market_quote` (+ `prior_session_mark` off-hours). qty=5 partial: `square_root_impact_proxy` + `child_slice_drain` + `time_spaced_child_drain`. Executions GET returns `simulatorGapTags`. Promote/elevate soak interrupted when Next stopped responding |
| Alignment | **aligned** for new surfaces; full 25-check suite re-soak pending stable local Next |
| Decisions | D-187 (extends D-177 / D-167) |
| Provenance | `live_market_quote`, `square_root_impact_proxy`, `child_slice_drain`, `funds_only_routing` |

### Follow-ups
- Re-run full `paper-system-verify` on durable local Next (avoid agent-backgrounded servers)
- IronBee: Executions honesty chips + ticker label
- RTH soak without `prior_session_mark`

---

## EXP-2026-07-19-03 — Sector × day_trading / HFT cohort (D-174)

| Field | Value |
|---|---|
| Status | **partial** — DT 4/4 pass; HFT intermittent under disk/server pressure |
| Mode | paper only (`funds_only`) |
| Hypothesis | Default engines across Semiconductors / Banks / Consumer discretionary / Industrials admit and fill with correct strategy palettes + throttles |
| Declared intent | Exercise full promote/trade spine; refine deterministic cascades from findings |
| Observed | DT desks seeded `strat-001/002/005`, `paper_balanced_general_v1`, paper fills with honesty tags. HFT-SEM fills with `strat-007` + `paper_hft_swarm_v1`. Later HFT cells saw non-fill / Next crash (ECONNREFUSED) under ~100% disk; `company_limit_reached` mitigated by archival |
| System fixes | `runCompileAdmissionCascade`; HFT exit `subtype` wiring; recovery `strat-*` aliases; HFT paper-first feed; cohort archival helper |
| Alignment | **aligned** for DT; HFT defaults improved, soak incomplete |
| Decisions | D-174 |
