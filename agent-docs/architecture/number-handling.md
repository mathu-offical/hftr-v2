# hftr-v2 Number & Time Handling — Numeric Reference Architecture (NRA)

Source: `DevSpecs/hftr-v2.init.spec.md` §NUMBER HANDLING (added 2026-07-16, D-008) + user
directive extending it to date/time handling (2026-07-16, D-009).

**Governing invariant (joins the non-negotiables):** LLMs never read, write, transform, or emit
raw financial numbers **or authoritative dates/times/durations**. Values flow deterministically:
live data source / system clock / market calendar → typed saved k/v value → calculator
operations → lever resolution → execution. LLMs steer by selecting operations and reacting to
qualitative deltas. Every step where a value could morph is deterministically sanity-checked.

**Context vs authority (D-009 distinction):** important numbers and timestamps MAY appear in
LLM context as read-only orientation (e.g. the standard current-timestamp header, descriptor
blocks), but nothing the model relies on for OUTPUT is model-computed — any value that flows
downstream is handled in the deterministic data pipeline, independently of LLM processing.

## 1. Why (hallucination containment — externally verified 2026-07-16)

LLMs are unreliable at arithmetic and at faithfully copying digits across context. A single
transposed digit in a quantity/price is a real-money bug. The same holds — measurably worse —
for time:
- Test of Time / scheduling benchmarks: frontier models <50% on scheduling, as low as 13% on
  duration calculations (humans >95%).
- PRIMETIME (arXiv 2504.16155): datetime parsing and arithmetic primitives are individually
  unreliable across models and prompting conditions.
- "Temporal blindness" (ACL 2026 Findings, TicToc): agents fail to account for elapsed real
  time even when timestamps are provided (<65% alignment), over/under-relying on stale context.
- Established mitigations match this design: inject current timestamp as context, route ALL
  date arithmetic through code execution, store facts with explicit validity windows (TTLs).

The NRA removes the entire failure class by construction: there is no code path where model
output text becomes a financial number, a timestamp, a duration, or a schedule.

## 2. Core primitive: `ValueRef`

Every financial/market number in the system is a row in the `numeric_values` k/v store,
addressed by an opaque handle:

```ts
interface ValueRef {
  ref: string;               // "nv_01J..." opaque handle — the ONLY thing an LLM ever sees
  kind: NumericKind;         // price | quantity | pct | bps | usd_cents | ratio | count |
                             // volatility | probability | timestamp_ms | duration_ms |
                             // session_date | schedule_ref   (temporal kinds: see §4c)
  unit: string;              // "USD_cents", "shares", "bps", "prob_0_1" — unit algebra enforced
  scale: number;             // fixed-point decimal scale (NO floats for money; integers + scale)
  sourceClass: 'live_feed' | 'broker_state' | 'ledger' | 'derived' | 'band_seed' | 'operator_input';
  provenance: {              // full lineage, hash-chained
    sourceId: string;        // feed/adapter/ledger id, or calc op id for derived
    capturedAt: string;      // source timestamp
    ttlMs: number;           // staleness budget by kind (quotes short, seeds long)
    parentRefs: string[];    // for derived values: the exact inputs
  };
  sanity: SanityEnvelope;    // bounds this value must satisfy (kind defaults + context overrides)
}
```

Storage: `numeric_values` table (append-only; a "changed" value is a NEW ref with parent
lineage — refs are immutable, which makes replay and audit exact). Values store
`value_int bigint + scale` (fixed-point), never float. Display formatting is a UI concern.

## 3. Hydration rule: straight from source to k/v

- Data modules (Live APIs), broker adapters (balances/fills), and the ledger are the ONLY
  producers of `sourceClass: live_feed | broker_state | ledger` values. They write directly to
  the store inside the same transaction as their snapshot writes — no intermediate
  serialization through any model-facing text.
- Band/seed catalogs produce `band_seed` values at seed time; operator form inputs produce
  `operator_input` values (Zod-validated numerics from the UI — the user types numbers, models
  never do).
- Derived values are produced ONLY by the calculator (§4).

## 4. Calculator service (the Math module's engine)

`packages/engine/calc/` — pure, deterministic, fully tested. Two API layers:

### 4a. Static operations (fixed formulas, versioned)
Registered financial formulas with typed signatures over ValueRefs, e.g.
`position_size(risk_pct, equity, atr, atr_multiplier) -> quantity`,
`rr_target(entry, stop, r_multiple) -> price`, `pct_change(a, b) -> pct`,
`vwap(bars[]) -> price`, `kelly_fraction(p, b, cap) -> ratio`,
`slippage_bps(expected, actual) -> bps`, `portfolio_heat(open_risks[]) -> pct`.
Each op declares: input kinds/units, output kind/unit, formula version, sanity postconditions.

