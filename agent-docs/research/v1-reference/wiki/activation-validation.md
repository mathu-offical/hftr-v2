# Activation Validation

## Metadata

- owner: wiki
- lastUpdated: 2026-05-20
- tags: wiki, markdown, knowledge_libraries, verification_layer, documentation_surface
- linkedIndexes: wiki-index.json, ../research/research-index.json, ../architecture/architecture.json
- jsonTerms: knowledge_libraries, verification_layer, documentation_surface, action_trace

This document should stay aligned with ../research/market-and-stock-strategy-validation.md, ../research/market-data-research.md, ../research/runtime-control-profile-derivation.md, ../architecture/event-and-agent-orchestration.md, and ../architecture/data-models.md.

## Implementation-Context Ownership

Primary plan units:

- knowledge and research substrate
- broker management and orchestration runtime
- compile, deterministic dispatch, and verification

Direct implementation anchors:

- records and tables: `selector_snapshots`, `lead_packages`, `decision_trees`, `action_instructions`, and `action_traces`
- server-owned APIs: `GET /api/research/selectors/:selectorId`, `POST /api/orchestration/signals`, `POST /api/compile/instructions`, and `GET /api/traces/:traceId/timeline`
- package roots: `packages/seed-selector-service`, `packages/orchestration-service`, `packages/execution-agent-compile`, `packages/deterministic-dispatch`, and `packages/read-models/traces`

## Role

- define the persisted six-gate admission contract that decides whether a lead may move from research and strategic ranking into tactical decomposition
- keep activation eligibility tied to explicit evidence, entitlement, session, broker, and market-structure truth rather than later broker rejection noise
- preserve one canonical activation record that downstream compile, dispatch, verification, and operator review surfaces can reference without reinterpretation

## Six-Gate Admission Contract

- regime fit
- symbol-universe fit
- session fit
- broker fit
- market-structure fit
- evidence fit

## Persisted Activation Payload

- `StockUniverseValidationProfile`
- gate-evidence refs for each passed, failed, or suppressed dimension
- market-data entitlement class and selected feed posture
- session-legality snapshot and broker-policy version
- initial control-snapshot ref for the weight, range-seed, and granularity posture used at admission time
- freshness windows and promotion or quarantine state for supporting evidence

## Boundary Rules

- activation validation is upstream of tactical expansion, but downstream stages must preserve its refs
- tactical builders may not reactivate rejected leads by improvising around failed gates
- execution-agent compile may block on missing or stale entitlement, session, or control-snapshot context even when tactical structure exists
- deterministic dispatch rechecks legality and policy, but it does not reinterpret research-time gate evidence or invent a new activation posture
- training and [background curation](background-curation-service.md) may refine mutable control profiles, but they may not retroactively alter historical admission truth

## Operator Visibility Requirements

- trace and release-review surfaces should show whether the active path passed or failed each gate
- unavailable strategies should surface session, entitlement, broker-policy, or evidence-freshness failure text rather than vague status chips
- promotion review should explain which activation gates remain unstable before a family moves beyond Tier A

## Related Surfaces And Why They Matter

- [../research/market-and-stock-strategy-validation.md](../research/market-and-stock-strategy-validation.md) is the canonical research contract behind this page, while [../research/market-data-research.md](../research/market-data-research.md) explains the entitlement and feed-truthfulness facts that admission must preserve.
- [Runtime Control Profiles](runtime-control-profiles.md), [Data Structures](data-structures.md), and [../research/runtime-control-profile-derivation.md](../research/runtime-control-profile-derivation.md) matter because activation payloads must carry coherent control-snapshot refs rather than orphaned weights or range hints.
- [Trading Engine](trading-engine.md), [Stock Universe and Market Structure](stock-universe-and-market-structure.md), [Session Legality](session-legality.md), and [Market Data Entitlements](market-data-entitlements.md) matter because they respectively consume the admission result, explain the most common gate families, and enforce the truth that compile and dispatch must fail closed around.
