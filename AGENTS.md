# hftr-v2 Workspace Agent Rules

These rules apply to any assistant or automation operating in the hftr-v2 workspace.

## Canonical sources (READ-ONLY)

- `DevSpecs/` (this repo) and the entire hftr v1 project
  (`/Users/matt-mobile/MATT/web_dev/hftr/DevSpecs/`, `/Users/matt-mobile/MATT/web_dev/hftr/agent-docs/`,
  and the v1 implementation) are read-only canonical references. Never edit them.
- All build work must align with the combined intent of the v2 init spec AND the original v1
  project. Conflicts are resolved and recorded in `agent-docs/dev-intent/decisions-log.md`.

## Living documentation (SELF-CURATION IS MANDATORY)

- `agent-docs/` is the canonical living documentation system. Start every substantial task by
  reading `agent-docs/README.md` and the owning doc(s) for the area you touch.
- Every change that affects behavior, schema, decisions, plans, or standards must update the
  owning agent-docs file(s) in the same change: plans progress, decision log entries, open
  questions, architecture deltas.
- Open questions get stable IDs (OQ-n) and are resolved, never deleted.

## Safety invariants (non-negotiable, carried from v1)

- The execution-agent compile stage is the LAST model-bearing stage. Deterministic dispatch and
  verification are model-free and provider-free — never introduce an LLM call below compile.
- Guardrails and verification schemas are immutable at runtime; only weights and bounded-range
  positions inside envelopes are mutable.
- Paper and live share one engine; mode changes adapters/limits/compliance paths only. Live is
  fail-closed until explicit gates pass. Never enable live-trading behavior without explicit
  gate criteria documented in `agent-docs/plans/master-build-plan.md`.
- LLMs never read, write, transform, or emit raw financial numbers OR authoritative
  dates/times/durations. Values flow: live data source / clock / market calendar → typed
  fixed-point k/v ValueRef → deterministic calculator → lever resolution → execution, with
  sanity checks at every morph point and leak linting (digits + datetime patterns) on all model
  outputs. Timestamps may appear as read-only orientation context, but never build a code path
  where model output text becomes a financial number, timestamp, duration, or schedule.
  All "now" reads go through the injectable clock module; all session math through the market
  calendar service. (`agent-docs/architecture/number-handling.md`)
- No guaranteed-returns language in code, docs, or UI copy.

## Architecture & code standards

- Stack decisions live in `agent-docs/research/tech-decisions.md` (TD-nn). Do not substitute
  technologies without logging a decision.
- `packages/engine` stays pure: no Next.js/React imports; runs in any Node runtime.
- Every cross-boundary artifact has a Zod schema in `packages/contracts`; LLM calls use strict
  JSON schemas and are re-validated server-side. Rate limiting is admission-based (call budgets),
  never context truncation.
- Database access goes through ownership-scoping helpers; append-only tables
  (`action_traces`, `verification_records`, `credit_ledger`, `assistant_edits`) are never
  updated or deleted by app code.
- TypeScript strict; exhaustive switches with `never` default on unions/enums; imports at top
  of file.

## Design / UI-UX standards

- Universal standards live in `agent-docs/ui-ux/ui-spec.md`: financial-terminal dark theme,
  design tokens, Lucide monochrome icons, no emojis in product UI, text-first status (color
  reinforces, never solely encodes), standardized entity cards, hybrid canvas aesthetic
  (clean node-graph + contained playful activity animation).
- Canvas code follows React Flow performance rules (memoized nodes/edges, external nodeTypes,
  selector-based state access).

## Zero-trust verification & testing

- No written code or implementation claim is trusted without verification. Verify changes
  against the running application (tests + browser via the workspace's DevTools browser tools)
  before considering any task complete.
- Every pipeline stage ships with contract tests against its declared schemas. Key user flows
  (listed in `agent-docs/ui-ux/ui-spec.md` §7) stay Playwright-covered.
- Encourage external research to validate technical claims and best practices before encoding
  them in code or docs; cite sources in `agent-docs/research/`.

## Deployment

- Target: new Vercel project + fresh Neon Postgres (D-006). Environment contract lives in
  `.env.example` and must stay in sync with `packages/contracts`. Standard var: `DATABASE_URL`.

## Cursor workspace

- Agent rules, skills, workflows, and slash commands: `.cursor/README.md` (D-010).
- Start substantial tasks with `session-start` skill; finish with `verify-change` skill.
- Slash commands: `/continue-build`, `/curate-docs`, `/verify`.
