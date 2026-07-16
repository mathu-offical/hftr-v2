# v1 Carryover — Canonical Inheritance Register

Everything hftr v2 inherits from v1, with source paths. v1 files are READ-ONLY references.
Rule: carry **contracts and catalogs**, not tables and components. When v2 renames a concept,
the mapping is recorded here.

## 1. Non-negotiable invariants (verbatim from v1)

| Invariant | v1 source |
|---|---|
| Last model-bearing stage = execution-agent compile; dispatch + verification below are deterministic, model-free, provider-free | `hftr/agent-docs/wiki/deterministic-dispatch.md`, `wiki/execution-agent-compile.md` |
| Guardrails + verification schemas immutable; only weights and band positions inside envelopes mutable | `hftr/DevSpecs/dev-notebook.md`, `agent-docs/wiki/guardrails.md` |
| Paper and live share ONE engine; mode changes adapters/limits/compliance paths only; live is fail-closed until gates pass | `agent-docs/architecture/system-overview.md` |
| Compliance from day one: entitlement truthfulness, session legality, retention (90d hot + 1y archive), no guaranteed-returns language | `agent-docs/research/compliance-and-policy-operating-baseline.md` |
| Scoped lever authority is fail-closed (`out_of_scope` / `out_of_range` / `unknown_lever`) | pipeline `levers.ts` + `wiki/tier-lever-model.md` |

## 2. Pipeline spine (v1 → v2 mapping)

v1 run-node spine: `root → research_topic → trend → lead → tree → compile → dispatch → loop_refine`
with executable states `watch | wait | order | blocked | fallback` and staleness→fallback
preferring `lastVerifiedPatternRef`.

v2 keeps the spine and re-homes it in the module graph:

| v1 stage | v2 owner module |
|---|---|
| research_topic seeding/decomposition | Research modules (now Claude-backed, curious/opportunistic) |
| trend emission | Trend modules |
| lead nomination | Trend modules → Trading modules |
| tree expansion (tactical) | Trading module (Mistral) |
| compile (execution-agent) | Trading module (Groq) |
| dispatch/verify | Deterministic core inside each Trading module |
| loop_refine / retune | Analyzer utility + training feedback |

Six-gate activation validation carried intact: regime fit, symbol-universe fit, session fit,
broker fit, market-structure fit, evidence fit (`wiki/activation-validation.md`).

## 3. Core TypeScript contracts (port near-verbatim into `packages/contracts`)

From `hftr/DevSpecs/1-general.audit.md` + `hftr/packages/contracts/src/`:

- `HandoffEnvelope` — contractVersion, authorityClass, mutationClass, queueClass, priorityBand,
  timeoutClass, idempotencyKey, replayHash, controlSnapshotRef, causation refs, expiry
- `EvidencePackage`, `ActivationValidationResult` + `GateResult`, `LeadPackage`
- `DecisionTree` / `BranchNode` / `ConditionNode` / `LeverState` / `TreeRefinement`
- `ActionInstruction` (precision-safe order spec, broker field maps, `client_order_id` lineage)
- `DeterministicActionTask`, `ActionTrace` (immutable), verification result shape
  (actionType, expectedSchemaVersion, inputDigest, passFail, failureCode,
  sessionLegalitySnapshot, policyEnvelopeVersion, recoveryProtocolId)
- `RegimeSnapshot` (trendUp/Down, meanReversion, volExpansion, liquidityStress, eventShock, riskOff)
- `MarketAwarenessSnapshot`, `ExpectedValueBreakdown`, `MicrostructureProfile`, `EventImpactGraph`
- Prediction-market set: `CanonicalQuestion`, `VenueQuestionMapping`, `ResolutionRuleSnapshot`,
  `PredictionMarketAwarenessSnapshot`
- Control snapshot profiles: `WeightEnvelope`, `RangeSeedProfile`, `GranularityControlProfile`,
  `RegimeControlProfile`, `EventSensitivityProfile`, `MicrostructureRiskProfile`,
  `PaperRealityOverlayProfile`
- Authority classes: `DETERMINISTIC | PROVIDER_ANALYZED | CURATED_BACKGROUND | TRAINING_DERIVED |
  OPERATOR_INPUT`; mutation classes: `IMMUTABLE | BOUNDED_MUTABLE | READ_ONLY_DERIVED`
- Queue classes: `RESEARCH | STRATEGIC | TACTICAL | COMPILE | DISPATCH | VERIFY | TRAINING`;
  priority bands `LOW | NORMAL | HIGH | CRITICAL`; timeout classes `SHORT | MEDIUM | LONG`

## 4. Bounded-range band catalog (seed values, port intact)

From `hftr/agent-docs/research/tier-lever-and-bounded-range-reference.md` and
`apps/hftr-web/src/lib/pipeline/nodes/bands.ts` (min / typical / max):

