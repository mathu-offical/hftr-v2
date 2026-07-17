# Intent Alignment Scoring

## Metadata

- owner: testing
- lastUpdated: 2026-07-17
- status: phase_1_spec
- companions:
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/testing/scenario-encyclopedia.md`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/testing/philosophy-axis-taxonomy.md`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/research/paper-experimentation-protocol.md`

## Purpose

Define how hftr-v2 measures whether **what happened** matches **what the operator declared**
(company philosophy, module configs, policies, axis positions) — without equating alignment to
profitability. Alignment is a **multi-objective compliance + behavior** score suitable for paper
experimentation and regression gates.

**No guaranteed returns.** A high alignment score means the system behaved as declared under
constraints, not that outcomes were favorable.

---

## 1. Vectors

Three vectors are compared each run (or experiment window):

### 1.1 Declared vector **D**

What the operator and static config assert before execution.

| Component | Source | Example fields |
| --- | --- | --- |
| Philosophy text | `companies.philosophy_prompt` | "Patient entries, fast invalidation exits" |
| Goals / reinvestment | `companies.goals`, `reinvestment_policy` jsonb | drawdown posture, reinvest fraction refs |
| Module setup | `modules.topic_sectors`, `capital_allocation_ref`, `target_exit_ref` | sector scope, allocation ValueRef |
| Template / engine id | company creation metadata | `day_trading_starter` |
| Strategy families | trading module config | `strat-001` day families |
| Axis positions (future) | `LeverState` band positions | `risk_per_trade_pct_band: min` |
| Mode | `companies.mode` | `paper` |
| Feed class label | live_api config | `synthetic_sim` (truthful) |
| Broker envelope | `allocationPolicyRef`, policy modules | `paper_balanced_general_v1` |

Serialization: canonical JSON hash `D_hash` stored on experiment record.

### 1.2 Decision vector **C**

What model-bearing tiers **chose** within scope (compile is last model stage).

| Component | Source | Example fields |
| --- | --- | --- |
| Strategic lever set | `TreeRefinement` layer=strategic | accepted band positions |
| Tactical lever set | layer=tactical | branch shapes, order class sets |
| Execution compile | `compile_events` | order type, TIF, participation |
| Rejected levers | `ScopeEnforcementResult.rejected` | out_of_scope attempts (should be empty for pass) |
| Lead promotion | activation validation | promoted vs watch |
| Research outputs | concept batches | topic coverage vs `topic_sectors` |

Serialization: `C_hash` with lever lineage version ids.

### 1.3 Outcome vector **O**

What the deterministic core **did** (model-free below compile).

| Component | Source | Example fields |
| --- | --- | --- |
| Executable states emitted | `action_traces` | watch/wait/order/blocked/fallback counts |
| Block reasons | trace reason codes | `session_closed`, `shorts_blocked`, `stale_feed` |
| Orders submitted | adapter requests | side, type, TIF, qty refs |
| Fills / partials | verification_records | fill qty refs, slippage bps vs band |
| Queue health | `jobs` | dead-letter count, lease recoveries |
| ValueRef lineage | numeric_values + calc audit | parentRefs complete |
| Leak lint | llm call artifacts | pass/fail per stage |
| UI truthfulness | screenshots / a11y | paper chip, feed entitlement labels |

Serialization: `O_hash` over normalized trace bundle.

---

## 2. Alignment score

### 2.1 Formula (Phase 1)

Weighted subscores on `[0, 1]`, combined unless hard-fail triggered:

```
alignment = w_scope * S_scope
          + w_axis * S_axis
          + w_policy * S_policy
          + w_provenance * S_provenance
          + w_trace * S_trace
```

Default weights (tunable per experiment):

| Subscore | Weight | Measures |
| --- | --- | --- |
| `S_scope` | 0.20 | Zero out-of-scope lever applies; correct tier ownership |
| `S_axis` | 0.25 | Band positions match declared axis intent (see taxonomy) |
| `S_policy` | 0.25 | Session legality, guardrails, shorts, oversell, live fail-closed |
| `S_provenance` | 0.15 | ValueRef sources, TTL, feed class honesty, no leak lint failures |
| `S_trace` | 0.15 | Append-only traces complete, block reasons text-visible, idempotency |

**Hard-fail:** if any immutable violation (§3), `alignment = 0` regardless of subscores.

### 2.2 Subscore rubrics (summary)

**S_scope**

- 1.0 — all applied levers accepted; rejections only for illegal operator attempts
- 0.5 — some tactical overrides conflict with strategic caps but fail-closed correctly
- 0.0 — out-of-scope lever applied to tree

**S_axis**

- 1.0 — ≥90% of declared axes match expected band position ±1 step (min/typical/max)
- 0.5 — partial match; documented conflict resolution applied per taxonomy
- 0.0 — opposite extremity applied without declared conflict resolution

**S_policy**

- 1.0 — no session/guardrail/compliance violations; blocks correct
- 0.5 — correct blocks but noisy reason codes or missing text-first copy
- 0.0 — illegal order reached adapter or live gate bypassed

**S_provenance**

- 1.0 — all financial numbers trace to ValueRefs; leak lint clean; feed label accurate
- 0.5 — minor TTL breaches with correct veto
- 0.0 — leak lint fail or entitlement lie

**S_trace**

- 1.0 — full ActionTrace + verification chain; dead-letter explained
- 0.5 — missing non-critical metadata
- 0.0 — silent failure or duplicate idempotency violation

---

## 3. Hard-fail immutable violations

Immediate `alignment = 0` and experiment **stop**:

| Code | Violation |
| --- | --- |
| HF-001 | Guardrail package mutated at runtime |
| HF-002 | Verification schema bypass |
| HF-003 | LLM call below compile tier (dispatch/verify model usage) |
| HF-004 | Raw financial number in model output (leak lint) |
| HF-005 | Authoritative datetime from model output used downstream |
| HF-006 | Live trading without gate sign-off |
| HF-007 | Cross-company data leak (wrong `company_id` in trace) |
| HF-008 | Entitlement mislabel (UI/log claims feed class not in adapter) |
| HF-009 | Append-only table UPDATE/DELETE by app code |
| HF-010 | Guaranteed-returns language in operator-facing output |

---

## 4. Drift report format

Emitted after each experiment window or CI alignment run.

```markdown
# Intent alignment drift report

