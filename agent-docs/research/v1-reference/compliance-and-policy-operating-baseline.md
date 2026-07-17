# Compliance and Policy Operating Baseline

## Metadata

- owner: research
- lastUpdated: 2026-05-19
- tags: research, markdown, verification_layer, deterministic_trade_action_layer, action_trace, background_curation
- linkedIndexes: research-index.json, ../wiki/wiki-index.json, ../audits/issues.json
- jsonTerms: verification_layer, deterministic_trade_action_layer, action_trace, background_curation

This baseline should stay synchronized with ../wiki/compliance-ops.md, ../wiki/guardrails.md, compliance-policy-package-catalog.json, guardrail-recovery-package-catalog.json, broker-policy-envelope-catalog.json, and session-constraint-catalog.json.

## Role

- define the minimum compliance posture that must remain visible in research, wiki, audit, and JSON summary surfaces
- keep live-mode, retention, throttling, and traceability controls explicit before implementation hardening begins
- provide enough canonical detail that registry cards and source previews can summarize policy posture without inventing alternate page-local prose

## Purpose

Define a compliance-first operating baseline so legal, retention, throttle, and live-mode controls are designed into HFTR from inception.

## Ground-Up Compliance Posture

- Compliance is not a post-MVP hardening stream.
- Product, architecture, policy, and audit paths must encode compliance from first implementation.
- All high-risk actions must produce deterministic traces with policy IDs and decision context references.

## Baseline Control Domains

### 1) Account and Access Controls

- Live mode requires connected broker account health checks.
- Live mode remains fail-closed if account connectivity, authentication, or policy checks fail.
- Role-based controls must separate research operators, policy operators, and execution approvers where applicable.

### 2) Execution and Guardrail Controls

- Deterministic trade action layer remains model-free at dispatch time.
- Guardrail and verification contracts are immutable at runtime.
- Mutable ranges (weights, slippage bands, timeout bands, throttle budgets) are versioned and trace-logged.

### 3) Data Retention and Override Controls

- Primary retention behavior is contract-driven by agent outputs and decision trees.
- Legal-hold and regulator-request overrides must supersede contract defaults.
- Broker and jurisdiction retention minima must supersede shorter internal retention settings.
- Retention policy changes must be auditable with effective date, policy owner, and scope.

### 4) Communication and Claims Controls

- Messaging is process-oriented and realism-first.
- No guarantee-of-returns positioning.
- Risk controls, constraints, and failure handling behavior are made explicit in documentation and UI copy.

## Throttling Policy Baseline

- Users can configure endpoint throttling via broker policies.
- System enforces hard caps, cooldown windows, and circuit breakers regardless of user settings.
- Throttle overrides require traceable policy provenance and rollback support.

## Regulatory Knowledge Packages

- regulatory and compliance knowledge should be first-class seeded modules, not just prose scattered across product or audit pages
- packages should cover launch-boundary assumptions, retention precedence, throttle policy, live-mode unlock gates, session legality, and evidence-retention obligations
- the same package discipline should be used for guardrail and recovery policy so operators can review why a block, defer, downgrade, or escalation path exists

## Canonical Package Materialization

- compliance-policy-package-catalog.json is the first-class JSON companion to this baseline and should carry package-scoped summaries, operator posture, fallback paths, and lineage-friendly policy ownership fields
- guardrail-recovery-package-catalog.json remains paired to the compliance catalog because fail-closed behavior, recovery ladders, and escalation paths must remain queryable together during triage and promotion review
- broker-policy-envelope-catalog.json and session-constraint-catalog.json remain downstream policy overlays, not substitutes for the higher-level compliance package set documented here

## Queryability and Access

- overview access should answer the current policy posture for a module, sector, strategy family, or session without forcing raw-document inspection
- analyst access should expose affected constraints, policy versions, fallback paths, and impacted strategy or sector packages
- lineage access should expose evidence source, effective date, policy owner, retention implications, and audit references
- immediate ad hoc requests are required for live triage, operator inspection, and promotion-gate review
- long-running research is required for policy verification, jurisdictional refresh, and reliability review, but it must remain upstream of deterministic dispatch and cannot mutate live legality directly

