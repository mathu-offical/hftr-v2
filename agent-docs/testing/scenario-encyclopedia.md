# Scenario Encyclopedia — Intent Alignment (Phase 1)

## Metadata

- owner: testing
- lastUpdated: 2026-07-17
- status: phase_1_catalog
- companion docs:
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/testing/philosophy-axis-taxonomy.md`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/testing/intent-alignment-scoring.md`
  - `/Users/matt-mobile/MATT/web_dev/hftr-v2/agent-docs/research/paper-experimentation-protocol.md`

## How to read scenarios

Each row is a **deterministic test intent**. Scenarios are combinatorial classes — implementation
may cover many instances via parameterization (company count N, band position, feed class).

| Column | Meaning |
| --- | --- |
| **ID** | Stable encyclopedia id (`CLASS-NNN`) |
| **Expected deterministic effect** | What the engine/platform must do — not PnL |
| **Evidence artifact** | Traceable output for alignment scoring |
| **executable_today** | `yes` = runnable now; `partial` = subset; `no` = blocked on M2+ pipeline |
| **REQ links** | Stable `REQ-*` ids from `requirements-matrix.md` / `.json`, plus decisions / sprint refs |

**Paper-only default.** Live scenarios exist for fail-closed verification only until master-build
plan live gates pass.

---

## A. Multi-company isolation

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| ISO-001 | Single user owns companies A (day trading) and B (trend research lab); same Clerk session | Company A API reads return only A modules/jobs/traces; B likewise; no cross-`company_id` rows | API response bodies scoped; DB query logs show `company_id` predicate | partial | `data-model.md` ownership; Playwright creates one company |
| ISO-002 | N=3 companies with conflicting structured `risk_appetite` axes (min / typical / max) under otherwise identical paper inputs | Each company's module configs and lever state remain isolated; no cross-company traces; quantities order with risk axis | `paper-intent-alignment.spec.ts` min/typical/max cohort; per-company activity projections | yes | REQ-PHIL-004; REQ-TST-007; D-025 |
| ISO-003 | Concurrent assistant messages in A and B within same minute | Rate limit (`20/min/company`) applies per company independently | `assistant_messages` counts per `company_id`; 429 only on hot company | yes | D-022 assistant admission |
| ISO-004 | Queue drain claims jobs for A and B in one batch | Fairness cap prevents A from starving B; claimed rows retain `company_id` | `jobs` claim query result; `/api/queue/stats` per class | no | `job-orchestration.md` §2 fairness |
| ISO-005 | User archives company A; B remains active | A returns 404/410 on scoped routes; B unaffected; A jobs not claimed | Archive flag + API status codes | partial | e2e `archiveCompany` fixture |
| ISO-006 | Same strategy family selected in A and B with opposite band positions (risk min vs max) | Positions independent; neither company's control snapshot mutates the other | Three-company Playwright quantities and company-scoped traces | partial | REQ-PHIL-004/005; `philosophy-axis-taxonomy.md` risk |
| ISO-007 | LLM operating budgets: A exhausted, B healthy | A model-bearing jobs fail admission; B continues; trading capital separate per D-024 | `llm_budgets` counters; admission rejection records | partial | D-024; `llm-budgets` route |
| ISO-008 | Synthetic feed symbol overlap (AAPL in A and B) | ValueRefs namespaced by company/module; no ref handle collision | `numeric_values` provenance `sourceId` includes module scope | no | `number-handling.md` §2 |

---

