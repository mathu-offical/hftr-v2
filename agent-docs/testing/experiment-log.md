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
   (synthetic ATR proxy), RR tp1/tp2 scale-out + tp3, breakeven (spread-buffered),
   `time_stop_band.typical_min`, recovery phase labels on envelopes; tactical trees bind
   catalog recovery ladder phases when `strategyFamily` is set.

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
| Re-verify | executions 200 (2 fills); CDP SUMMARY 14/14 after Trends-before-Posture order; Chrome left on company canvas |
| Alignment | **aligned** for processing UI paths; IronBee CallMcpTool still cannot address extension server id (use CDP attach to same profile) |
| Notes | Disk ~100% full caused `.next` ENOENT / Next churn; prefer nohup Next + clear `.next/cache` when packs fail |
