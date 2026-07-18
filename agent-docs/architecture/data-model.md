# hftr-v2 Data Model (Neon Postgres, Drizzle)

Fresh schema. Naming: `snake_case`, `uuid` PKs (`gen_random_uuid()`), `created_at`/`updated_at`
timestamptz on every table, `clerk_user_id text` ownership column on every user-owned root.
All JSONB payloads have a Zod schema in `packages/contracts` and a `schema_version` column.

## Identity & billing

- **users_profile** — clerk_user_id (unique), display prefs, default company id.
- **platform_credits** — clerk_user_id, balance_cents; append-only **credit_ledger**
  (id, user, delta_cents, reason `stripe_purchase|seed_allocation|llm_usage|refund|adjustment`,
  stripe_payment_intent_id nullable, company_id nullable). Balance = materialized, ledger = truth.
- **subscriptions** — mirror of Clerk Billing state (plan, status, period) for server-side gating.

## Companies & modules

- **companies** — clerk_user_id, name, philosophy_prompt, sector_focuses text[] (D-044/D-106
  active refined specifics; create expands selected groups), universe_excludes text[] (D-106
  operator ticker carve-outs; separate from focuses),
  philosophy_profile jsonb (slideable
  axes → LeverSetting; D-025), llm_policy jsonb (privacy mode, tier model ids, profile;
  D-027), goals jsonb, reinvestment_policy jsonb, scoping_policies jsonb, mode `paper|live`,
  seed_credits_cents (paper), equity_cents / equity_ref / equity_as_of / equity_status
  (`fresh|stale|unavailable`) / equity_version (materialized read projection; cards display
  Seed + Current value), broker_connection_id nullable FK → broker_connections (preferred
  bind; not exclusive — multi-source via `module_service_bindings`, D-090),
  live_armed_at timestamptz nullable, live_gate_evidence_id uuid nullable FK →
  live_gate_evidence (D-029),
  auto_fund_policy jsonb (approval thresholds), archived_at.
  Soft caps: `MAX_MODULES_PER_COMPANY` (200; hub + members + dedicated Math) and create-form
  `MAX_ENGINES_PER_COMPANY` (16). Company jobs are company-serial (D-052).
  **D-082:** companion append-only **operator_philosophy_directives** (company_id,
  module_id nullable, body, created_by_clerk_user_id, created_at) — immutable operator
  constraints folded into synthesize; never agent-writable. Migration `0035`.
  **D-090:** **module_service_bindings** (company_id, module_id, source_kind
  `broker_connection|user_api_key|user_research_key`, capability, exactly one of
  broker_connection_id / user_api_key_id / user_research_key_id, status
  `bound|stale|missing|revoked`) —
  persisted coverage from verified sources; resolved on broker verify and module/engine/
  company create. GET `/api/companies/:id/service-coverage`. Migration `0036`; research-key
  widen `0039`; **0040** drops legacy Neon CHECK `module_service_bindings_source_check`
  that 500'd coverage when binding research keys.
  **realized_pnl_events** append-only fill-time PnL for session daily-loss limits
  (cash ledger stays cash-only).
  **D-093:** `user_research_key_id` on bindings + source_kind `user_research_key`;
  research gather keys bind `research_provider` (and bars for market-data providers).
  `companies.auto_fund_policy` shape: `{ mode: off|propose_on_equity_refresh, amountBps }`
  — equity.refresh may propose inbox transfers only.
- **engine_instances** (D-028, migration `0014_engine_instances`) — company_id, template_id,
  label, master_topic_sectors text[], canvas_bounds jsonb `{x,y,width,height}` nullable.
  Member modules reference via `modules.engine_instance_id`; Math modules never join.
- **engine_utility_links** (D-091, migration `0037`) — company_id, to_engine_id FK
  → engine_instances, bus `data_in|data_out|clock|funds|system_control`, from_engine_id FK
  nullable (inter-engine upstream), from_module_id FK nullable (company utility module e.g.
  Master Clock), stream_id varchar(80) nullable, stream_descriptor varchar(200) nullable.
  CHECK exactly one of (from_engine_id, from_module_id) is set. Inter-engine `data_out→data_in`
  pairs share stream_id; descriptors are qualitative only (D-008/D-009). API CRUD at
  `/api/companies/:companyId/engine-utility-links`. Design:
  `architecture/engine-motherboard-io-design.md`.
