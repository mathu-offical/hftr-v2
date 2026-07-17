# Guardrails

## Metadata

- owner: wiki
- lastUpdated: 2026-05-19
- tags: wiki, markdown, verification_layer, deterministic_trade_action_layer, traceability
- linkedIndexes: wiki-index.json, ../architecture/architecture.json, ../research/research-index.json
- jsonTerms: verification_layer, deterministic_trade_action_layer, action_trace

Guardrails are deterministic checks and recovery packages that prevent unsafe behavior, preserve legality, and keep failure handling queryable instead of implicit. They are enforced at the [Deterministic Dispatch](deterministic-dispatch.md) boundary and paired with explicit recovery packages tracked in the [Risk Control Matrix](risk-control-matrix.md).

## Implementation-Context Ownership

Primary plan units:

- compile, deterministic dispatch, and verification
- live hardening and multi-broker federation
- training, replay, and governance feedback

Direct implementation anchors:

- records and tables: `guardrail_evaluations`, `verification_records`, `live_gate_evidence`, `recovery_branch_views`, and `policy_reason_views`
- server-owned APIs: `POST /api/compile/instructions`, `POST /api/dispatch/tasks`, `POST /api/live-gates/review`, and `GET /api/entities/guardrail-package/:guardrailId`
- package roots: `packages/contracts/execution`, `packages/services/guardrails`, `packages/services/verification`, `packages/services/live-gates`, and `packages/read-models/operator`

## Role

Guardrails materialize the hard safety, legality, and recovery envelope for every trade path so upstream reasoning can suggest actions without gaining permission to bypass deterministic controls.

## Categories

- pre-trade legality and policy gates
- loss, exposure, and inventory limits
- execution sanity and venue-quality checks
- retry, cooldown, and defer rules
- recovery, escalation, and operator-visible failure workflows

## Recovery Package Requirement

- guardrails should be paired with explicit recovery packages such as cancel-replace-and-reprice, liquidity-pause-and-defer, macro-blackout-and-delayed-reentry, event-conflict-blackout, and terminal-failure escalation
- recovery packages should be documented as seeded [Knowledge Library](knowledge-libraries.md) assets with deterministic failure codes, phase order, and policy lineage rather than ad hoc runtime behavior

## Canonical Package Materialization

- guardrail-recovery-package-catalog.json is the first-class catalog for deterministic failure codes, package summaries, recovery ladders, escalation posture, and strategy or sector bindings
- compliance-policy-package-catalog.json remains the paired policy catalog — see [Compliance Ops](compliance-ops.md) — when a guardrail outcome depends on approval scope, launch boundary, retention precedence, or fail-closed live-mode behavior
- strategy families, sector packages, session constraints, and broker policy envelopes should reference these catalogs instead of hiding recovery semantics inside isolated prose blocks

## Query Modes

- overview: current block, allow, or degrade posture for a family, sector, or session
- analyst: affected controls, recovery ladders, failure codes, and strategy or sector bindings
- lineage: policy version, trigger evidence, audit implications, and review cadence

## Layered Application

- strategic and tactical layers must include guardrail and recovery suggestions in outputs
- [execution-agent](execution-agent-compile.md) layer must preserve those constraints in compiled instructions
- [deterministic action layer](deterministic-dispatch.md) enforces hard controls before any adapter call
- research and promotion layers may refresh guardrail evidence or package posture, but they may not bypass deterministic enforcement or dispatch authority

## Requirement

All guardrail outcomes must be machine-verifiable, traceable, and queryable as independent modules.

## Deterministic Requirement

- guardrail enforcement must not rely on model interpretation — see [Deterministic Dispatch](deterministic-dispatch.md)
- blocked actions and recovery transitions must emit stable [ActionTrace](data-structures.md) failure codes
- operator and programmatic consumers should be able to query the same guardrail package at overview, analyst, or lineage depth without reconstructing it from scattered docs

## Related Surfaces And Why They Matter

- [../plans/full-system-implementation-plan.md](../plans/full-system-implementation-plan.md), [../plans/engine-pipeline-implementation-plan.md](../plans/engine-pipeline-implementation-plan.md), and [../plans/application-operations-implementation-plan.md](../plans/application-operations-implementation-plan.md) define where guardrail enforcement shows up in delivery order, runtime boundaries, and operator-facing flows.
- [../research/compliance-and-policy-operating-baseline.md](../research/compliance-and-policy-operating-baseline.md), [../research/session-constraint-catalog.json](../research/session-constraint-catalog.json), and [../research/strategy-risk-control-matrix.md](../research/strategy-risk-control-matrix.md) provide the policy, session, and control-family evidence that guardrail packages must preserve.
- [../architecture/security-and-guardrails.md](../architecture/security-and-guardrails.md) is the canonical structural source for this page, so the wiki narrative should stay aligned with the architecture boundary that keeps enforcement deterministic.