## B. Architecture templates & graphs

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| ARCH-001 | `blank` template — operator builds minimal graph manually | Only Math auto-provisioned; no orphan link kinds; draft until setup complete | Canvas node count; `LINK_RULES` validation on edge create | partial | `templates.ts`; palette |
| ARCH-002 | `day_trading_starter` full topology | 10 smoothstep edges; holding_fund→math→fund_router→trading fund-route; policy/analyzer present | Playwright node/edge counts; `company-workspace.spec.ts` | yes | D-023; D-024 |
| ARCH-003 | `trend_research_lab` — no trading node | Research→library→trend only; no compile/dispatch jobs materialize | Module list; absent trading type | partial | `templates.ts` |
| ARCH-004 | Multi-engine: base lab + insert `engine_day_trading` from store | Merged graph validates; duplicate Math not created; new nodes draft until setup | Module PATCH responses; required-field chips | partial | `ENGINE_TEMPLATES` |
| ARCH-005 | Broken graph: trading node with no inbound data feed | Module stays `draft`; promote/active transition blocked; text-visible reason | Module status + chip copy | partial | D-024 draft gating |
| ARCH-006 | Invalid graph: disallowed edge kind (e.g. trading→research data_feed) | Edge create rejected at API/contracts layer | 400 + Zod error | partial | `modules.ts` LINK_RULES |
| ARCH-007 | Invalid graph: cycle in directive edges | Validator rejects or marks non-executable (policy TBD) | Validation record | no | OQ — cycle policy |
| ARCH-008 | `holding_fund → math → fund_router → trading` fund route | Topology stored; fund movement **not** executed in M1 | Edge kinds `fund_route`; no ledger transfer rows | partial | D-023 honesty |
| ARCH-009 | Missing policy module on otherwise valid day-trading graph | Verification stage fails closed or module blocked from active | `blocked` executable state (future) | no | product-spec §policies |
| ARCH-010 | Math module delete attempted | Rejected — Math is non-deletable per product | API 403/409 | partial | product-spec Math |
| ARCH-011 | Analyzer without trading attachment | Analyzer may exist but produces no execution traces | Empty `action_traces` for analyzer-only | no | M2 pipeline |
| ARCH-012 | Live API module with empty instruments array | Feed manager no-ops; trend module sees stale/missing entitlement | Feed health status text-first | partial | module setup chips |

---

## C. Philosophy extremes, midpoints, conflicting axes

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| PHIL-001 | All strategic risk axes at `min` | Small per-name size; low heat; tight vol target scalar | Unit mapping + Playwright min company fill quantity | yes | REQ-PHIL-002/004/005; D-025 |
| PHIL-002 | All strategic risk axes at `max` (paper) | Larger sizes attempted; **hard guardrails still cap** | Unit scope rejection + Playwright max company fill quantity | yes | REQ-PHIL-001/004/005; guardrail catalog; D-025 |
| PHIL-003 | Midpoint (`typical`) on all bands | Baseline replay matches seeded-testing defaults | Playwright typical quantity strictly between min and max | yes | REQ-PHIL-003/004/005; D-025 |
| PHIL-004 | Conflicting: aggressive risk + tight slippage + high urgency | Slippage recovery tree fires before size expansion | Recovery ladder `rec-*` phase log | no | axis taxonomy conflicting table |
| PHIL-005 | Conflicting: trend regime + mean-reversion family | Lower promotion score; no compile without qualifying lead | Activation validation failure | no | `activationTier` |
| PHIL-006 | Philosophy prompt emphasizes "never short" + family allows short | Short branches suppressed at tactical `branch_order_class_set` | Block reason `shorts_disabled` | no | compliance + guardrails |
| PHIL-007 | Philosophy prompt "flat by close" + swing family | Day-trading session close forces flatten branches | Time stop / session rule interaction | no | session catalog |
| PHIL-008 | Exploration curiosity + Tier A evidence family | Research runs wide; promotion blocked until verification fields pass | `watch` vs `blocked` on lead | no | evidence_bar axis |
| PHIL-009 | Company goals jsonb declares low drawdown + pyramiding max | Pyramiding rejected or heat blocks adds | `rejected` lever or guardrail trip | no | goals + pyramiding_band |
| PHIL-010 | Reinvestment policy aggressive + concentration min | Reinvestment calc uses operator ValueRefs; concentration cap binds first | Calc audit + cap rejection | no | NRA reinvestment (future) |

---