## Concrete Implementation Contracts

- live-mode gate contract: broker connectivity, deterministic verification threshold, parity suite pass, and recovery-drill pass are all required before unlock.
- retention baseline contract: 90-day hot retention plus 1-year archive retention, unless superseded by legal hold, regulator request, or broker/jurisdiction minimums.
- session legality contract: overnight and extended-hours routing must enforce order-type legality before deterministic dispatch.
- execution-agent host contract: Groq default remains primary; local host profiles stay feature-flagged until functional-parity benchmarks are documented.

## Session, Feed, and Reporting Controls

- Market-data entitlement posture is part of compliance truthfulness, not just UX polish. A Basic-plan or paper workspace must remain visibly distinct from SIP-complete or real-time BOATS coverage in operator read models and audit summaries.
- Overnight legality requires both the session matrix in [session-constraint-catalog.json](session-constraint-catalog.json) and the active broker overlay in [broker-policy-envelope-catalog.json](broker-policy-envelope-catalog.json); neither may be replaced by ad hoc operator judgment.
- Off-hours traces should retain the selected market-data feed, entitlement class, delayed-vs-realtime posture, and the `overnight_tradable` / `overnight_halted` asset snapshot described in [market-data-research.md](market-data-research.md).
- Audit and replay records for overnight fills should also preserve assigned trade date and buying-power basis because the trade-date boundary and DTBP exception change how those events are interpreted in compliance review.
- Websocket authorization, listening acknowledgement, in-stream error, and REST-reconcile decisions described in [execution-microstructure-and-order-quality.md](execution-microstructure-and-order-quality.md) are compliance-relevant evidence for why a dispatch path paused, reconciled, or failed closed.

## Trace and Audit Expectations

- blocked, retried, recovered, and successful actions should all preserve ActionTrace-compatible evidence with policy IDs and contract versions
- retention overrides should remain inspectable as policy events rather than inferred from storage side effects
- promotion gates for strategy families should reference the same legality and evidence posture described here rather than an isolated strategy-only standard
- background curation may adjust policy envelopes and evidence posture, but it must never gain direct dispatch authority

## Continuous Verification Requirement

- Nightly research verification runs are mandatory.
- Verified strategy evidence updates strategy weights.
- Stale or invalid evidence reduces strategy confidence/weight until revalidated.

## Source and Cascade Contract

- this research page defines why compliance gates exist and what immutable contracts they protect
- wiki pages should restate operator-facing consequences, while JSON registry summaries should expose compact summaries, entity scopes, and source references back to this document
- if launch boundaries, jurisdiction scope, or retention precedence assumptions change, update this file before adjusting downstream registry text or UI summaries

## External Tooling Guidance

- observability stack should preserve policy-safe traces without leaking secrets or bypassing deterministic telemetry contracts.
- experiment and dataset lineage tooling should support source lineage, dataset/version identifiers, run grouping, and audit-friendly metadata.
- any AI-tier tracing platform must stay upstream of deterministic dispatch and should not become a hidden control plane.

## Open Validation Tracks

1. Jurisdiction and legal-entity scope matrix for launch boundaries.
2. Hard-cap values for throttle controls by endpoint class.
3. Local execution-agent profile benchmark thresholds versus Groq baseline.

## Sources

- <https://www.investopedia.com/terms/p/pdt.asp>
- <https://www.finra.org/rules-guidance/rulebooks/finra-rules/4210>
- <https://www.sec.gov/rules-regulations/staff-guidance/trading-and-markets-frequently-asked-questions>
- <https://docs.alpaca.markets/us/docs/245-trading-for-trading-api>
- <https://docs.alpaca.markets/us/docs/about-market-data-api>
- <https://docs.alpaca.markets/us/docs/websocket-streaming>
