# hftr-v2 Master Build Plan

Phased milestones with explicit gates. Each milestone ends with: tests green, browser-verified
flows, agent-docs updated (curation contract), and a gate review logged in
`dev-intent/decisions-log.md`. Order optimizes for a demonstrable end-to-end paper loop early,
then breadth.

Sprint-level task breakdowns: `m0-sprint-spec.md`, `m1-sprint-spec.md` (subsequent milestone
sprint specs are written when the prior gate passes, incorporating learnings).

## Gate status (honest, 2026-07-17)

| Gate | Status | Shipped | Remaining |
|------|--------|---------|-----------|
| **G0** Foundation | **Passed** | Monorepo, Clerk, Drizzle migrations, Vercel skeleton, CI typecheck/lint/vitest | — |
| **G1** Canvas + queue spine | **Passed (local)** | Company wizard, canvas CRUD, queue drain, panels, deterministic assistant, Playwright M1 flows | Remote CI e2e first green run |
| **G2** Research stack | **Partial** | Libraries/topics migration, galaxy MVP, Obsidian zip export, schedule materializer, `research-library.spec.ts` | Real-provider research smoke, autonomous topic soak, default model-profile promotion |
| **G3** Paper trading loop | **Partial** | Deterministic promote→compile→dispatch, pre-dispatch gauntlet, fund approvals, lineage API | Engine tests **83/294** v1 parity target; full NRA finalizer; Playwright flows 3+7 green in CI |
| **G4** Brokers + billing | **Partial (non-billing)** | Assistant proposals, `simulation_runs` API/UI, Alpaca connect UX | **Billing deferred (D-032)**; Stripe; Alpaca paper full-loop e2e; assistant model write path |
| **G5** Multi-venue + live | **Partial** | Live-gate APIs + `ModeSwitch` arming UI; Kalshi demo stub | **Live Alpaca unverified**; crypto/HFT/long-term presets; dedicated worker decision (OQ-2) |
| **G6** Polish + ops | **Partial** | Dead-letter GET/retry API + bottom tab; `maintenance.retention` audit log; `ops/runbook.md` | Perf/a11y pass; trace purge/archive job; Polymarket adapter |

**Not done (explicit):** real-provider Alpaca/Kalshi smoke with operator keys; ≥294 engine
contract tests; Stripe/Clerk billing; live dispatch verification on a funded paper account.

## M0 — Foundation (repo, auth, data, deploy skeleton)

Deliverables:
1. Monorepo scaffold: pnpm + turbo; `apps/web` (Next.js 15, TS strict, Tailwind v4 + tokens,
   shadcn/ui base), `packages/{contracts,db,engine,adapters,llm}`.
2. Clerk auth wired (middleware, sign-in/up, user button); `users_profile` bootstrap.
3. Neon fresh DB + Drizzle: migrations 001 (identity/billing), 002 (companies/modules/links),
   003 (jobs/schedules/llm ledger). Ownership scoping helpers + tests.
4. Vercel project deployed; `/api/health`; `.env.example` complete; CI (typecheck, vitest, lint).
5. Contracts package seeded with carried v1 types (HandoffEnvelope, envelopes, enums).
Gate G0: deployed skeleton, auth round-trip in browser, migrations reproducible from zero.

## M1 — Company canvas + module CRUD + queue spine

1. Company wizard + templates; canvas (React Flow) rendering modules/links from DB; node CRUD,
   drag-persist positions, link creation with kind validation.
2. Custom Postgres queue: jobs table, claim/lease/retry/dead-letter, drain route + cron tick,
   lease sweep, `queue/stats`. Handler registry in `packages/engine`.
