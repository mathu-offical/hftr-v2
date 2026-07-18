# Post-fill deterministic position lifecycle

**Status:** implemented (paper) · **Owner:** engine/dispatch · **Freeze:** model-free below compile

Linked: D-124 (polarization sizing), D-125 (heat + trail + weighted valves),
`product-spec.md` §Trading modules, `data-model.md` jobs, `seeded-strategy-catalog.json`
bands, `academic-quant-tool-catalog.md`.

## 1. Scope and boundaries

Once a position is placed, **all lifecycle decisions are deterministic tools** —
no LLM calls. The algorithm lives in `maintenance.position_exits` →
`dispatch.paper_trade` (sell) and compile-time admission valves that shape what
gets placed.

| In scope | Out of scope |
|----------|--------------|
| Exits, scale-outs, protective/trail stops | LLM re-entry after exit |
| Portfolio heat at compile | Colocated / microsecond HFT claims |
| Fee-aware measurable-gain floors | Guaranteed returns language |
| Weighted valves (participation, urgency, heat, trail) | Kelly auto-sizing (oq-036 deferred) |
| Peak mark ValueRefs for chandelier | Live `atr_stream` (synthetic ATR until wired) |

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
| Trail | peak mark × ATR | `trail_multiplier_band` | peak ValueRef |

Learning systems adjust **driver weights and band positions inside envelopes**
(`proposeValvePositionDelta`) — they never invent new axes or bypass
`enforceScopeStrict`. Full `WeightEnvelope` + `training_feedback` table remain
follow-on (v1 carryover); the valve helpers are the write surface.

## 3. Compile admission (pre-place)

```
philosophy BPS
  × polarization (D-124)
  → budget qty
  ∩ ATR-risk qty
  → portfolio_heat gate (projected open risk ≤ band.max %)
  → urgency valve reading (lineage only until child-slice POV ships)
```

Block reason: `portfolio_heat_exceeded`.

## 4. Exit priority (post-place)

`resolvePositionExitReason` order:

1. `target_exit_deadline`
2. RR ladder: tp3 → tp2 → tp1
3. `trail_stop` (chandelier: peak − k×ATR) once peak cleared tp1 R
4. `measurable_gain_take` (spread + **paper fee proxy 5 bps** + net 25 bps; **40 bps** when HFT-oriented / short `time_stop`)
5. `atr_stop` / half-R breakeven lock (`breakeven_on_tp1`)
6. `session_close` (only if opened during open cash session)
7. spread-buffered `breakeven`
8. catalog `time_stop`

Peak marks persist as append-only ValueRefs: `position_peak:{moduleId}:{symbol}`.

## 5. Fee awareness

Round-trip cost floor =

```
2 × half_spread + paper_fee_bps + net_edge_bps
```

HFT-oriented paths raise `net_edge_bps` so micro-trade churn cannot “win” on noise
after fees. Live broker commissions should replace the 5 bps proxy via ledger
`fee` rows when available.

## 6. Recovery binding

Exit reasons map to recovery phases (`constrain` / `observe` / `escalate_or_abort`)
on handoff envelopes for operator lineage and future IS trajectory realignment
(`rec-006`).

## 7. Paper vs live honesty

| Proxy | Live follow-on |
|-------|----------------|
| Synthetic ATR (50 bps) | `atr_stream` OHLC ValueRef |
| Synthetic half-spread 2 bps | Quote feed half-spread |
| Paper fee 5 bps | Ledger commission + fees |
| Immediate market fill | POV / child-slice under participation valve |

## 8. Verification

- Unit: `portfolio-heat.test.ts`, `weighted-valves.test.ts`, `position-exits.test.ts`,
  `lever-resolver.test.ts`, `signal-polarization.test.ts`
- Intention alignment: gains must clear fee floor; heat blocks over-leverage;
  trail recovers automatically after tp1 peak without LLM

## 9. Open follow-ons

- Wire participation valve into child-order scheduler (M5)
- `training_feedback` + `WeightEnvelope` persistence
- Live `atr_stream` + real fee ledger into measurable floor
- Peak trail session legality (regular-session trailing election)