## D. Order verbs, types, TIF, oversell, shorts, cancel/replace

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| ORD-001 | Market order, TIF DAY, regular session, liquid symbol | Instruction compiles; dispatch submits; verification records fill | Three-company Playwright traces + verification records | yes | REQ-TST-007; tier-lever §3.1–3.2 |
| ORD-002 | Limit passive, TIF GTC, extended hours with flag | `extended_hours=true`; limit-only per session matrix | Compiled instruction JSON | no | session catalog |
| ORD-003 | IOC partial fill | Remainder canceled; state `wait` or branch complete per tree | Broker partial fill event | no | TIF semantics |
| ORD-004 | FOK no immediate full size | Entire order canceled; no residual exposure | Zero-fill trace with reason | no | tier-lever §3.2 |
| ORD-005 | Stop-limit breakout trigger | Stop triggers limit child; precision rules on sub-$1 prices | Price decimal audit | no | order_type_set |
| ORD-006 | Trailing stop regular session only | Off-hours attempt rejected or alternate protection branch | Session legality rejection | no | tier-lever §2.3 note |
| ORD-007 | Bracket OTO entry + stop + target | Parent/child ids linked; cancel parent cascades deterministically | OTO linkage in trace | no | branch_order_class_set |
| ORD-008 | Oversell: sell qty > position | Deterministic reject before broker call | `blocked` + reason `insufficient_position` | no | dispatch guard |
| ORD-009 | Short equity when policy disallows | Compile or dispatch blocked fail-closed | Playwright unsupported NVDA sell: blocked trace + `pre_dispatch_block` | yes | product paper default; EXP-2026-07-17-03 |
| ORD-010 | Short allowed paper symbol (if policy on) | Negative qty instruction with locate check stub | Trace with side=short | no | broker adapter |
| ORD-011 | Cancel/replace within `cancel_replace_band` max | Priority-preserving replace; attempt counted | `ActionTrace` cancel_replace attribution | no | tier-lever §3.7 |
| ORD-012 | Cancel/replace exceeds max attempts | Escalate to recovery ladder; no blind resend | `dead` job or `blocked` state | no | recovery catalog |
| ORD-013 | Replace on unknown order id | Fail closed; no new orphan order | Error trace + no duplicate client_order_id | no | idempotency |
| ORD-014 | Buy power insufficient | Pre-dispatch veto | `blocked` before adapter | no | broker envelope |
| ORD-015 | Crypto order TIF GTC vs IOC only | Illegal TIF rejected at compile | Compile rejection record | no | session/crypto rules |

---

## E. Market states

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| MKT-001 | Regular session open | Watcher sweep evaluates `watch` states; session=regular in snapshot | Session clock injection via calendar service | no | job-orchestration §5 |
| MKT-002 | Regular session closed | New entries blocked or queued; exits per tree policy | `session_closed` block reason | no | session catalog |
| MKT-003 | Pre-market extended | Limit + DAY/GTC only; wider slippage band position auto-widen | Session legality matrix row | no | session catalog |
| MKT-004 | Post-market extended | Same as pre; feed freshness TTL enforced | Stale quote veto | no | feed_freshness_band |
| MKT-005 | Overnight session | Limit-only; reduced participation cap | Compile params clamped | no | session catalog |
| MKT-006 | Halt (LULD / news halt) | New entries `blocked`; existing orders managed per recovery | Halt detector signal + trace | no | macro/event catalog |
| MKT-007 | Thin book (wide spread > ceiling) | Entry branches `wait` or passive-only | Spread check in verification | no | session_spread_ceiling |
| MKT-008 | Vol shock regime (realized vol > median × band) | Heat reduced; sympathy off; slippage widen | Regime flag in control snapshot | no | vol_shock_regime_band |
| MKT-009 | Gap open beyond invalidation | Structure-break branch fires before stop | Invalidation trace event | no | invalidation_thresholds |
| MKT-010 | Simulated clock jump (injectable clock) | Session transitions without model-computed time | Clock module audit log | no | D-009 clock |
| MKT-011 | Holiday / early close calendar | Flatten-before-close branches advance | Calendar service exception list | no | market calendar |
| MKT-012 | 24/7 crypto session profile | No close flatten; TIF rules differ | Crypto session row | no | crypto preset (gated) |

---

