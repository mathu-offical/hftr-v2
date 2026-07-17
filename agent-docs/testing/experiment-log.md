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
| Not verified | Multi-company browser cohort; Alpaca/Kalshi live data; IronBee UI exercise of TopDrawer axes |

### Scorecard (unit)

| Axis | Declared | Observed decision | Align? |
|---|---|---|---|
| risk_appetite min | sizing 25 bps | computeQuantity lower than max | yes |
| risk_appetite max | sizing 200 bps | computeQuantity higher | yes |
| strategy family override | opening_range_breakout | control.strategyFamily | yes |
| unknown lever | reject | throws unknown_lever | yes |
| execution lever on strategic | reject | throws out_of_scope | yes |

### Follow-ups

1. Browser cohort: 3 companies with conflicting philosophies → promote → assert controlSnapshot axes + quantity delta
2. Wire `capitalAllocationRef` into sizing when present (higher priority than risk BPS)
3. Playwright flow for philosophy drawer save + promote

### Browser verification (IronBee, 2026-07-17)

- Opened `/companies/{id}` → **Company ▾** → **Philosophy**
- Observed Risk appetite / Diversification / Hold horizon (and other axis) comboboxes + **Save philosophy**
- Set Risk appetite → `max`, saved; GET `/api/companies/{id}` returned `philosophyProfile.axes.risk_appetite: "max"`
- Live switch remains gated (text-first)
- Console: pre-existing React Flow `nodeTypes` warning; Fast Refresh noise during HMR — not philosophy-specific regressions
- Multi-company create blocked in UI when template setup incomplete (D-024 required chips) — unit cohort remains primary evidence for axes→sizing

---

## EXP-2026-07-17-02 — Multi-company live-data cohort (blocked)

| Field | Value |
|---|---|
| Status | deferred |
| Blocker | No Alpaca/Kalshi/Polymarket/Coinbase adapters; quotes remain synthetic |
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
5. **Still deferred:** `capitalAllocationRef` does not yet override risk-axis sizing; live Alpaca,
   Kalshi, Polymarket, and Coinbase cohorts require their milestone adapters and credentials.