### 4b. Flexible discrete calculation
A safe expression evaluator over ValueRefs for composition (`add|sub|mul|div|min|max|abs|
round_to_tick|clamp|weighted_avg` …) with unit algebra (USD × ratio = USD; USD + shares =
compile error), division-by-zero and overflow guards, and mandatory output kind declaration.
No arbitrary code, no string math, no float intermediates for money kinds.

### Every calc call (audited in `calc_operations`):
1. Resolve input refs → check TTL staleness (stale input ⇒ `stale_input` failure, never a guess)
2. Unit/kind check → execute in fixed-point → sanity-check output against envelope
3. Write result as new ValueRef (`sourceClass: derived`, parents recorded) → return `{ref, qualitative}`

## 4c. Temporal authority (D-009)

Temporal kinds are first-class ValueRefs: `timestamp_ms`, `duration_ms`, `session_date`,
`schedule_ref`. Rules:

- **Single clock authority:** `packages/engine/clock.ts` is the only source of "now"
  (injectable for tests/replay — deterministic replay requires a frozen clock). Application
  code never calls `Date.now()` directly outside the clock module (lint rule).
- **Market calendar service** (`packages/engine/calendar/`): exchange sessions, holidays,
  half-days, DST transitions, venue timezones (America/New_York for US equities; 24/7 for
  crypto; venue-specific for prediction markets). Backed by seeded exchange-calendar data with
  a scheduled verification job (calendars are compliance-relevant session-legality inputs,
  carried from v1's session constraint catalog). All session math (`is_market_open`,
  `next_open`, `time_to_close`, `sessions_between`, `same_trade_date`) is calendar-service
  calc ops — never model arithmetic and never naive UTC day math.
- **Temporal calc ops** join the static catalog: `now()`, `elapsed_since(ts)`,
  `add_duration(ts, dur)`, `sessions_until(event_ts)`, `within_window(ts, window)`,
  `expiry_check(ref)`, `bar_window(period, count)` — all timezone-explicit (IANA zone stored
  with every timestamp ref), DST-safe, fixed-precision (ms integers).
- **Every temporal output the pipeline relies on is a ref:** order TIF expirations, fill
  timeouts, recovery backoffs, time stops, session windows in decision trees, cron-derived
  windows, event blackout periods, trend validity windows. Models select duration BANDS
  (e.g. `fill_timeout_ms_band` position) or calc plans; the resolver produces the concrete ms
  value.