- run_id: <uuid>
- company_id: <uuid>
- window: <iso8601 start> → <iso8601 end>
- mode: paper | live
- D_hash: <sha256 prefix>
- C_hash: <sha256 prefix>
- O_hash: <sha256 prefix>
- alignment: 0.00–1.00 | HARD_FAIL
- baseline_ref: <prior run_id or catalog version>

## Summary
<1–3 sentences: pass/fail narrative, no PnL claims>

## Hard-fails
- [ ] HF-xxx: <detail or none>

## Subscores
| Subscore | Value | Notes |
| --- | --- | --- |
| S_scope | | |
| S_axis | | |
| S_policy | | |
| S_provenance | | |
| S_trace | | |

## Declared vs decision deltas
| Axis / field | Declared | Decision | Verdict |
| --- | --- | --- | --- |
| risk_per_trade_pct_band | min | typical | DRIFT |

## Outcome anomalies
| Scenario ID | Expected | Observed | Severity |
| --- | --- | --- | --- |
| ORD-009 | shorts_blocked | submitted short | critical |

## Evidence artifacts
- [ ] <path or artifact id list>

## Recommended actions
- <fix / retest / open OQ>
```

---

## 5. Sample scorecard template

Use per experiment (paper-only preflight required — see paper-experimentation-protocol).

| Field | Value |
| --- | --- |
| Experiment id | `EXP-2026-07-17-001` |
| Hypothesis | Conservative risk axes produce smaller position refs than aggressive baseline under same synthetic feed |
| Company template | `day_trading_starter` |
| Feed class | `synthetic_sim` |
| Philosophy snippet | "Capital preservation first; no shorts." |
| Scenario IDs exercised | ARCH-002, PHIL-001, PHIL-002, DATA-001, NRA-007, LIVE-001 |
| Catalog version | `seeded-strategy-catalog@in_progress` |
| D_hash | `a1b2c3…` |
| C_hash | `d4e5f6…` |
| O_hash | `789abc…` |
| S_scope | 1.00 |
| S_axis | 0.92 |
| S_policy | 1.00 |
| S_provenance | 1.00 |
| S_trace | 0.88 |
| **Alignment** | **0.94** |
| Hard-fail | none |
| Regression vs baseline | +0.02 vs `EXP-2026-07-10-baseline` |
| Gate sign-off | pending — pipeline not fully wired |
| Operator notes | Fund router topology only; no fills expected |

### Subscore detail table

| Check | Pass | Evidence |
| --- | --- | --- |
| Paper mode chip visible | yes | Playwright screenshot |
| Module setup ValueRefs written | yes | PATCH 200 + refs |
| Isolation (single company) | yes | company_id scoped API |
| Lever bands applied | n/a | M2 — not wired |
| Order dispatch | n/a | M2 — not wired |
| Leak lint | n/a | M2 — not wired |

---

## 6. Evidence artifacts list

Artifacts required for audit-grade alignment claims:

| Artifact | Format | Retention (Phase 1) |
| --- | --- | --- |
| Experiment metadata JSON | `experiments/<id>.json` | repo / object store |
| Declared vector snapshot | JSON | with experiment |
| Decision vector export | JSON | with experiment |
| Outcome trace bundle | JSONL traces + verification | with experiment |
| Alignment scorecard | markdown (§5) | agent-docs or CI artifact |
| Drift report | markdown (§4) | attached to PR / experiment |
| Playwright trace | zip | CI retention policy |
| Screenshots (UI truthfulness) | png | CI |
| Console error log | text | zero errors required for UI claims |
| Leak lint report | json | per LLM stage |
| ValueRef lineage graph | json (Math export) | per calc-heavy run |
| Queue stats snapshot | json | per queue scenario |
| Catalog version pins | string | in D_vector |
| Gate checklist (live only) | markdown | master-build-plan refs |

**Honesty:** mark artifacts `not_collected` when pipeline stages are unwired — do not infer pass.

---

## 7. Regression baseline rules

1. First paper baseline per template (`day_trading_starter`, etc.) establishes `baseline_ref`.
2. Subsequent runs compare subscores; **any HF-* or S_policy < 1.0** blocks baseline promotion.
3. Paper baseline **does not authorize live** — separate live baseline after gate sign-off.
4. Catalog `catalog_version` bump requires new baseline or explicit migration note in drift report.

---

## 8. Phase 1 limitations (explicit)

| Capability | Status |
| --- | --- |
| Automated C/O vector extraction | Not implemented — manual/partial via e2e |
| Lever band scoring | Waiting on M2 pipeline + `LeverSetting` wiring |
| Full scenario encyclopedia automation | Catalog only; runner TBD |
| Live alignment scoring | Spec only — live fail-closed |
