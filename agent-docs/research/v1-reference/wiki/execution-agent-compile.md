# Execution-Agent Compile

## Metadata

- owner: wiki
- lastUpdated: 2026-05-29
- tags: wiki, markdown, documentation_surface, execution_agent_tier, action_trace, traceability, tier_lever_model
- linkedIndexes: wiki-index.json, ../architecture/architecture.json, ../plans/active-plans.json
- jsonTerms: execution_agent_tier, action_trace

This document should stay aligned with ../plans/full-system-implementation-plan.md, ../plans/engine-pipeline-implementation-plan.md, ../architecture/application-service-blueprint.md, ../research/hybrid-functional-service-placement.md, and ../wiki/trading-engine.md.

## Implementation-Context Ownership

Primary plan units:

- broker management and orchestration runtime
- compile, deterministic dispatch, and verification

Direct implementation anchors:

- records and tables: `decision_trees`, `compile_requests`, `compile_results`, `action_instructions`, and `compile_block_events`
- server-owned APIs: `POST /api/compile/instructions`, `POST /api/orchestration/signals`, and `GET /api/entities/:entityType/:entityId`
- package roots: `packages/execution-agent-compile`, `packages/contracts/execution`, `packages/orchestration-service`, and `packages/read-models/traces`

## Role

Execution-agent compile is the last provider-backed stage in HFTR's runtime. It translates approved tactical branches into ActionInstruction payloads that deterministic dispatch can execute without performing any further interpretation. Its authority is the execution-tier slice of the [Tier Lever Model](tier-lever-model.md): order type, time-in-force, participation rate, limit offset / peg, max slippage, fill timeout, and cancel/replace policy, each tuned only inside seeded session-legal, precision-safe bands.

## Inputs It Owns

- DecisionTree branch graphs with invalidations and recovery ladders
- broker and session overlay snapshots
- allowed order classes, precision rules, and control snapshots
- compile request ids plus `client_order_id` lineage seeds

## Outputs It Must Produce

- ActionInstruction payloads with deterministic field mappings
- compile block reasons when the tactical artifact is incomplete or ineligible
- control snapshots and compile lineage that explain what the provider saw
- no free-text ambiguity that would require downstream interpretation

## Compile Block Reasons

- incomplete tactical branch
- unsupported order class for the active session or broker envelope
- missing recovery ladder or invalidation path
- price precision mismatch
- policy or guardrail contract mismatch
- missing stock, sector, or catalyst context required by the strategy family

## Provider Boundary Rules

- provider choice may vary across Groq, OpenRouter-routed metadata, or a feature-flagged local execution-agent profile
- downstream contract shape must remain stable across providers
- compile may emit structured non-dispatch outcomes, but it must not submit orders or normalize final verification records
- compile logs should capture provider profile, latency bucket, and block reason taxonomy without leaking prompts into broker-authoritative layers

## State and Queue Touchpoints

- reads: `decision_trees`, `control_snapshots`, session overlays, broker overlays
- writes: `compiled_instructions`, `compile_block_events`, compile lineage metadata
- queue boundary: consumes `instruction_compile_queue` and emits only compile-stage artifacts

## Operator Visibility

- operator surfaces should show compile status, provider profile id, instruction hash, and structured block reasons
- blocked compile outcomes should remain visible in trace timelines even when no broker submission occurs
- compile-stage explanations must map back to strategy family, branch id, and policy snapshot ids

## Test Surfaces

- compile schema tests
- provider contract stability tests
- compile block reason taxonomy tests
- lineage preservation tests across compile retries or provider fallback

## Must-Not Rules

- must not submit broker actions
- must not mutate immutable ActionTrace records
- must not soften hard legality or guardrail contracts into preferences

## Related Surfaces And Why They Matter

- [../plans/full-system-implementation-plan.md](../plans/full-system-implementation-plan.md), [../plans/engine-pipeline-implementation-plan.md](../plans/engine-pipeline-implementation-plan.md), [../architecture/application-service-blueprint.md](../architecture/application-service-blueprint.md), and [Trading Engine](trading-engine.md) define where compile lives in the tier stack, which service owns it, and when compile behavior becomes implementation-critical.
- [../research/hybrid-functional-service-placement.md](../research/hybrid-functional-service-placement.md) and [../research/provider-evaluation.md](../research/provider-evaluation.md) explain provider placement, latency posture, and fallback expectations for the final model-bearing stage.
- [../research/execution-microstructure-and-order-quality.md](../research/execution-microstructure-and-order-quality.md) matters because compile output has to preserve the execution assumptions that deterministic dispatch and later trace review will verify.
- [Tier Lever Model](tier-lever-model.md) and [../research/tier-lever-and-bounded-range-reference.md](../research/tier-lever-and-bounded-range-reference.md) matter because they enumerate the exact order-shape levers and bounded bands compile may set, and the immutable caps it must not exceed.
- [Executable State Model](executable-state-model.md) and [../research/academic-quant-tool-catalog.md](../research/academic-quant-tool-catalog.md) matter because compile transitions (`compile_ready` / `compile_blocked`) set executable status to `order` or `blocked` before deterministic dispatch runs.