## F. Data provenance & entitlements

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| DATA-001 | `synthetic_sim` feed class (paper default) | Quotes tagged honest synthetic provenance; paper traces carry simulator gap tags | Activity `simulatorGapTags` + ValueRef `sourceClass`/`sourceId` | partial | `templates.ts` feedClass; EXP-2026-07-17-03 (gap tags yes; UI label still thin) |
| DATA-002 | Alpaca IEX paper entitlement | Poll/stream within envelope budgets; entitlement string truthful in UI | Feed config + throttle trace | no | broker-integration.md |
| DATA-003 | Kalshi demo books | Probability quotes 0–1; separate precision rules | Adapter snapshot rows | no | prediction preset (gated) |
| DATA-004 | Polymarket test / Coinbase sandbox | Venue-specific session + throttle; custody unresolved (OQ-5) | Adapter health card | no | OQ-5 |
| DATA-005 | Stale quote (TTL exceeded) | Watchers do not fire entries; `stale_feed` block | TTL breach in provenance | no | number-handling §2 |
| DATA-006 | Missing feed (adapter down) | Module status degraded text-first; no fabricated prices | Health status + empty refs | no | adapters |
| DATA-007 | Entitlement mismatch (UI claims SIP, adapter uses IEX) | Compliance lint fail-closed on promote | Compliance check record | no | compliance catalog |
| DATA-008 | Operator manual trend POST (e2e pattern) | `operator_input` ValueRef for drift baseline | `numeric_values` row | partial | m1-sprint manual POST |
| DATA-009 | Band seed values | `sourceClass: band_seed`; long TTL | Catalog version in provenance | no | seed catalogs |
| DATA-010 | Derived calc lineage | `parentRefs` chain complete for position size | Math module audit log | no | number-handling §4 |
| DATA-011 | Cross-module ref borrow attempt | Company scope enforced on ref hydration | 403 on foreign ref | no | NRA scope |
| DATA-012 | Replay hydrates historical snapshot | Same refs reproduced; no live adapter call | Replay bundle hash | no | M3 training |

---

## G. Queue, lease, dead-letter, assistant, auth

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| Q-001 | Job claim with SKIP LOCKED | Short transaction; status active + `locked_until` | SQL claim log | no | job-orchestration §2 |
| Q-002 | Worker crash mid-job (lease expiry) | Sweep requeues; attempt++ | Job status pending; `attempts` | no | lease sweep |
| Q-003 | Max attempts exceeded | `status=dead`; surfaced in UI/docs audit | Dead-letter row + HUD badge | no | job-orchestration §2 |
| Q-004 | Idempotent handler replay | Cached artifact returned; no duplicate LLM spend | `idempotency_key` hit | no | job-orchestration §2 |
| Q-005 | DISPATCH priority over RESEARCH | Claim order respects `priority DESC` | Queue stats ordering | no | queue classes |
| Q-006 | LLM job over budget | Admission skip; job remains pending or rejected | Budget admission join result | partial | llm pipeline §budget |
| Q-007 | Assistant 21st message in 1 minute | 429 rate limit; no DB insert for blocked msg | HTTP 429 + no row | partial | D-022 |
| Q-008 | Assistant read-only: unknown intent | Capabilities card; no model call | `tool_results` summary card | yes | company-workspace e2e |
| Q-009 | API without Clerk session | 401 on company routes | Auth middleware log | partial | DEV_AUTH_BYPASS in e2e only |
| Q-010 | User A accesses company B id (UUID guess) | 404/403 — ownership scoping fail-closed | Scoped query returns empty | partial | db ownership helpers |
| Q-011 | CRON drain without secret | 401 on `/api/queue/drain` | Rejected request | no | job-orchestration §4 |
| Q-012 | Schedule tick materializes duplicate window | Idempotent schedule+window key — one job | Unique idempotency | no | job_schedules |

---

## H. Live mode toggle (fail-closed)

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| LIVE-001 | Company created paper (default) | UI chip `paper`; adapter=paper_sim / paper endpoints | Company `mode` column | yes | e2e paper chip |
| LIVE-002 | Toggle live without broker connection | Toggle rejected; remain paper | Error message text-first | partial | broker-integration |
| LIVE-003 | Toggle live without gate checklist | Fail-closed — master-build plan gates not satisfied | Gate denial record | no | master-build-plan live gates |
| LIVE-004 | Live enabled but compliance package stale | Mode remains paper or trading blocked | Compliance audit | no | compliance catalog |
| LIVE-005 | Live order path accidentally uses paper adapter | Adapter polymorphism prevents — live credentials required | Adapter selection trace | no | system-architecture |
| LIVE-006 | Paper trace replay treated as live evidence | Regression baseline rejects paper→live promotion | Scorecard flag | no | intent-alignment-scoring |

