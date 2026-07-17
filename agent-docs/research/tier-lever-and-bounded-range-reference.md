# Tier Lever and Bounded-Range Reference (hftr-v2)

## Metadata

- owner: research
- lastUpdated: 2026-07-17
- tags: tier_lever_model, bounded_range_bands, live_gates, operating_limits
- freezeState: **testing_baseline_v1_not_live_signoff**
- status: **research baseline — NOT live-trading approval**

Aligned with vendored v1 reference at
`agent-docs/research/v1-reference/tier-lever-and-bounded-range-reference.md` and machine
catalog `packages/db/src/seed/catalogs/live_gate_threshold_bands.json`.

## Purpose

Bounded ranges are mutable **inside** immutable guardrail caps. Legality, verification schemas,
and guardrail package semantics are immutable at runtime (D-029).

## How to read bands

- Expressed as `min / typical / max` unless categorical
- `freezeState: testing_baseline_v1_not_live_signoff` on all families below
- Paper-mode realism penalties apply before treating values as live-facing

---

## Live-gate threshold families (`live_gate_threshold_bands.json`)

### `paper_maturity`

- concept: minimum calendar days of paper trading before live gate checklist may pass
- seeded band: `14 / 30 / 90` calendar days
- use: `paper_maturity_threshold` live gate compares `paperTradingDays` ≥ typical

### `verification_pass_rate`

- concept: share of verification records with `pass` on paper action traces
- seeded band: `0.85 / 0.92 / 0.98` (ratio 0–1)
- use: `verification_pass_rate_threshold` live gate

### `daily_loss_bps`

- concept: daily realized loss cap as basis points of equity — industry drawdown brake practice
- seeded band: `50 / 100 / 200` bps of equity
- literature note: risk-limit overlays are practitioner/regulatory convention, not a single canonical paper
- use: `daily_loss_remaining` operating limit in `packages/engine/src/limits/compute.ts`

### `participation_rate`

- concept: **Almgren & Chriss (2000)** optimal execution participation rate (% of volume)
- seeded band: `3 / 8 / 20` percent — matches execution band envelope in v1 `EXECUTION_BANDS`
- use: live gate posture review and compile-tier `participation_rate_band` lever

---

## Cross-reference to strategic / execution bands

| v2 live-gate family | related lever band | layer |
| --- | --- | --- |
| `participation_rate` | `participation_rate_band` | execution |
| `daily_loss_bps` | `portfolio_heat_pct_band`, guardrail loss caps | strategic / policy |
| `verification_pass_rate` | verification schema pass rate | dispatch / verify |
| `paper_maturity` | paper experiment protocol | company mode |

## Policy rule

Bands inform checklist thresholds and operating-limit envelopes. Live arming still requires fresh
evidence (<24h), bound guardrail packages, and explicit operator arming.