| Band | Values |
|---|---|
| risk_per_trade_pct | 0.25 / 0.75 / 2.0 % equity |
| portfolio_heat_pct | 1.5 / 4.0 / 8.0 % |
| portfolio_vol_target | 8 / 14 / 20 % ann. |
| sector_concentration_pct | 15 / 30 / 45 % |
| max_concurrent_names | 5 / 15 / 40 |
| vol_shock_regime | 1.25 / 1.75 / 3.0 × median RV |
| correlation_health | 0.45 / 0.60 / 0.75 |
| pairs_spread_zscore | 1.5 / 2.0 / 3.0 σ |
| momentum_lookback | 5 / 20 / 120 bars |
| atr_stop_multiplier | 1.5 / 2.25 / 3.0 × ATR |
| RR ladder | TP1 1R 50%, TP2 2R 25%, TP3 3R/trail |
| trail_multiplier | 1.5 / 2.5 / 4.0 × ATR |
| participation_rate | 3 / 8 / 20 % ADV |
| max_slippage_bps | liquid 5/12/25; thin 15/30/60 |
| fill_timeout_ms | 2000 / 8000 / 30000 |
| cancel_replace attempts | 1 / 3 / 5 |
| adverse_selection_bps | 2 / 8 / 25 |
| is_urgency_scalar | 0.2 / 1.0 / 3.0 |
| recovery_backoff_ms | 500 / 2500 / 15000 |
| iceberg_peak_ratio | 5 / 10 / 20 % visible |
| Regime thresholds | Hurst 0.55/0.45; ADX 25/20 |

Tier cadences: strategic pre-market / ~3h / trigger; tactical ≤30m; execution ≤5m.

## 5. Tool & lever families (port to v2 registries)

From `research/seeded-strategy-catalog.json#/deterministicToolCatalog` +
`academic-quant-tool-catalog.md`:
- 9 pipeline tools (seed_research_topics … retune_tree)
- 13 strategic levers, 12 tactical levers, 13 execution levers
- Executable-state transition tools, research/training loop tools, process-binding tools
- Literature registry keys (Almgren–Chriss, Perold IS, momentum/regime/pairs/microstructure
  canon, Kelly, Moreira–Muir, etc.) — carry the three-surface academic sync discipline:
  markdown catalog + JSON index + numeric band reference updated together.

## 6. Strategy, guardrail, recovery catalogs

From `research/seeded-strategy-catalog.json` + `guardrail-recovery-package-catalog.json`:
- **Strategy tiers:** Tier A (MVP-activate): opening_range_breakout, gap_and_go,
  pullback_continuation, vwap_reversion, earnings_guidance_drift. Tier B (post-stability):
  volatility_compression_breakout, liquidity_sweep_reversal, lead_lag_propagation,
  extended_overnight_session_response. Tier C (deferred): market_making, pairs_stat_arb.
  Plus 6 compound patterns and prediction-market families (probability gap, cross-venue arb,
  event repricing, resolution ambiguity, implied-probability, longshot calibration).
- **Recovery ladders** rec-001…006 (phased slippage resolution, breakout failure, trend-day
  abort, event catalyst, sympathy leader failure, IS trajectory recovery).
- **Guardrail packages** grd-001…008 (event blackout, macro blackout, liquidity pause,
  cancel/replace reprice, correlation-break abort, inventory skew retreat, session legality
  defer, account fail-closed) + reason families (`session_legality_block`,
  `broker_policy_block`, `market_structure_block`, `capital_limit_block`,
  `verification_schema_block`, `recovery_exhausted_escalation`).

## 7. Seed data catalogs to migrate (JSON, mostly as-is)

`hftr/agent-docs/research/`: `broker-policy-envelope-catalog.json`,
`session-constraint-catalog.json`, `compliance-policy-package-catalog.json`,
`sector-behavior-seed-catalog.json`, `company-event-archetype-catalog.json`,
`macro-geopolitical-trigger-catalog.json`, `trend-lead-pattern-library.json`.
Throttle presets carry too (e.g. `paper_balanced_general_v1`: trade 12/min, market-data 120/min,
24 streaming symbols, backoff 500→8000ms).

## 8. UI concepts carried (reinterpreted for v2)

- Bloomberg-style terminal density; standardized cards for trends/leads/strategies/actions;
  text-first status (blocked/watch/overnight always readable, color reinforces only).
- v1 8-room office mapping → v2 node identities on the canvas (Front Office → company node,
  Signals Wing → trend modules, Library Vault → libraries, Decision Floor → trading module
  tactical view, Instruction Lane → compile, Execution Cage → deterministic dispatch,
  Verification Annex → right panel ledger, Overnight Ops → simulator).
- Trace inspector, entity detail modals, live/paper toggle prominence, agent chat primed on
  current context.
- Hybrid aesthetic decision: playful worker/activity animation lives INSIDE clean graph nodes.

## 9. What v2 explicitly does NOT carry

- NextAuth credentials auth (→ Clerk), raw `@vercel/postgres` + hand-typed DB (→ Drizzle),
  hand-rolled SVG office canvas (→ React Flow), stale `packages/db` types, phantom
  `packages/services`/`read-models` workspace entries, `/canvas` empty page pattern,
  keyword-only agent chat (→ real Mistral assistant), Supabase wording anywhere.
- v1's synthetic-only regime snapshots: v2 computes regimes from real market data (Alpaca bars)
  with the same `RegimeSnapshot` contract.