- **Staleness/validity are temporal sanity checks:** every ValueRef already carries `ttlMs`;
  the gauntlet's staleness check is a clock-service comparison, and evidence/concept validity
  windows (v1's nightly re-verification rule) are enforced by calendar-aware jobs, not model
  judgment.

### What models see for time
The `callSchema` context header includes a deterministic **temporal orientation block**
(current timestamp ISO + venue session state + time-to-close class) — this is allowed READ-ONLY
context per D-009. Temporal descriptors mirror numeric ones: `freshness: fresh|aging|stale`,
`sessionPhase: pre_market|open|power_hour|closed|overnight`, `timeToClose: ample|tight|imminent`,
`elapsedClass: just_now|recent|hours|days`. Models reason over these categories; any literal
datetime/duration in a model OUTPUT field is a `numeric_leak` (datetime patterns are part of
the leak linter's detection set, with the same whitelist mechanism for enum-like fields).

## 5. What LLMs actually see and say

LLM-facing payloads substitute every number with its ref + a **qualitative descriptor block**
(deterministically generated, safe to reason over because it is categorical, not numeric):

```json
{ "equity": { "ref": "nv_x1", "band": "typical", "trend": "rising", "deltaClass": "small_up",
              "vsThreshold": "above", "freshness": "fresh" } }
```

- Descriptors: band position (below_min/low/typical/high/above_max vs the bounded-range
  catalog), delta class (5-bucket, matching v1's soft-condition preference for 3–5 state
  buckets), threshold relations, freshness class, percentile bucket.
- LLM tools available to model tiers: `calc.static(<op>, {argName: ref,...})`,
  `calc.expr(<expression over named refs>)`, `values.describe(ref)`, `values.compare(refA, refB)`.
  Tool RESULTS return refs + descriptors — never digits.
- Prompt contract (enforced + tested): system prompts instruct models to reference values by
  ref only; a **numeric leak linter** runs on every model output — any digit sequence in fields
  not whitelisted as enum/ordinal (e.g. "3 buckets", version strings are whitelisted patterns)
  ⇒ `numeric_leak` schema failure ⇒ bounded repair ⇒ fail job. Output schemas type all
  value-bearing fields as `{ ref: string }`, so raw numbers are also structurally rejected.

## 6. Lever resolution (bridging choices to real numbers)

Levers already constrain models to bounded choices. NRA tightens the resolution:
- Models select `bandPosition` (enum) or supply a **calc plan** (op + input refs) — never a
  literal number.
- The deterministic lever resolver maps bandPosition → concrete value from the band catalog, or
  executes the calc plan, then clamps to the band envelope (`out_of_range` fail-closed, carried
  from v1 `enforceScopeStrict`).
- Compile (Groq) emits `ActionInstruction` fields as refs + calc plans; the **deterministic
  finalizer** below compile resolves every ref to a concrete fixed-point number, applies
  venue precision/tick rounding tables, and runs the final sanity gauntlet (§7). Groq formats
  structure; it cannot inject digits (schema types + leak linter).
- **Production wire (D-057):** `compile.select` persists `action_instructions` then enqueues
  `dispatch.paper_trade` with **`instructionId` only** (no raw quantity on the job).
  `executePaperTradeFromInstruction` → `resolveInstructionFromRefs` reuses compile lineage.
  Operator UI `POST …/trade` still records `operator_input` refs (separate authority class).
- **Tier model selection (D-027):** company operating UI and `llm_policy` tier picks are
  qualitative only — allowlisted model ids, estimated cost bands, and privacy retention labels.
  Model tiers never emit order quantities, prices, or schedules; compile output stays band/ref
  shaped until the model-free finalizer.

## 7. Sanity gauntlet (every morph point deterministically checked)

Checks run at hydration, every calc op, lever resolution, finalization, and adapter mapping:

| Check | Example |
|---|---|
| Kind/unit algebra | can't add price to quantity; pct stays 0–100 domain; can't add two timestamps (ts + dur = ts; ts − ts = dur) |
| Temporal plausibility | timestamps within plausible windows (no past-dated orders, no expiry beyond policy horizon); durations within kind bands; timezone field mandatory |
| Calendar consistency | session-scoped values reference valid trading sessions; trade_date derivation matches venue calendar (incl. overnight/extended rules from v1 session catalog) |
| Bounds envelope | quantity ≤ allocation-derived max; price within ±20% of last quote (per-kind defaults + policy overrides) |
| Staleness (TTL by kind) | quote refs > TTL ⇒ block with `stale_input`, prefer `lastVerifiedPatternRef` fallback |
| Cross-consistency | notional = qty × price recomputed and matched; stop < entry for longs |
| Precision/tick | venue rounding tables; sub-tick ⇒ deterministic round, logged |
| Ledger conservation | fund transfers sum to zero across ledger entries; balance_after recomputed |
| Provenance completeness | derived values must trace to live/ledger/seed roots; orphan refs rejected |

Failures produce typed block reasons (`numeric_sanity_block` family added to the v1 guardrail
reason families) and are visible text-first in UI.

## 8. Math module (user-facing surface)

A per-company utility module node (auto-created, non-deletable, named **Deterministic Math
Calculator**) exposing the NRA:
- Node status: calc ops/min, sanity blocks count, stale-value warnings.
- Expanded view + panel: live k/v browser (search by kind/source/module), value lineage graph
  (ref → parents → source), calc operation log with formula, inputs, outputs, sanity results,
  static-op catalog reference.
- It is the transparency window into "what numbers the system is using and where each came
  from" — directly supporting funds-pipeline trust.
- Seeded paper engines wire `holding_fund → math → fund_router` fund-route links on the canvas.
  **Topology only in M1** — actual fund movement through holding fund/router remains M3+.
- **Calc-ref ports (D-088):** owner↔Math attachments render as a single **Calc ref** connection
  (canonical `math → owner` `data_feed`); stream labels use info type, not peer names.

## 8a. Master Clock + Time processors (canvas surface for D-009 / D-088 / D-091 / D-108)

Temporal authority is visible on the company canvas the same way Math surfaces D-008:

| Module | Role |
|--------|------|
| **`clock`** | Company singleton (auto-seeded). Surfaces injectable clock “now”, session display mode, IANA zone. Emits temporal **authority** refs only — no LLM path. Cannot join ENGINE membership. **D-091:** new engines bind clock via motherboard `clock` utility (`engine_utility_links.from_module_id` → Master Clock) instead of direct `clock → member` edges; legacy graphs grandfathered until reflow. **D-245:** cadence rail = Clock + company Time only — **no** company Math hub. |
| **`time`** | Engine Time hub (and repeatable processors): `elapsed`, `add_duration`, `timezone_convert`, `session_window`, `schedule_ref`. **D-108 ports:** Authority in (left), Schedule (top), Time bus (right). Operator configures transform + descriptor; models may later nominate **op + input refs / bands**, never literal datetimes. |
| **`math` `engine_math_hub`** | Per-engine numeric audit/lineage rollup (D-245), docked inside engine bounds near Time — never fund_route middleman. Dedicated owner docks (`fund_path`, `desk_execution`, …) remain. |

**Company clock authority:** the singleton `clock` module is the sole source of injectable “now”
and session orientation refs for the company. Engine members receive temporal context through the
engine motherboard clock bind and Time hub → **clock_in** (bottom far-left) on
`TIME_BEARING ∪ {library, display}` — additive, never replacing data/system rails. Math stays
Calc-ref only (no clock_in).

Links (member graph): `clock → time` via `data_feed`; `time → clock_in recipients` via `data_feed`
(placed on clock_in). **D-091:** prefer `engine_utility_links` clock bus over direct
`clock → consumer`. Compile-time “every schedule must traverse a Time node” remains a documented
follow-up. Full bus design: `architecture/engine-motherboard-io-design.md`. Port audit:
`ui-ux/canvas-connection-point-audit.md`.

## 8b. Per-module allocation and target exit (implemented D-024)

The common setup contract is module-type-specific rather than forcing meaningless fields onto
every utility:

- `holding_fund`, `fund_router`, `trading`: capital allocation + target exit.
- `research`, `library`, `live_api`, `trend`, `trading`, `simulator`, `analyzer`: topic/sector.
- `math`, `policy`, `generator`, `display`: no common setup requirement; their own config schema
  remains authoritative.

Company and engine template forms collect the union of their nodes' requirements and apply values
only to matching nodes. Skip creates draft nodes with missing-field chips; the selected node
exposes the same controls inline. Activation fails closed with `module_setup_incomplete`.

**NRA implementation:**
- `apps/web/lib/module-setup.ts` converts validated decimal strings into fixed-point
  `operator_input` ValueRefs: fixed USD → `usd_cents` scale 0; percentages → `pct` scale 4.
- Target exit uses an offset-bearing ISO input from the browser and records `timestamp_ms` with
  the operator's IANA timezone. Past targets are rejected before recording.
- `modules.capital_allocation_ref` and `modules.target_exit_ref` hold opaque refs only; changed
  values append a new `numeric_values` row. `modules.topic_sectors` is qualitative text and may
  enter scoped model context without numeric substitution.
- Provider/LLM operating budgets are never inferred from these refs; `llm_budgets` and provider
  key sources remain a separate admission/spend surface.

## 9. Build integration

- `packages/contracts`: `ValueRef`, `NumericKind` (incl. temporal kinds), `SanityEnvelope`,
  calc op signatures, descriptor enums (numeric + temporal), `numeric_leak`/
  `numeric_sanity_block` failure codes.
- `packages/engine/calc/`: store access, static ops (financial + temporal), expression
  evaluator, descriptor generator, leak linter (digit + datetime patterns), sanity gauntlet.
  100% unit-test coverage target; property-based tests (fast-check) on unit algebra,
  fixed-point ops, and DST-transition temporal ops.
- `packages/engine/clock.ts` + `packages/engine/calendar/`: injectable clock authority and
  exchange calendar service (seeded calendar data + scheduled verification job). Lint rule
  bans direct `Date.now()`/`new Date()` outside the clock module in engine/llm packages.
- DB: `numeric_values`, `calc_operations` (see data-model.md §Numeric reference store).
- Milestones: value store + calculator + clock/calendar + leak linter land in **M2** (research
  pipeline already needs descriptors + temporal orientation); full lever-resolution + finalizer
  integration and the Math module UI land in **M3** (trading loop). Gate G3 adds: demonstrate
  an end-to-end trade where no model payload contained a raw financial digit OR authoritative
  datetime in output fields (assert via llm_calls audit scan), and where the order's TIF/
  timeout values trace to clock/calendar-rooted refs.