- **modules** — company_id, type `research|library|live_api|trend|trading|policy|generator|
  simulator|analyzer|holding_fund|fund_router|math|display`, subtype (trading: `crypto|prediction|
  hft|day|long_term|custom`), name, config jsonb (schema per type), status
  `active|paused|error|draft`, legacy allocation_cents, topic_sectors text[],
  topic_sectors_overridden boolean default false (D-028: true when member opts out of engine
  master topic cascade), capital_allocation_ref nullable, target_exit_ref nullable,
  canvas_position jsonb {x,y}, philosophy_override text,
  engine_instance_id uuid nullable FK → engine_instances (`ON DELETE SET NULL`, D-028),
  tool_owner_module_id uuid nullable self-FK (`ON DELETE SET NULL`, unique; D-033). Migration
  `0018_dedicated_math_ownership` adds explicit ownership without guessing for legacy Math rows.
  Notes: `math` retains one unowned company seed for shared topology (D-008/D-023). D-033 also
  provisions one dedicated Math row for each research, trend, trading, simulator, analyzer, or
  generator owner. Dedicated ownership is explicit through `tool_owner_module_id`; Math remains
  outside `engine_instance_id` even when visually contained by its owner's engine. D-028 shared
  multi-attach Math remains valid. `holding_fund` represents a deterministic capital source on the
  canvas (`HoldingFundModuleConfig`: `source`, `allocationPolicyRef`) — topology only in M1,
  no ledger transfers yet (D-023); `policy` nodes occupy the rightmost canvas column and bind
  policy envelopes to the trading modules linked into them (spec: "trading modules → trading
  policies").
  **D-091 AnalyzerModuleConfig** (`analyzer` modules): `emitMode`
  `to_library|to_desk_stream|verify_loopback` — controls library admission, desk/bus emit,
  and verification loopback; research ENGINE terminal analyzer defaults `to_desk_stream` (or
  `to_library` for seed-keeper fabrics); execution analyzers default `verify_loopback`.
  Validated in `packages/contracts/src/modules.ts` (`AnalyzerModuleConfig`).
- **module_links** — company_id, from_module_id, to_module_id, link_kind
  `data_feed|directive|verification|fund_route`, config jsonb. Canvas edges are loaded by
  `loadCompanyLinkGraph` and consumed by research/trend/promote (D-041) — not visual-only.
- **fund_transfers** — company_id, from (module|company_pool|reserve), to, amount_cents,
  status `requested|approved|auto_approved|rejected|settled`, requested_by
  `user|module|policy`, approved_at, trace ref.

## Broker connections

- **broker_connections** — clerk_user_id, venue `alpaca|kalshi|polymarket|coinbase`,
  mode `paper|live`, ciphertext (AES-GCM via `CREDENTIALS_ENCRYPTION_KEY`), key_hint,
  status `connected|error|revoked|unverified`, capabilities jsonb, last_verified_at,
  venue_account_id. Preferred company bind via nullable `companies.broker_connection_id`
  (D-027); multi-source capability coverage via `module_service_bindings` (D-090).
  Live mode credentials rejected until live gate.
- **broker_balances_snapshot** — connection_id, cash_cents, buying_power_cents, positions jsonb, as_of.
- **dispatch_reconciliation_events** — company/connection scoped submit/poll/fill/timeout events
  with optional venue request ids (no secrets).

## Research & knowledge

- **research_topics** — company_id, module_id, parent_topic_id nullable (tree), title, status,
  priority, provenance. Implemented (migration `0012`). **D-040 (specified):** add
  `synopsis_md` (hybrid article agent synopsis), usage counters
  (`query_count`, `last_queried_at`, `reference_count`, `last_referenced_at`). Topics are
  **module-side directives** (work programs that may spawn articles/libraries) — not galaxy
  nodes and not library entities.   **D-086 / D-096:** seeded forest of **separate top-level
  catalog roots** (Strategy families, Guardrails, …, Sector knowledge) plus overview
  **Seeded trading mechanisms**; company sector focuses add **Desk focus** combination topics;
  class/tier/sector leaves nest under their catalog group via `parent_topic_id`;
  membership via `topic_concepts` is organizational focus, while concepts remain
  library-side.
- **topic_concepts** — **D-040 (specified):** join `(topic_id, concept_id, sort_order, role?)`
  unique `(topic_id, concept_id)`; defines topic membership / galaxy focus subgraph and
  Article tab section order.
- **concepts** — company_id, origin_module_id, title, slug, body_md, summary,
  embedding vector nullable (pgvector, phase-gated), source_urls jsonb, confidence.
  **D-040 (specified):** same usage counter columns as topics (system query + research
  reference telemetry for optimization and visual weight).
- **concept_tags** — concept_id, tag (lower_snake_case); **tags** registry (tag, kind, color_hint).
- **concept_links** — from_concept_id, to_concept_id, relation
  `supports|contradicts|causes|correlates|mentions|derived_from`, weight_band
  `weak|typical|strong`, source_class. Implemented (migration `0010`); galaxy UI in M2.
  (concepts + concept_links + tags = the galaxy graph AND the Obsidian export source.)
- **libraries** — company_id, optional module_id, name, topic_scope text, master_library flag,
  status. Implemented (migration `0012`).
  **library_concepts** join (library_id, concept_id, curation_status
  `proposed|accepted|auto_admitted|rejected|archived`). **D-040:** primary library membership
  drives hard nested galaxy nests; secondary memberships are badges, not duplicate nodes.
  **D-045 / D-079:** `bootstrapCompanyKnowledge` ensures library rows for every `library` module,
  creates a dedicated **Seeded trading mechanisms** library, and seeds full vendored
  catalog families (`strategy_families`, `compound_strategies`, `recovery_ladders`,
  `guardrail_packages`, `session_constraints`, `broker_policy_envelopes`,
  `trend_lead_patterns`) as `catalog_seed` concepts with rich operator markdown bodies
  (overview, KV identity, trends, `[[sys:…]]` tool/lever/field chips, sub-variants) from
  catalog payloads; bodies rematerialize on upsert.
  **D-069:** system-curated folders use `system:*` topic scopes (`movers`, `execution_logs`,
  `daily_summaries`, `runtime_policies`, `trend_lists`, `sector_news`) via
  `SYSTEM_LIBRARY_REGISTRY` + rigid `SystemDocKind` shapes.
- **system_normalized_views** — **D-072** (migration `0033`): company-scoped verified
  multi-source seals (`kind` movers_board|sector_bulletin|daily_summary_phase, subject_key,
  seal_id, bundle jsonb `VerifiedNormalizedBundle`, expires_at, report_concept_id). Consumers
  skip re-verify while seal valid; dual-persist always writes a readable report concept.
  **Market posture projection (D-081–D-112 / D-120):** read APIs assemble seals + positions +
  watch/trend/pipeline into `MarketHubResponse` (`GET …/market-hub`). Lightweight
  `GET …/market-hub/live` returns equity + position marks/sparks only (`MarketHubLiveResponse`)
  for silent UI merge — never reseals. `POST …/market-hub/analyze` creates a synthesis run,
  enqueues force-reseal jobs + narrative (POSTURE_RESEARCH), returns `runId`; UI polls
  `GET …/market-hub/synthesis/*` for stages and must not block the job path.
- **market_hub_synthesis_runs / market_hub_synthesis_stages** — **D-120** (migration `0042`):
  company-scoped Analyze run status + ordered stage rows (`stage_id` unique per run) for the
  live Model canvas. Stage summaries are operator text/bands only.
- **curation_score_events** — **D-071** (migration `0033`): append-only librarian prior
  telemetry (gate_id, score_band low|medium|high, passed, reason, raw_meta). Models see
  bands + repairHints only — never raw ratios from raw_meta.
- **knowledge_access_events** — **D-040 (optional/specified):** append-only access log
  `(company_id, entity_kind topic|concept, entity_id, access_kind query|reference, actor, created_at)`
  when denormalized counters are insufficient under contention.
- **evidence_packages** — v1 contract: class, symbols/sectors, digest, findings jsonb, expiry,
  legal_use_class `ALLOWED|RESTRICTED|REVIEW_REQUIRED`.
  **D-079:** operator article submit writes `research_evidence` with `source_kind: operator`
  + concept `source_class: operator` via `POST .../research/submit` (sync, model-free).

UI/layout contract: `ui-ux/research-galaxy-topic-view-design.md` (D-040).

## Trends → trades (v1 spine, per-module scoping)

- **trends** — trend_module_id, company_id, title, thesis, symbol_refs text[],
  regime_snapshot jsonb (RegimeSnapshot), status, evidence refs.
- **leads / lead_packages** — trend_id, trading_module_id nullable (routed target), symbol(s),
  strategy_family_ref, confidence, handoff_envelope jsonb, activation_result jsonb (six gates),
  status.
- **watchlists** — company_id, creator_module_id, name, symbols jsonb;
  **watchlist_access** (watchlist_id, module_id, access `read|write|analyzing`) — powers the
  middle-bottom panel's "who else is editing/analyzing this structure" requirement.
- **decision_trees** — lead_id, trading_module_id, tree_version, root_branches jsonb,
  lever_state jsonb, recovery_protocol jsonb, block_reasons jsonb;
  **tree_refinements** — tree_id, layer `strategic|tactical|execution`, lever deltas, envelope.
- **executable_states** — tree_id unique, state `watch|wait|order|blocked|fallback`,
  instruction payloads per state, last_verified_pattern_ref.
- **action_instructions** — tree_id (nullable until the LLM pipeline lands; operator-initiated
  instructions carry `OPERATOR_INPUT` authority in the envelope instead), action_verb,
  order_spec with ValueRef handles (quantity_ref, limit_price_ref, fill_timeout_ref),
  guardrail refs, verification_schema_version, client_order_id unique, envelope.
  Implemented 2026-07-16 (D-014) together with the four tables below.
- **deterministic_tasks** — instruction_id, broker order payload, idempotency_key unique, status.
- **action_traces** — IMMUTABLE append-only: task ref, venue, mode, fills, slippage, outcome,
  simulator-gap tags (paper), session_legality_snapshot, policy_envelope_version, provenance.
- **verification_records** — trace/task ref (nullable for blocked), pass|fail|blocked,
  field results, failure_code, recovery_protocol_id.
- **ledger_entries** — company_id, module_id, kind `trade|fee|transfer|simulation`,
  amount, balance_after, trace ref. (Right panel's canonical feed.)
- **positions** — (module_id, symbol) unique; qty bigint (whole units), avg_cost_cents,
  realized_pnl_cents; optional connection_id / venue provenance (D-090). Written ONLY by
  the dispatch layer at fill time; sells above held quantity are blocked
  (`broker_policy_block` — no shorting in paper v1). Implemented 2026-07-16 (D-016).
- **realized_pnl_events** — append-only (company_id, module_id, symbol, realized_cents,
  trace_id, created_at). Day-bucket loss for operating limits; cash `ledger_entries`
  remain cash-only (D-090).
- **trend_candidates** — module-scoped candidates with direction, strength band, drift
  ValueRef, and source_class `deterministic_scan|model_nominated` (the deterministic
  `trend.scan` handler writes the former; LLM tiers will write the latter). D-016.
- **catalog_entries** — generic seeded-catalog store: (catalog, entry_key) unique,
  catalog_version, title, tier, payload jsonb. Seeded from
  `packages/db/src/seed/catalogs/*.json` via `seed-catalogs.ts` (97 entries at
  `v1_snapshot_2026_07_16`). D-016. **D-045 / D-079:** full families in `SEED_CATALOG_NAMES` (plus
  representative `SEED_CATALOG_TARGETS` for tests/links) are materialized into company `concepts` +
  library membership on company create and idempotent research/library ensure paths; concept
  `body` is leak-lint-clean markdown suitable for inspector + Obsidian `.md` export.
- **watchlist_items** — (module_id, symbol) unique; bias `long|short|neutral`, note,
  source_class `operator|trend_promotion|movers_rank|library_relevance`, status
  `suggested_search|suggested_verified|watching|triggered|archived` (D-092 compound
  suggestion tiers). Automation must never clobber `source_class=operator`. Owned by
  trading/trend modules only (API 422s otherwise); surfaces in Market posture + bottom
  panel Watch lists with tier filters. Migrations `0003_bitter_piledriver`,
  `0038_watchlist_suggestion_tiers`. D-017, D-092.
- **concepts** — research-module curated knowledge rows (title, body, tags jsonb,
  source_class `catalog_seed|deterministic_placeholder|model_generated|operator`, optional
  `research_run_id`, status `active|archived`, `archived_at`, qualitative `confidence_band`
  `low|medium|high`). Soft-delete + Archive/Clear archive (D-047). Written by D-045 catalog
  bootstrap and the D-039 synthesize/admit path (orchestrated by `research.curate`).
  Migrations `0004_petite_hellfire_club`, research bus `0019`, archive/confidence `0032`.
- **research_topics** — also carry `confidence_band` + `archived_at` (D-047); live lists exclude
  `archived`. **libraries** carry `archived_at` for soft-delete.
- **research_requests / research_evidence / research_results / research_runs** — typed research
  bus (D-039): request envelope + mode, append-only evidence packages, validation/admission
  projection, operator-visible run phase. Migrations `0019_research_bus`, `0020_research_keys`.
- **library_concepts** — curation_status includes `auto_admitted` (D-039 admission default).
- **lead_packages** — six-gate admission record (activation-validation.md): trend →
  gates jsonb evidence, status `pending|admitted|rejected|decomposed|expired`,
  strategy_family, optional target trading module. Written by `trend.promote`. D-021.
  `evidence_fit` consults admitted library artifact refs when library concepts exist (D-039).
- **trend_candidates** — optional `artifact_refs` jsonb copied from admitted library refs at
  promote (migration `0021_trend_artifact_refs`).
- **decision_trees** — tactical decomposition of an admitted lead: branches jsonb,
  recovery_ladder jsonb, status `draft|compile_ready|compile_blocked|dispatched|
  invalidated`, source_class honest placeholder labeling. D-021.
- **compile_events** — execution-agent compile outcome: `compiled|blocked` with
  block_reason taxonomy (`incomplete_branch`, `unsupported_order_class`,
  `missing_recovery_ladder`, …), optional instruction_id into action_instructions,
  lineage jsonb. Last model-bearing stage boundary before model-free dispatch. D-021.

## Simulations & training

- **simulation_runs** — simulator_module_id, target_trading_module_id, params jsonb, seed,
  status, parallel_group_id; **simulation_results** — run_id, pnl, drawdown, slippage stats,
  divergence tags, feed_target jsonb (which trend/research module receives results).
- **training_feedback** — bounded band/weight deltas only (mutation_class enforced), source run,
  applied_control_snapshot ref.
- **control_snapshots** — company/module scope, philosophy profile + lever state + envelope
  versions + content hash (D-029 `ControlSnapshot` contract).
- **guardrail_evaluations** — APPEND-ONLY: package_id + `GuardrailEvaluation` jsonb.
- **live_gate_evidence** — APPEND-ONLY: checklist evidence + `overall_pass`.
- **operating_limit_evaluations** — APPEND-ONLY: `LimitsSnapshot` jsonb per evaluation.

## Numeric reference store (see number-handling.md)

- **numeric_values** — APPEND-ONLY. id (`nv_` ref), kind (numeric + temporal kinds), unit,
  scale, value_int bigint (fixed-point; never float for money; ms integers for time),
  timezone text nullable (mandatory for temporal kinds, IANA), source_class `live_feed|
  broker_state|ledger|derived|band_seed|operator_input|clock|calendar`, source_id, captured_at,
  ttl_ms, parent_refs uuid[], sanity_envelope jsonb, company_id, module_id, lineage_hash.
  Indexed on (company_id, kind, captured_at desc) and source_id.
- **exchange_calendars** — venue, session_date, open/close/half-day/holiday data, timezone,
  catalog_version, verified_at (scheduled verification job keeps this current; feeds the
  calendar service and session-legality checks).
- **calc_operations** — APPEND-ONLY audit: op_kind `static|expr`, op_name/expression,
  formula_version, input_refs, output_ref, sanity_results jsonb, status `ok|stale_input|
  sanity_block|unit_error`, caller (job_id, tier, module_id), duration_us.
- Retention: values referenced by traces/trees/ledger follow trace retention (90d hot/1y
  archive); unreferenced ephemeral quote values pruned on a short schedule (they remain
  reconstructible from feed snapshots).

## Orchestration (see job-orchestration.md)

- **jobs** — queue_class, priority, run_after, locked_until, locked_by, attempts, max_attempts,
  idempotency_key unique, payload jsonb, status `pending|active|completed|failed|dead`,
  company_id, module_id, cost_estimate jsonb. Payload is identity + intent only — never
  operator API keys or broker secrets (D-074; `assertNoSecretsInJobPayload` at enqueue).
  Inline promote drain claims only `RESEARCH|TACTICAL|COMPILE|DISPATCH|VERIFY` (no
  maintenance kick) so posture/library side-jobs cannot starve paper fill.
  `maintenance.position_exits` (via `maintenance.sweep`) scans open paper positions for
  model-free exits: targetExit deadline, ATR stop (synthetic ATR × catalog multiplier),
  RR tp1/tp2 scale-out + tp3 exit, spread-buffered breakeven, catalog time_stop →
  sell `actionInstructions` + `dispatch.paper_trade` (gauntlet intact). Recovery phase
  labels are attached on exit envelopes; tactical trees bind catalog recovery ladder
  phases when `strategyFamily` is known.
- **job_schedules** — cron-like recurring definitions per module cadence.
- **llm_calls** — provider, model, tier, module_id, tokens in/out, cost_cents, latency_ms,
  schema_valid, leak_lint_passed, rate_limit_remaining, request_id, retention_class, failure,
  idempotency_key, job_id. Never stores prompts, outputs, or secrets (D-027).
- **llm_artifacts** — idempotency_key unique, schema_ref, provider, model, validated output
  jsonb for replay-without-recall.
- **llm_budgets** — scope (user/company/module), provider, window, max_calls, max_cost_cents,
  consumed counters. The Company → LLM / operating projection displays these provider call/cost
  counters and credential source (`user_key|unconfigured` only) separately from module capital
  allocation (D-024/D-027).
- **user_api_keys** — per-user LLM provider ciphertext + key_hint + retention_attested
  (`none|org_zdr`); providers include anthropic/mistral/groq/cerebras/fireworks/openrouter.

## Assistant

- **assistant_messages** — APPEND-ONLY company + user-scoped chat log (M1, D-022; hardened
  D-023). Columns: `company_id`, `clerk_user_id`, `role` (`user|assistant|system` — DB CHECK
  constraint), `content`, `tool_results` jsonb (summary cards: `tool`, `summary`, `status`
  only; validated by `AssistantToolResults` in contracts), `created_at`. Indexes:
  `(company_id, created_at)` and `(company_id, clerk_user_id, created_at)` (migration
  `0007_left_firestar`). No UPDATE/DELETE in app code. `GET/POST
  /api/companies/:companyId/assistant` returns newest 100 in chronological order. POST admission:
  20 user messages per company per rolling minute. User + assistant rows insert in one multi-row
  `INSERT` (Neon HTTP driver lacks interactive transactions). M1 path is deterministic regex
  intent routing to six read lookups — **no LLM tier calls**. Retention: **90d hot** per D-030;
  purge/archive job pending (same milestone as trace cold storage).
- **assistant_sessions** — not implemented in M1; session grouping deferred until Mistral chat
  ships (M2+). Company + user scoping on messages is sufficient for M1 history.
- **assistant_edits** — APPEND-ONLY audit of assistant-proposed mutations (M4): tool name, JSON
  patch, affected entity, confirmation state. **90d hot retention** per D-030; purge job pending.

## Seed catalogs (read-mostly, versioned)

- **strategy_families**, **guardrail_packages**, **recovery_ladders**, **session_constraints**,
  **broker_policy_envelopes**, **sector_seeds**, **event_archetypes**, **macro_triggers** —
  loaded from the v1 JSON catalogs via seed scripts; each row keeps `catalog_version` and
  `literature_refs`.

## Integrity rules

- Ownership scoping helper (`packages/db/scoping.ts`) required on every query; tests assert no
  unscoped table access from API handlers.
- `action_traces`, `verification_records`, `credit_ledger`, `assistant_edits`,
  `assistant_messages`, `numeric_values`, `calc_operations` are append-only (no UPDATE/DELETE
  grants in app role).
- Financial numeric columns across ALL tables use integer cents / fixed-point convention
  (`*_cents`, or `value_int + scale`); jsonb contract payloads carry ValueRef handles rather
  than embedded floats wherever the value participates in the pipeline.
- Every jsonb contract column validated through Zod at write time; `schema_version` bumps are
  migration events logged in `dev-intent/decisions-log.md`.
