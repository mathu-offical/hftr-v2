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
