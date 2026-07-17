# Adaptive Response Policy Lifecycle Design

## Status

Approved direction: 2026-07-17

This design defines how hftr-v2 turns verified outcomes from one execution cycle into a
bounded, versioned response policy for the next cycle. It also defines the tests required to
prove the entire lifecycle and its audit trail.

## Problem

The current runtime has a one-way paper pipeline:

1. research and market inputs produce trends;
2. promotion snapshots company philosophy and a static policy envelope;
3. tactical expansion and compile produce an instruction;
4. deterministic gates dispatch it;
5. traces and verification records describe the result.

The seeded trading-policy node is currently topology plus a static `policyEnvelopeRef`. Verified
outcomes do not generate, version, validate, activate, or feed a response policy into a later
cycle. Tests therefore cannot honestly claim adaptive policy refinement yet.

## Goals

- Use actual broker market data as authoritative input while keeping execution paper-only.
- Generate a response-policy proposal from descriptorized market evidence and verified outcomes.
- Activate bounded changes automatically in paper mode after deterministic validation.
- Make the active response policy an explicit input to the next cycle.
- Preserve immutable guardrails, verification schemas, and policy envelope bounds.
- Track every causal edge from market data through outcome, proposal, validation, activation,
  and next-cycle behavior.
- Prove recovery, strategy development, and refinement without claiming profitability.

## Non-goals

- No live orders.
- No model call below compile inside an execution cycle.
- No model-generated financial numbers, authoritative times, durations, schedules, or thresholds.
- No runtime mutation of guardrail packages, verification schemas, or catalog envelopes.
- No self-modifying code or unconstrained policy text becoming executable behavior.
- No claim that a successful paper or Alpaca-paper cohort predicts live returns.

## Canonical terminology

- **Policy envelope:** immutable catalog-backed bounds and allowed controls, such as
  `paper_balanced_general_v1`.
- **Response policy:** an immutable, versioned selection of allowed catalog references, bounded
  lever positions, weights, and strategy posture for a company/trading module.
- **Current-cycle recovery:** deterministic advancement through a catalog recovery ladder after a
  timeout, reject, slippage breach, partial fill, or verification failure.
- **Next-cycle refinement:** model-assisted proposal generated after Cycle N verification and
  applied only before Cycle N+1 promotion.
- **Outcome descriptor:** non-numeric, deterministic classification derived from authoritative
  ValueRefs, traces, and verification records.
- **Activation:** deterministic acceptance of a response-policy proposal inside the immutable
  envelope. Paper mode activates automatically; live mode remains gated and requires the existing
  live approval/arming path.

## Safety boundary

The execution-cycle model boundary remains:

```text
strategic/tactical models → compile model
══════════ model-free below compile ══════════
gates → dispatch → reconciliation → verification → deterministic recovery
```

The feedback boundary starts a new cycle:

```text
Cycle N verified evidence
  → deterministic outcome descriptor
  → strategic response-policy proposal
  → schema + leak lint + envelope validation
  → paper activation
  → Cycle N+1 control snapshot
  → tactical models → compile model
```

The response-policy model is therefore upstream of the next compile, not downstream of the
current compile. It cannot alter an instruction already compiled or dispatched.

## Lifecycle

### 1. Capture authoritative inputs

An Alpaca read-only/paper market-data adapter records quote/bar observations as ValueRefs with
honest broker provenance and entitlement metadata. The policy model never receives raw values.

Required evidence:

- broker connection and feed class;
- market-data observation/value references;
- source, freshness, and entitlement labels;
- company and module scope;
- cycle/run identifier.

### 2. Run Cycle N

The existing research → trend → promote → tactical → compile → dispatch path runs in paper mode.
Promotion snapshots:

- philosophy profile and lever state;
- immutable policy envelope version;
- active response-policy version;
- source market-data references;
- strategy family and bounded positions.

### 3. Verify and recover

Dispatch, reconciliation, and verification remain deterministic and model-free. Same-cycle
recovery may only advance within a catalog recovery ladder. Every phase transition records its
trigger, prior phase, next phase, trace/task references, and deterministic reason.

### 4. Summarize outcomes

A deterministic summarizer reads ValueRefs, action traces, reconciliation events, verification
records, ledger/position effects, and recovery events. It emits only allowlisted descriptors such
as:

