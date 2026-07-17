# Deterministic Dispatch

## Metadata

- owner: wiki
- lastUpdated: 2026-05-19
- tags: wiki, markdown, documentation_surface, deterministic_trade_action_layer, verification_layer, action_trace
- linkedIndexes: wiki-index.json, ../architecture/architecture.json, ../plans/active-plans.json
- jsonTerms: deterministic_trade_action_layer, verification_layer, action_trace

This document should stay aligned with ../plans/full-system-implementation-plan.md, ../plans/engine-pipeline-implementation-plan.md, ../architecture/application-service-blueprint.md, ../architecture/security-and-guardrails.md, and ../research/execution-microstructure-and-order-quality.md.

## Implementation-Context Ownership

Primary plan units:

- compile, deterministic dispatch, and verification
- live hardening and multi-broker federation

Direct implementation anchors:

- records and tables: `deterministic_action_tasks`, `action_traces`, `verification_results`, `dispatch_reconciliation_events`, and `policy_reason_views`
- server-owned APIs: `POST /api/dispatch/tasks`, `POST /api/dispatch/reconcile`, `GET /api/traces/:traceId/timeline`, and `GET /api/entities/:entityType/:entityId`
- package roots: `packages/deterministic-dispatch`, `packages/contracts/execution`, `packages/read-models/traces`, and `packages/read-models/operator`

## Role

Deterministic dispatch is HFTR's final broker-authoritative runtime boundary. It receives schema-valid ActionInstruction payloads from the [Execution-Agent Compile](execution-agent-compile.md) service, applies hard legality and recovery rules from the [Guardrails](guardrails.md) package catalog, talks to the broker adapter, and emits immutable [ActionTrace](data-structures.md) verification outcomes.

## Dispatch Phases

1. request intake and deterministic field validation
2. session, broker-policy, and guardrail legality checks
3. watcher evaluation for price freshness, spread, and venue sanity
4. broker submission or fail-closed block outcome
5. verification normalization into immutable ActionTrace and reconciliation events

## Inputs It Owns

- ActionInstruction payloads from the [compile service](execution-agent-compile.md)
- session overlays and [broker policy envelopes](broker-policy-envelopes.md)
- [guardrail and recovery packages](guardrails.md)
- price precision rules, order-class legality, and `client_order_id` lineage

## Output Artifacts

- broker submission attempts
- [ActionTrace](data-structures.md) records for blocked, submitted, partially filled, replaced, canceled, timeout, and recovered outcomes
- verification results and reconciliation events — see [Execution Quality](execution-quality.md) for measurement expectations
- deterministic failure codes with explicit recovery branch labels

## Session and Broker Legality Rules

- extended-hours equities orders must respect limit-only and day or GTC restrictions
- bracket groups must fail closed when the active session or broker envelope disallows them
- price precision must validate before broker submission, not after rejection
- simulator-gap tags must remain attached in paper mode so replay and promotion logic can discount synthetic realism

## Recovery and Reconciliation

- timeout does not imply blind resend; timeout must branch into verification and reconciliation first
- recovery packages — documented in [Guardrails](guardrails.md) — should be explicit, bounded, and linkable from [ActionTrace](data-structures.md) records
- cancel-replace, defer, blackout, or escalation outcomes must be deterministic and replayable

## Trace And Verification Rules

- both blocked and successful outcomes must emit immutable trace records
- verification normalization is part of the dispatch boundary, not a best-effort add-on
- read-models may summarize traces, but they must never replace the immutable trace of record

## Test Surfaces

- no-model dispatch tests
- fail-closed legality tests
- ActionTrace normalization tests
- broker lifecycle reconciliation tests
- paper-simulator-gap tagging tests

## Must-Not Rules

- must not invoke provider inference
- must not depend on browser-authored state for legality
- must not downgrade [hard guardrails](guardrails.md) into operator preferences
- must not bypass [compliance](compliance-ops.md) or [risk control](risk-control-matrix.md) contracts at any recovery path

## Related Surfaces And Why They Matter

- [../plans/full-system-implementation-plan.md](../plans/full-system-implementation-plan.md), [../plans/engine-pipeline-implementation-plan.md](../plans/engine-pipeline-implementation-plan.md), and [../architecture/application-service-blueprint.md](../architecture/application-service-blueprint.md) define the downstream ownership and delivery order of the final model-free dispatch boundary.
- [../research/execution-microstructure-and-order-quality.md](../research/execution-microstructure-and-order-quality.md), [../research/broker-policy-envelope-catalog.json](../research/broker-policy-envelope-catalog.json), and [../research/session-constraint-catalog.json](../research/session-constraint-catalog.json) supply the market, broker-policy, and session overlays that dispatch must enforce rather than reinterpret.
- [../research/compliance-and-policy-operating-baseline.md](../research/compliance-and-policy-operating-baseline.md) explains why blocked actions, recoveries, and legality outcomes all need durable evidence instead of best-effort logging.
