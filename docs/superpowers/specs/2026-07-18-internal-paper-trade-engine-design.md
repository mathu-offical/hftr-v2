# Internal paper trade engine (D-122)

Living design for the advanced hftr paper engine: live market model, per-engine
service binding, ringfenced capital, dual-book deltas, and main-book rollup.

| Field | Value |
|---|---|
| Status | approved |
| Decision | D-122 (OQ-13 resolved) |
| Approach | Evolve in place (Approach 1) |
| Related | D-002, D-014, D-023, D-025, D-027, D-059, D-061, D-120, D-125, D-126 |
| Spec plan | `docs/superpowers/plans/2026-07-18-internal-paper-trade-engine.md` |

## 1. Intent

Build an **internal paper trade engine** that:

1. Fuses **all entitled live data sources** into a current **MarketModel**
2. Simulates fills and holdings under **actual market conditions** (honest feedClass)
3. Abstracts over **multiple providers / asset pools** via per-engine bindings
4. Sits **on top of** provider paper/test APIs (Alpaca paper, Kalshi demo, …)
5. Hydrates one company **main book** from a hybrid of engine books
6. Uses **BookDelta** (especially in `both_verify`) to **train / weight** realism
   (valves / sim params — D-125), not discard reconciliation noise

## 2. Architecture (approved)

```text
Live hydrators (registry) ──► MarketModel (ValueRefs + feedClass)
        │                              │
        ▼                              ▼
 Awareness adapters          Dispatch quote / mark / exit
 (posture hub, topics, …)         │
                                  ▼
 EngineBinding ── routing mode ──► InternalPaperCore | ProviderAdapter
        │                              │
        ▼                              ▼
 EngineBook (allocated cash + positions)
        │
        ▼
 CompanyMainBook (rollup) ◄── explicit fund shares / transfers
        │
        └── both_verify ──► BookDelta ──► weight / valve training
```

| Unit | Responsibility |
|------|----------------|
| MarketModel | Fuse entitled live sources → quotes/marks; no `submitOrder` |
| Awareness adapters | Same model → posture hub (D-120) + current-awareness topics (D-126) + extensible consumers |
| EngineBinding | Per execution engine: optional service + routing mode |
| InternalPaperCore | Unified fill/book API (today’s inline fill + `paper-sim` adapter) |
| EngineBook | Spend authority for that engine’s allocation |
| CompanyMainBook | Rollup for UI + company-level views |
| BookDelta | Linked deltas for training/weights |

**Invariants:** model-free below compile; only dispatch calls `submitOrder`; live
fail-closed; NRA/ValueRefs; `simulatorGapTags` honesty.

## 3. Binding & routing (approved)

1. Operator binds each **execution engine** to a real service when available.
2. Unbound → **internal paper functions**.
3. Bound → provider **ledger amount = added funds source** (not auto parallel fills).
4. Routing modes (switchable):

| Mode | Orders | Funds | Deltas |
|------|--------|-------|--------|
| `funds_only` (**default**) | Internal paper engine | Provider ledger hydrates capital | Sim vs **live market model** |
| `execute_on_service` | Provider submit/reconcile | Provider ledger hydrates main book | Venue verification path |
| `both_verify` | Internal + provider (linked) | Same | Provider-fill deltas → weight training |

5. Safest default on new bind: **`funds_only`**.
6. Capital: each engine manages its **own allocated slice**; **no cross-engine spend**
   unless capital is **explicitly shared** (fund_router / approved transfer).
7. Main book = rollup of engine books + unallocated company remainder.

## 4. Data model (approved direction)

**Contracts (Phase 1):**

- `PaperRoutingMode`: `funds_only` \| `execute_on_service` \| `both_verify`
- `EngineExecutionBinding`: routingMode, optional brokerConnectionId, useProviderLedgerAsFundsSource
- `BookDelta` / `BookDeltaDimension`: fill_price_bps, latency_ms, partial_fill, mark_bps, reject_code, …
- Extend `TradingModuleConfig.executionBinding` (optional; default = funds_only semantics)

**Persistence (later phases):**

- Engine allocation rows (or strengthen module capital envelopes) as spend authority
- `book_deltas` append-only (or extend verification / training_feedback)
- Explicit share / transfer already partially via `fund_transfers` (D-059)

**Positions:** remain module-scoped (`positions.module_id`); company main book rolls up.

## 5. Market model & awareness (approved)

- **Teacher in `funds_only`:** live market model only (not provider fills).
- Prefer entitled hydrator quotes/marks over `synthetic_sim`; always label `feedClass`.
- Shared **flexible** awareness substrate: Market posture (D-120) + Current awareness
  topics (D-126) + future Analyze/library consumers — **no paper-only fork**.

## 6. Error handling

- Missing entitlement → fail closed on that hydrator; degrade with gap tags; never invent SIP.
- Unbound + no live quote → synthetic with `synthetic_price_path` tags (honest).
- Cross-engine spend attempt → `capital_isolation_block`.
- `execute_on_service` / `both_verify` without connected service → block with text-first reason.
- Live mode unchanged: arming + gates (D-031 / D-087).

## 7. Testing

- Contract tests for binding defaults and BookDelta schemas
- Engine tests: funds_only + live quote → internal fill (no submitOrder)
- Engine tests: execute_on_service → venue path
- Gap-tag honesty when live quote used with inline fill
- Capital isolation: module A cannot spend module B allocation without share
- Paper-experiment protocol: update §4 for funds_only live-model teacher

## 8. Phased delivery

| Phase | Deliverable |
|-------|-------------|
| **1** | Contracts + `funds_only` default: live/adapter quote + internal fill when company has provider; no auto venue submit — **done** |
| **2** | MarketModel fusion (multi-candidate quotes) + awareness adapter stubs (posture hub + current awareness); position-exits use MarketModel — **done** |
| **3** | Engine allocation enforcement + explicit share — **done** (`resolveDispatchSpendAuthority`, `capital_isolation_block`) |
| **4** | `both_verify` dual path + BookDelta → training_feedback / valves |
| **5** | Unify InternalPaperCore with `paper-sim` adapter; UI binding controls |

## 9. Non-goals (this design)

- Live trading without gates
- Stripe funding brokerage accounts
- Replacing provider paper APIs (they remain available under execute / both_verify)
- Silent company-wide broker override of every engine’s routing mode