- `fill_quality`: `within_bound | degraded | failed`;
- `execution_state`: `filled | blocked | rejected | recovered`;
- `evidence_state`: `fresh | stale | conflicting`;
- `strategy_observation`: `confirmed | invalidated | inconclusive`;
- `recovery_state`: catalog recovery phase/reference;
- `data_regime`: catalog regime identifier;
- `policy_mismatch`: allowlisted mismatch reason.

The descriptor artifact includes references to authoritative data but no copied raw numbers or
authoritative timestamps.

### 5. Propose a response policy

A strategic `policy.propose` queue job receives:

- the prior response-policy version;
- the immutable envelope and allowed catalog IDs;
- company philosophy axes;
- descriptor artifacts from one or more completed cycles;
- research/concept references;
- explicit objectives and safety constraints.

Its strict output may contain only:

- strategy/catalog IDs from allowlists;
- min/typical/max bounded positions;
- allowed weights inside declared envelopes;
- recovery-ladder references;
- descriptor/evidence references;
- qualitative rationale and confidence class;
- whether more evidence or research is required.

The output may not contain raw financial values, dates, times, durations, free-form executable
conditions, broker commands, or changes to immutable packages.

### 6. Validate and activate

The server revalidates the strict schema, runs number/time leak lint, verifies catalog references,
enforces scope and bounded ranges, checks evidence ownership/freshness, and records every
validation result.

- Invalid proposals are recorded as rejected and never become active.
- Valid proposals are inserted as immutable versions with a parent version and causation refs.
- In paper mode, a valid proposal is auto-activated through an append-only activation event and a
  mutable active-version pointer on the policy module/company.
- In live mode, automatic activation is forbidden. Existing live-gate and operator approval rules
  apply.

### 7. Prove next-cycle effect

Cycle N+1 promotion must load the active response-policy version and copy its ID, parent ID,
envelope, bounded positions, and evidence refs into the control snapshot. Tests compare Cycle N
and Cycle N+1 behavior only on deterministic intended effects, for example:

- a bounded position changed from `typical` to `min`;
- a recovery posture advanced to an allowed catalog phase;
- the strategy family switched to another allowlisted family;
- the pipeline requested more research rather than dispatching.

The test must also prove unchanged immutable envelope/guardrail/schema IDs.

## Persistence and audit model

### `policy_observation_summaries` (append-only)

- `id`, `company_id`, `module_id`, `cycle_id`;
- descriptor schema version and descriptors;
- `value_ref_ids`, `trace_ids`, `verification_record_ids`, `reconciliation_event_ids`;
- source feed class/entitlement reference;
- deterministic summarizer version;
- creation time from the injectable clock.

### `response_policy_versions` (append-only)

- `id`, `company_id`, `policy_module_id`, `parent_version_id`;
- immutable envelope/catalog version refs;
- bounded strategy/lever/recovery selections;
- proposal source (`model | deterministic_fallback`);
- model call ID and strict schema version when model-generated;
- observation/evidence refs;
- validation result and rejection reasons;
- qualitative rationale;
- content hash and creation time.

### `response_policy_activation_events` (append-only)

- `id`, `company_id`, `policy_module_id`, `policy_version_id`;
- prior active version;
- mode (`paper | live`);
- activation result and reason;
- live-gate/approval refs when mode is live;
- creation time.

### Active pointer

The policy module or company stores `active_response_policy_version_id`. Updating this pointer does
not mutate a policy version. The activation event is the audit source of truth.

### Cross-artifact IDs

Each lifecycle cycle has a stable `cycle_id`. Queue jobs, leads, trees, compile events, tasks,
traces, verifications, observation summaries, policy versions, and activation events carry the
company/module scope and either the cycle ID or explicit causation references.

## Error handling

- Missing or cross-company evidence: reject proposal fail-closed.
- Stale broker data: mark descriptor stale and block policy activation when freshness is required.
- Model unavailable/schema-invalid/leak-lint failure: record rejected attempt; retain current
  policy; optionally use a separately identified deterministic fallback.