3. Node anatomy v1 (status lines from queue projections); three docked panels with spec tabs,
   keyboard toggles (`[`, `]`, `` ` ``), Esc collapse, and per-company `localStorage` open/tab/
   filter persistence.
4. **M1 assistant (deterministic, no model; hardened D-023):** docked chat UI + append-only
   `assistant_messages` history; shared Zod contracts (`packages/contracts/src/assistant.ts`);
   summary-only `tool_results`; failed lookup cards + server logging; 20 user messages/min/company
   cap; atomic multi-row insert (Neon HTTP has no interactive transaction); migration `0007`
   composite index + role CHECK. Regex intent routing to six read-only lookups. Mistral chat,
   write tools, and proposal cards remain M2/M4 (D-022). Retention/erasure unresolved (OQ-10).
5. **Playwright (M1 subset):** `apps/web/e2e/` with `DEV_AUTH_BYPASS=1` dev server on port
   3001; companies template form + `day_trading_starter` workspace flow (full seeded engine
   node names, 10 `smoothstep` edges, panels, shortcuts, module store Modules/Engines, assistant
   persistence + capabilities card); fixture archives test companies on teardown. Optional CI
   `e2e` job against service Postgres.
6. **D-023 canvas/templates:** `holding_fund` module type; expanded paper-safe
   `day_trading_starter` / `engine_day_trading` topology (research → evidence + runtime feed →
   trend → execution; holding fund → Math → fund router; transaction monitor + trading policy);
   function-specific palette/template names; `smoothstep` rounded-elbow edges (not full obstacle
   routing — ELK/pathfinding deferred). Fund/router nodes are topology only — no ledger transfers.
6. **D-024 setup completion:** company/engine templates collect inline capital/scope/exit with a
   Skip-to-draft path; incomplete nodes show inline controls; allocation/time resolve to ValueRefs;
   provider operating budgets render separately.
7. **D-026 canvas node dashboard:** labeled `LinkKind` ports, fixed-size always-visible setup
   fields with per-field Required/Set chips, explicit **Save setup**, chrome-click inspector with
   restore-generated-name (`generated_name_base`, `name_customized`; API `generatedNameBase`,
   `nameCustomized`, `restoreGeneratedName`). **Verified (2026-07-17):** migration
   `0011_canvas_node_generated_names` after `0010`; typecheck/lint/test pass; focused Playwright
   `canvas-node-dashboard.spec.ts` 1/1; IronBee handles/fields/inspector naming + clean console
   (customize/restore via Playwright only).
8. **D-028 ENGINE groups + Math tools:** migration `0014_engine_instances`; engines CRUD API;
   master topic cascade + `restoreEngineTopic`; React Flow `EngineGroupNode` parent chrome;
   delete modes `cascade` \| `ungroup`; Math repeatable multi-attach TOOL links (contracts +
   `LINK_RULES`). **Partial:** canvas parent wiring, delete modal, inspector restore topic, and
   ARCH-004 E2E not verified — see `ui-ux/canvas-engine-group-design.md`.

**Gate G1 (local complete — remote CI evidence pending, D-022/D-023/D-024):** create company → compose
module graph → queue processes a synthetic job → node activity reflects it → panels + assistant +
Playwright M1 flows green. Recorded evidence: migration `0008` applied; typecheck/lint/contracts;
complete two-spec Playwright; IronBee create/skip/inline setup/provider-budget pass with no new
console errors. Remote CI e2e first run remains pending.

**M2 / G2 candidate (2026-07-17):** D-027 service integration plus research product surfaces:
libraries / library_concepts / research_topics (migration `0012`); graph + Obsidian zip export;
galaxy MVP (`react-force-graph-3d` + 2D fallback); schedule materializer + budget-queued claim
semantics; Playwright `research-library.spec.ts` (galaxy + API/UI Obsidian zip export). Remaining
for formal G2 sign-off: live provider/Alpaca smoke with operator keys, autonomous cadence soak
on a real topic, and default model-profile promotion after paper scenario suite.

## M2 — Research stack (Claude+Mistral) + libraries + galaxy MVP + numeric core

1. `packages/llm`: **partially shipped (D-027)** — provider clients, `invoke`/`callSchema`
   (substitution + leak lint), budgets + admission, llm_calls ledger, capability registry.
1b. **Numeric + temporal reference architecture core** (`number-handling.md`): `numeric_values`
   + `calc_operations` + `exchange_calendars` migrations, fixed-point ValueRef store (numeric +
   temporal kinds), static op catalog v1 (financial + temporal ops), expression evaluator with
   unit algebra, injectable clock authority + market calendar service, descriptor generator
   (numeric + temporal orientation block), leak linter (digits + datetime patterns), sanity
   gauntlet. Property-based tests (fast-check) on unit algebra, fixed-point ops, and
   DST-transition temporal ops.
2. Research pipeline: topics → Claude synthesis → concepts/tags/links; library curation;
   research module config UI; left panel Research tab (topics tree, concept browser, markdown).
3. Galaxy view MVP (react-force-graph-3d) with hover/click/search/tag filters; 2D fallback.
4. Obsidian export (md + frontmatter + wikilinks, zip per library).
5. Mistral orchestration step with `escalate_to_strategic` policy.
Gate G2: a research module autonomously builds a browsable, exportable, galaxy-rendered
library on a real topic within budget caps. Flow verified in browser; LLM ledger accurate.

## M3 — Trading loop on paper sim (the core)

**Progress (2026-07-17):** Dynamic safety foundation (D-029) — limits/guardrails/live-gates
contracts + tables (`0013`); `preDispatchGauntlet` wired; lever-resolver; fund-transfer
approve/reject + Approvals tab; ValueRef lineage walk API + Values tab. Engine tests **83**
(still below ≥294 v1 parity target). Live remains fail-closed until arming (M5).

1. Port + harden engine: bands catalog, lever registries (strategic/tactical/execution),
   `enforceScopeStrict`, six-gate activation, executable states, guardrail packages, recovery
   ladders, deterministic dispatch, verification schemas — all from v1 carryover with contract
   tests (target ≥ v1's 294 tests for this layer). **Partial.**
2. Trend modules: Mistral trend emission + lead nomination from libraries + live-API fixtures;
   regime snapshots computed from real Alpaca bars (data module, read-only keys).
3. Trading module (day-trading preset first): Mistral tree expansion → Groq compile →
   paper_sim dispatch → traces/verification → ledger. **Deterministic path shipped.**
4. **NRA pipeline integration:** lever resolver + pre-dispatch + lineage UI **partial**;
   full finalizer ValueRef-only production path still maturing.
5. Middle-bottom control panel v1 (lineage columns, watchlists + shared-access chips, approvals)
   and right panel v1 (ledger, trace inspector with value-lineage links). **Approvals + lineage
   partial.**
6. Fund model v1: seed allocations, fund router (calc-op resolved amounts), approval inbox.
   **Approval inbox shipped; router transfers partial.**
Gate G3: full paper loop research→trade visible end-to-end on canvas + panels; every artifact
schema-validated; live mode provably fail-closed; **numeric/temporal audit passes — an
llm_calls scan of the demo run shows zero raw financial digits or authoritative datetimes in
any model output field, a sampled trade's quantity/price traces fully to live-source roots, and
its TIF/timeout values trace to clock/calendar-rooted refs**. Playwright flows 3 and 7 green.

## M4 — Real brokers + billing + assistant edits

**Progress (2026-07-17, non-billing slice):** `assistant_edits` + `simulation_runs` migration
`0015`; proposal APIs (`rename_module`, `patch_module_config`, `add_watchlist_item`); Assistant
dock proposal cards; Sims tab wired to GET/POST simulations. **Billing deferred (D-032).**
Alpaca connect UX from prior milestones; Stripe/credit packs not started.

1. Alpaca adapter (paper first): connect UX, encrypted credentials, handshake capabilities,
   dispatch + reconciliation on Alpaca paper; funding deep-link UX; balances on company header.
2. Stripe: Clerk Billing tiers + one-click credit packs (embedded checkout, webhook credit
   grants, meters in shell). Budget tiers enforced in admission. **Deferred.**
3. Assistant write-tools (hardened JSON edits, confirm cards, audit trail). **Partial — proposals
   ship; model write path still read-only assistant.**
4. Simulator module: parallel paper runs + comparison UI + feed-results wiring. Analyzer v1.
   **Partial — `simulation_runs` persistence + right panel list; execution handler deferred.**
Gate G4: user can pay (test mode), connect Alpaca paper, trade the full loop on Alpaca sandbox,
and drive setup via assistant. Playwright flows 2/4/5 green.

## M5 — Expansion: prediction markets, crypto preset, HFT/long-term presets, live gate

**Progress (2026-07-17):** Live-gate APIs + `ModeSwitch` arming UI; `execution-context` /
`resolveBrokerAdapter` live path behind arming; Kalshi demo stub; crypto engine remains gated
until `sess-crypto-alpaca-24x7` session envelope seeds. HFT/long-term presets still unavailable.

1. Kalshi adapter (demo env) + prediction trading module preset + probability-edge families.
   **Partial — demo stub only.**
2. Crypto preset (Alpaca crypto 24/7 sessions); HFT preset (throttle envelopes, swarm sizing);
   long-term preset. **Crypto gated on session catalog.**
3. Live-gate checklist implementation (paper history thresholds, verification pass-rate,
   explicit confirmations) + live Alpaca behind it. Compliance copy pass. **Arming slice shipped.**
4. Watcher escalation decision (OQ-2): measure Vercel drain latency during market hours; deploy
   dedicated worker if needed.
Gate G5: at least two real venues trading paper/demo; live pathway gated and documented;
throttle presets enforced.

## M6 — Polish, hardening, deployment finalization

**Progress (2026-07-17):** `maintenance.retention` counts 90d+ traces (no delete); dead-letter
GET/retry API + bottom panel tab; `agent-docs/ops/runbook.md`. Perf/a11y pass not started.

1. Perf pass (canvas 60fps, galaxy LOD ladder as needed), accessibility pass, empty/error states.
2. Retention jobs (90d hot / 1y archive), dead-letter review UI, ops runbook in agent-docs.
   **Partial — runbook + dead-letter UI; trace purge deferred.**
3. Polymarket/Coinbase adapters as capacity allows. Time-scrubber galaxy phase-gate review.
4. v1 replacement: point production domain at v2 per deployment notes.

## Cross-cutting rules (every milestone)

- Zero-trust: no feature "done" without runtime verification (tests + browser via DevTools).
- Curation: update owning agent-docs in the same change; log decisions + open questions.
- Safety invariants (README §curation contract) enforced in review; any live-trading surface
  change requires explicit gate criteria in this plan first.
- **Paper experimentation (D-025):** paper-only cohorts follow
  `research/paper-experimentation-protocol.md` and `/paper-experiment`. Success is intention
  alignment (`testing/intent-alignment-scoring.md`), not absolute paper P&L. Requirements
  coverage lives in `testing/requirements-matrix.md`.

## Open questions (tracked in dev-intent/decisions-log.md)

- OQ-1: exact credit pricing + subscription tier pricing (user input needed pre-M4).
- OQ-2: dedicated worker trigger criteria (latency data from M3/M5).
- OQ-3: Alpaca Broker API (in-app ACH funding) — revisit post-launch.
- OQ-4: v1 database reuse for read-only research import (currently: fresh DB, optional one-time
  content import script from v1 catalogs only).
- OQ-5: Polymarket key custody model (wallet management) before that adapter ships.
- OQ-9: resolved D-024 — inline + Skip-to-draft; capital-bearing modules only; NRA refs.
- OQ-10: resolved D-030 — 90d hot retention for assistant messages/edits; purge job pending.
