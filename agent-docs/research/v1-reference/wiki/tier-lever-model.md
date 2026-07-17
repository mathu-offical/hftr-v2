# Tier Lever Model

## Metadata

- owner: wiki
- lastUpdated: 2026-05-29
- tags: wiki, markdown, knowledge_libraries, execution_agent_tier, deterministic_trade_action_layer, tier_lever_model, bounded_range_bands
- linkedIndexes: wiki-index.json, ../research/research-index.json, ../architecture/architecture.json
- jsonTerms: knowledge_libraries, execution_agent_tier, deterministic_trade_action_layer, tier_lever_model, bounded_range_bands

This page should stay aligned with ../research/tier-lever-and-bounded-range-reference.md, ../research/academic-quant-tool-catalog.md, ../research/seeded-strategy-catalog.json, ../research/seeded-testing-baseline-defaults.md, [Trading Engine](trading-engine.md), [Executable State Model](executable-state-model.md), [Runtime Control Profiles](runtime-control-profiles.md), and [Risk Control Matrix](risk-control-matrix.md).

## Implementation-Context Ownership

Primary plan units:

- knowledge and research substrate
- broker management and orchestration runtime
- compile, deterministic dispatch, and verification

Direct implementation anchors:

- records and tables: `weight_envelopes`, `range_seed_profiles`, `granularity_control_profiles`, `decision_trees`, and `action_instructions`
- server-owned APIs: `GET /api/research/control-profiles/:profileId`, `POST /api/compile/instructions`, and `GET /api/traces/:traceId/timeline`
- package roots: `packages/catalogs`, `packages/contracts/research`, `packages/execution-agent-compile`, and `packages/services/verification`

## Role

The tier lever model defines which deterministic levers each model-bearing tier owns and the realistic bounded bands those levers may take. It is the operator-facing companion to the [tier lever and bounded-range reference](../research/tier-lever-and-bounded-range-reference.md), which grounds every band in current trade-execution and quant-finance practice.

The pipeline refines one decision tree. Each tier sets levers inside bands scoped to its authority; everything below deterministic dispatch executes those settled levers model-free.

Implementation applies levers through `executeStrategicTier`, `executeTacticalTier`, and `executeExecutionTier` (`apps/hftr-web/src/lib/pipeline/nodes/tier-executors.ts`) with `enforceScope` fail-closed rejection of out-of-scope keys. Operator re-tune uses `POST /api/decision-trees/:id/tier-refresh` and scheduled `GET /api/cron/retune?scope=tactical|execution`.

## Strategic Tier Owns Portfolio Structure

- per-name risk budget (fixed-fractional risk per trade), portfolio heat, and a portfolio volatility target
- sector concentration and concurrent-name caps that enforce the low-entry, high-diversification product goal structurally
- regime classification thresholds (Hurst persistence, ADX trend strength, realized-volatility regime) that bias momentum, mean-reversion, or risk-off playbooks
- correlation/sympathy gates that make lead-lag and pairs eligibility a hard gate rather than a soft preference

## Tactical Tier Owns Decision-Tree Geometry

- ATR-based stop distance and the position size that follows from risk budget divided by stop distance
- the reward-to-risk target ladder, scale-out fractions, and breakeven-after-first-target behavior
- trailing-stop method (ATR / chandelier), invalidation criteria distinct from the hard stop, time stops, re-entry policy, and pyramiding policy
- the allowed order-class set each branch may compile into

## Execution / Compile Tier Owns Order Shape

- order type and time-in-force, constrained by session legality
- participation rate / execution-algo benchmark (VWAP, TWAP, POV, Implementation Shortfall) and child-slice or iceberg sizing
- limit offset / peg, slippage tolerance, fill timeout, and cancel/replace policy

## Mutable Versus Immutable

- the band a lever sits in is mutable: runtime may reposition inside it and training may recalibrate it with evidence
- the caps that wrap each band — hard loss limits, session legality, price precision, verification schemas, and guardrail contracts — are immutable
- paper-mode positions may exercise the full band but carry realism penalties; live-facing positions start from guarded percentile defaults and may not widen immutable caps

## Related Surfaces And Why They Matter

- [../research/tier-lever-and-bounded-range-reference.md](../research/tier-lever-and-bounded-range-reference.md) is the canonical, source-cited band definition behind this page; [../research/academic-quant-tool-catalog.md](../research/academic-quant-tool-catalog.md) maps each lever to literature-backed tool ids; [../research/seeded-testing-baseline-defaults.md](../research/seeded-testing-baseline-defaults.md) provides the concrete percentile positions that index into those bands.
- [Executable State Model](executable-state-model.md) and [../architecture/trading-engine-implementation-spec.md](../architecture/trading-engine-implementation-spec.md) matter because they show how lever changes surface as watch/wait/order/fallback for operators and implementers.
- [Trading Engine](trading-engine.md) and [Execution-Agent Compile](execution-agent-compile.md) matter because they consume tier-scoped levers during decomposition and compilation, while [Deterministic Dispatch](deterministic-dispatch.md) executes the settled levers without reinterpreting them.
- [Runtime Control Profiles](runtime-control-profiles.md) and [Risk Control Matrix](risk-control-matrix.md) matter because they carry the lever bands through control snapshots and map them onto deterministic control families and verification fields.