- Unknown catalog or out-of-range position: reject proposal; never clamp silently.
- No meaningful evidence: output `requires_more_evidence`; enqueue bounded research or wait.
- Current-cycle execution failure: deterministic recovery only; no model retries below compile.
- Activation race: compare expected prior version and use a transactional pointer update; losing
  proposal remains recorded but inactive.

## Test strategy

### Contract tests

- Strict schemas accept allowlisted catalog IDs, bounded positions, evidence refs, and rationale.
- Schemas reject unknown controls, raw numeric strings, dates/times, commands, and missing
  causation.
- Exhaustive unions cover proposal, rejected, activated, and more-evidence outcomes.

### Pure engine tests

- Outcome summarizer maps fixed authoritative inputs to stable descriptors.
- Deterministic recovery advances only through allowed recovery-ladder phases.
- Validator rejects envelope mutation, unknown IDs, out-of-range settings, cross-company refs,
  and leak-lint failures.
- Activation is idempotent and rejects stale-parent races.
- Cycle N+1 control snapshot includes the active version while immutable refs remain unchanged.

### Database integration tests

A two-cycle test uses a fixed clock and a fake strict-schema model gateway:

1. seed a paper company, linked trading/policy modules, immutable catalogs, and Version 1;
2. run Cycle N through verification;
3. build and persist an observation summary;
4. generate and validate Version 2;
5. auto-activate Version 2 in paper mode;
6. run Cycle N+1;
7. assert complete causation and expected bounded behavior delta;
8. assert append-only history and company isolation.

Negative cases cover invalid model output, stale/cross-company evidence, unknown catalogs, and
attempted immutable guardrail mutation.

### Playwright lifecycle test

The policy node/panel displays:

- active version and parent;
- source cycle and evidence state;
- proposed bounded changes;
- validation/activation status;
- deterministic recovery activity;
- next-cycle control snapshot reference.

The test performs two paper cycles, observes Version 2 activation, starts Cycle N+1, and drills
from the new policy version to its observation, trace, verification, and market-data lineage.

### Credentialed Alpaca live-data cohort

This is opt-in and never required for secretless CI:

1. connect/read an Alpaca paper-data entitlement;
2. record actual quote/bar ValueRefs as `broker_state` with honest feed label;
3. execute the strategy through paper_sim or Alpaca paper only;
4. verify the outcome and produce a descriptor summary;
5. generate and auto-activate a bounded next-cycle response policy;
6. prove Cycle N+1 snapshots the new version;
7. confirm no live orders, no raw values in model inputs/outputs, and no console errors.

Assertions target provenance, causation, schema validity, boundedness, and activation—not a
particular market direction, price, fill, or return.

## CI and verification gates

- Secretless CI: contract, engine, DB integration, and Playwright tests use fixed/recorded inputs.
- Credentialed scheduled/manual job: actual Alpaca market-data cohort; failure is reported as
  blocked when credentials/entitlement are unavailable, not converted into synthetic success.
- IronBee verification: navigate → exercise two-cycle policy history/lineage → ARIA/screenshot →
  console check.
- Live execution remains fail-closed throughout.

## Acceptance criteria

1. A Cycle N trace can be followed to its verification, observation summary, Version N+1 proposal,
   validation, activation, and Cycle N+1 control snapshot.
2. The activated policy changes only allowlisted bounded selections.
3. Immutable envelope, guardrail, and verification schema versions do not change.
4. Same-cycle recovery is deterministic and model-free.
5. Policy generation receives no raw financial numbers or authoritative time values.
6. Real Alpaca market-data provenance is visible and never mislabeled as synthetic or live
   execution.
7. Paper mode may auto-activate a valid version; live mode cannot auto-activate.
8. Cross-company evidence and activation are rejected.
9. Replaying identical evidence with the deterministic test gateway yields the same policy hash.
10. All versions and rejected attempts remain queryable; no audit artifact is overwritten.

## Delivery sequence

1. Contracts and persistence for observations, policy versions, activations, and cycle lineage.
2. Deterministic outcome summarizer, validator, recovery tracking, and activation service.
3. Strategic policy proposal job and strict model gateway method.
4. Promote/control-snapshot consumption of the active policy version.
5. Two-cycle DB integration and negative safety tests.
6. Policy history/lineage UI and Playwright coverage.
7. Credentialed Alpaca live-data paper cohort and experiment scorecard.
