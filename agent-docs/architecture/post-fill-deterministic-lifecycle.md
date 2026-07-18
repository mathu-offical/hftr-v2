# Post-fill deterministic position lifecycle

**Status:** implemented (paper) · **Owner:** engine/dispatch · **Freeze:** model-free below compile

Linked: D-124 (polarization sizing), D-125 (heat + trail + weighted valves),
D-126 shorthand for POV plan / training_feedback / atr_stream / fees (see
post-fill workstream; research-topics also uses D-126), D-129 (POV drain +
positions/exits), D-134 (control_snapshots persist + atr_stream maintenance +
time-spaced child drain), `product-spec.md` §Trading modules, `data-model.md`
jobs, `seeded-strategy-catalog.json` bands, `academic-quant-tool-catalog.md`.

## 1. Scope and boundaries

Once a position is placed, **all lifecycle decisions are deterministic tools** —
no LLM calls. The algorithm lives in `maintenance.position_exits` →
`dispatch.paper_trade` (sell) and compile-time admission valves that shape what
gets placed.

| In scope | Out of scope |
|----------|--------------|
| Exits, scale-outs, protective/trail stops | LLM re-entry after exit |
| Portfolio heat at compile | Colocated / microsecond HFT claims |
| Fee-aware measurable-gain floors + ledger `fee` rows | Guaranteed returns language |
| Weighted valves + POV child-slice plan + time-spaced drain | Kelly auto-sizing (oq-036 deferred) |
| Peak mark + atr_stream ValueRefs + control_snapshots | Live broker commission adapters |
| `training_feedback` + `applyControlSnapshotDelta` | |

**HFT framing:** “high-frequency-oriented” within **retail API latency** — micro-trade
swarms, strict throttles, higher turnover cost awareness. Not colocated HFT.

## 2. Decision model: multi-way weighted valves

Controls are **continuous valves inside catalog envelopes**, not boolean switches.

```
effective = clamp(band_base × driver₁ × driver₂ × …, band.min, band.max)
```

| Valve | Drivers (blended) | Catalog band | Learning write |
|-------|-------------------|--------------|----------------|
| Signal polarization | strengthBand, gate agreement, direction align | sizing BPS scalar [0.5, 1.5] | promote snapshot |
| Portfolio heat | open ATR-risk / equity | `portfolio_heat_pct_band` | compile block + training delta |
| Participation | urgency × schedule × vol | `participation_rate_band` | `proposeValvePositionDelta` |
| Urgency (IS λ) | polarization × recovery pressure | `is_urgency_scalar_band` | same |
| Child slice | max % of parent | `child_slice_band` | POV plan lineage |
| Trail | peak mark × ATR | `trail_multiplier_band` | peak ValueRef |

Learning systems adjust **driver weights and band positions inside envelopes**
via `applyControlSnapshotDelta` → append `training_feedback` + optional
`WeightEnvelope` updates. Fail-closed on unknown bands / out-of-band weights.

## 3. Compile admission (pre-place)

```
philosophy BPS
  × polarization (D-124)
  → budget qty
  ∩ ATR-risk qty (atr_stream ValueRef when present, else synthetic)
  → portfolio_heat gate (projected open risk ≤ band.max %)
  → urgency + participation valves
  → planChildSlices (lineage; dispatch still one instruction until partial fills)
```

Block reason: `portfolio_heat_exceeded`.

## 4. Exit priority (post-place)

`resolvePositionExitReason` order:

1. `target_exit_deadline`
2. RR ladder: tp3 → tp2 → tp1
3. `trail_stop` (chandelier: peak − k×ATR) once peak cleared tp1 R
4. `measurable_gain_take` (spread + fee bps + net edge; higher net for HFT-oriented)
5. `atr_stop` / half-R breakeven lock (`breakeven_on_tp1`)
6. `session_close` (only if opened during open cash session)
7. spread-buffered `breakeven`
8. catalog `time_stop`

Peak marks: `position_peak:{moduleId}:{symbol}`. ATR: `atr_stream:{SYMBOL}`.

## 5. Fee awareness

Paper fills write `ledger_entries.kind = 'fee'` at **5 bps one-way** of notional
(`feeCentsFromNotional`). Measurable-gain floor uses round-trip fee proxy + net edge.
Live broker commissions should replace the proxy when adapters emit fee amounts.

## 6. POV child-slice plan + time-spaced drain

`planChildSlices` produces a qty schedule from participation % × urgency ×
`child_slice_band`. Compile records `childSlices` in `compile_events.lineage`.
Paper dispatch (qty ≥2): fill **slice[0]** immediately, persist
`deterministic_tasks.drain_state`, enqueue `dispatch.paper_trade_child_slice`
with `runAfterMs = sliceDrainIntervalMs(urgency)` for remaining slices
(1¢ adverse walk per index, VWAP on finalize). Completed drains tag
`child_slice_drain` + `time_spaced_child_drain`. Single-shot paths keep
`no_partial_fills`. Operator multi-share fills use the same POV planner when
no compile lineage exists.

## 7. Recovery binding

Exit reasons map to recovery phases (`constrain` / `observe` / `escalate_or_abort`)
on handoff envelopes for operator lineage and future IS trajectory realignment
(`rec-006`).

## 8. Paper vs live honesty

| Proxy | Live follow-on |
|-------|----------------|
| Synthetic ATR (50 bps) when no stream | `maintenance.atr_stream` → Alpaca 1Day bars → `atr_stream:{SYMBOL}` |
| Synthetic half-spread 2 bps | Quote feed half-spread |
| Paper fee 5 bps ledger row | Broker commission + fees |
| Immediate one-shot market fill | Time-spaced POV child drain (`time_spaced_child_drain`) |

## 9. Verification

- Unit: atr, refresh-atr-stream, fees, child-order-scheduler, child-slice-fills,
  paper-trade-child-drain, control-snapshot persist, apply-control-snapshot-delta,
  portfolio-heat, weighted-valves, position-exits, WeightEnvelope contracts
- Intention alignment: gains clear fee floor; heat blocks over-leverage;
  training deltas stay in-band
- Operator: `POST …/positions/exits` enqueues + drains lifecycle sells
- Compile/promote: non-null `HandoffEnvelope.controlSnapshotRef`

## 10. Open follow-ons

- Portfolio-heat compile path prefer live `atr_stream` over synthetic
- Credentialed Alpaca soak for atr_stream refresh
- Trace `partial` rows mid-drain (today: one filled trace on last slice)
