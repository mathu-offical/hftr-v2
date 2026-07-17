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

- **companies** — clerk_user_id, name, philosophy_prompt, goals jsonb, reinvestment_policy jsonb,
  scoping_policies jsonb, mode `paper|live`, seed_credits_cents (paper), broker_connection_id
  nullable, auto_fund_policy jsonb (approval thresholds), archived_at.
- **modules** — company_id, type `research|library|live_api|trend|trading|policy|generator|
  simulator|analyzer|fund_router|math`, subtype (trading: `crypto|prediction|hft|day|
  long_term|custom`), name, config jsonb (schema per type), status `active|paused|error|draft`,
  allocation_cents, canvas_position jsonb {x,y}, philosophy_override text.
  Notes: `math` is auto-created per company and non-deletable (D-008); `policy` nodes occupy the
  rightmost canvas column and bind policy envelopes to the trading modules linked into them
  (spec: "trading modules → trading policies").
- **module_links** — company_id, from_module_id, to_module_id, link_kind
  `data_feed|directive|verification|fund_route`, config jsonb. (These are the canvas edges.)
- **fund_transfers** — company_id, from (module|company_pool|reserve), to, amount_cents,
  status `requested|approved|auto_approved|rejected|settled`, requested_by
  `user|module|policy`, approved_at, trace ref.

## Broker connections

- **broker_connections** — clerk_user_id, venue `alpaca|kalshi|polymarket|coinbase`,
  mode `paper|live`, encrypted_credentials bytea, key_last_four, status
  `connected|error|revoked`, capabilities jsonb (from adapter handshake), last_verified_at.
- **broker_balances_snapshot** — connection_id, cash, buying_power, positions jsonb, as_of.

## Research & knowledge

- **research_topics** — module_id, parent_topic_id nullable (tree), title, status, priority,
  provenance (envelope ref).
- **concepts** — company_id, origin_module_id, title, slug, body_md, summary,
  embedding vector nullable (pgvector, phase-gated), source_urls jsonb, confidence.
- **concept_tags** — concept_id, tag (lower_snake_case); **tags** registry (tag, kind, color_hint).
- **concept_links** — from_concept_id, to_concept_id, relation
  `supports|contradicts|causes|correlates|mentions|derived_from`, weight 0..1, provenance.
  (concepts + concept_links + tags = the galaxy graph AND the Obsidian export source.)
- **libraries** — company_id, name, topic_scope jsonb, master_library flag;
  **library_concepts** join (library_id, concept_id, curation_status).
- **evidence_packages** — v1 contract: class, symbols/sectors, digest, findings jsonb, expiry,
  legal_use_class `ALLOWED|RESTRICTED|REVIEW_REQUIRED`.

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
  realized_pnl_cents. Written ONLY by the dispatch layer at fill time; sells above held
  quantity are blocked (`broker_policy_block` — no shorting in paper v1). Implemented
  2026-07-16 (D-016).
- **trend_candidates** — module-scoped candidates with direction, strength band, drift
  ValueRef, and source_class `deterministic_scan|model_nominated` (the deterministic
  `trend.scan` handler writes the former; LLM tiers will write the latter). D-016.
- **catalog_entries** — generic seeded-catalog store: (catalog, entry_key) unique,
  catalog_version, title, tier, payload jsonb. Seeded from
  `packages/db/src/seed/catalogs/*.json` via `seed-catalogs.ts` (97 entries at
  `v1_snapshot_2026_07_16`). D-016.
- **watchlist_items** — (module_id, symbol) unique; bias `long|short|neutral`, note,
  source_class `operator|trend_promotion`, status `watching|triggered|archived`. Owned by
  trading/trend modules only (API 422s otherwise); surfaces in the bottom panel's
  Watch lists tab and the module inspector. Migration `0003_bitter_piledriver`. D-017.
- **concepts** — research-module curated knowledge rows (title, body, tags jsonb,
  source_class `deterministic_placeholder|model_generated|operator`). Written by
  `research.curate` (catalog-backed placeholder until LLM tiers wire). Migration
  `0004_petite_hellfire_club`. D-021.
- **lead_packages** — six-gate admission record (activation-validation.md): trend →
  gates jsonb evidence, status `pending|admitted|rejected|decomposed|expired`,
  strategy_family, optional target trading module. Written by `trend.promote`. D-021.
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
- **control_snapshots** — company/module scope, WeightEnvelope + band positions, version, hash.

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
  company_id, module_id, cost_estimate jsonb.
- **job_schedules** — cron-like recurring definitions per module cadence.
- **llm_calls** — provider, model, tier, module_id, tokens in/out, cost_cents, latency_ms,
  schema_valid bool, rate_limit_remaining, job_id.
- **llm_budgets** — scope (user/company/module), provider, window, max_calls, max_cost_cents,
  consumed counters.

## Assistant

- **assistant_sessions** / **assistant_messages** — company-scoped chat history;
  **assistant_edits** — audit of every mutation the assistant performed: tool name, JSON patch,
  affected entity, user confirmation state, reversal ref.

## Seed catalogs (read-mostly, versioned)

- **strategy_families**, **guardrail_packages**, **recovery_ladders**, **session_constraints**,
  **broker_policy_envelopes**, **sector_seeds**, **event_archetypes**, **macro_triggers** —
  loaded from the v1 JSON catalogs via seed scripts; each row keeps `catalog_version` and
  `literature_refs`.

## Integrity rules

- Ownership scoping helper (`packages/db/scoping.ts`) required on every query; tests assert no
  unscoped table access from API handlers.
- `action_traces`, `verification_records`, `credit_ledger`, `assistant_edits`,
  `numeric_values`, `calc_operations` are append-only (no UPDATE/DELETE grants in app role).
- Financial numeric columns across ALL tables use integer cents / fixed-point convention
  (`*_cents`, or `value_int + scale`); jsonb contract payloads carry ValueRef handles rather
  than embedded floats wherever the value participates in the pipeline.
- Every jsonb contract column validated through Zod at write time; `schema_version` bumps are
  migration events logged in `dev-intent/decisions-log.md`.