---

## I. Numeric / temporal leak lint & ValueRef lineage

| ID | Description | Expected deterministic effect | Evidence artifact | executable_today | REQ links |
| --- | --- | --- | --- | --- | --- |
| NRA-001 | LLM output contains raw price digits | Leak linter rejects; call fails closed | Leak lint report | no | number-handling §6 |
| NRA-002 | LLM output schedules entry at "3:45pm" | Datetime leak lint rejects | Lint pattern match | no | D-009 |
| NRA-003 | Model returns numeric JSON field for quantity | Schema validation rejects non-ValueRef handle | Zod error on strict schema | no | contracts pipeline |
| NRA-004 | Calculator divides by zero | Sanity gauntlet fail; no downstream ref | Calc error audit | no | number-handling §4 |
| NRA-005 | Unit algebra mismatch (usd + shares) | Operation rejected at type level | Calc type error | no | ValueRef `unit` |
| NRA-006 | Display formatting only in UI | Underlying store still fixed-point int | UI format ≠ stored ref | partial | number-handling §2 |
| NRA-007 | Target exit from operator datetime input | `timestamp_ms` ValueRef; not model-parsed | `target_exit_ref` lineage | partial | D-024 e2e fill |
| NRA-008 | Capital allocation 25% → pct ValueRef | `capital_allocation_ref` append-only | operator_input row | partial | D-024 |
| NRA-009 | Lineage audit: position size | `parentRefs` includes risk_pct, equity, atr refs | Math audit graph export | no | Math module |
| NRA-010 | Stale timestamp in orientation block | Allowed read-only; not used for schedule output | Prompt assembly log | no | number-handling context rule |
| NRA-011 | Replay mutates historical ref | Impossible — refs immutable; new version new ref | Append-only numeric_values | no | data-model |
| NRA-012 | Fund router percentage without calc op | Rejected — no literal % in lever state | Validation error | no | NRA fund router |

---

## J. Combinatorial expansion matrix (Phase 1 planning)

Use this matrix to generate parameterized runs without duplicating encyclopedia rows:

```
FOR company_template IN {blank, day_trading_starter, trend_research_lab, multi_engine}
FOR feed_class IN {synthetic_sim, alpaca_iex_paper, kalshi_demo, polymarket_test, coinbase_sandbox}
FOR session_state IN {open, closed, pre, post, overnight, halt}
FOR risk_position IN {min, typical, max}
FOR order_profile IN {market_day, limit_passive, ioc, fok, cancel_replace_storm}
RUN isolation_check AND provenance_audit AND alignment_scorecard
```

**Phase 1 priority slice (executable or partial today):** ISO-003, ISO-005, ISO-007, ARCH-002,
ARCH-005, ARCH-008, Q-007, Q-008, LIVE-001, NRA-007, NRA-008.

---

## K. Evidence artifact registry (cross-reference)

| Artifact | Produced by | Used in scoring |
| --- | --- | --- |
| Playwright trace / screenshot | CI e2e | ARCH-002, LIVE-001 UI |
| API response JSON | apps/web routes | ISO-*, ARCH-* |
| `assistant_messages` row | assistant route | ISO-003, Q-007 |
| `modules` setup refs | PATCH module | NRA-007/008 |
| `llm_budgets` counters | operating budget route | ISO-007 |
| `action_traces` | paper dispatch / `/activity` | ORD-*, MKT-*, EXP-03 provenance |
| `verification_records` | verify stage / `/activity` join | ORD-*, EXP-03 blocked/pass |
| `jobs` / dead-letter (future) | queue | Q-* |
| Leak lint report (future) | packages/llm | NRA-001/002 |
| ValueRef lineage export (future) | Math module | NRA-009 |
| Alignment scorecard | intent-alignment program | All |

---

## L. Maintenance rules

1. Add a row when a new combinatorial class appears in product or architecture docs.
2. Bump `executable_today` when M2+ pipeline ships — cite verification command in commit.
3. Never claim live execution without master-build-plan gate sign-off.
4. REQ links use stable ids: `D-nnn`, `OQ-n`, sprint spec sections, architecture paths.
