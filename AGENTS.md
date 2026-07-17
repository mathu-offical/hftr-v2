# hftr-v2 Workspace Agent Rules

These rules apply to any assistant or automation operating in the hftr-v2 workspace.

## Canonical sources (READ-ONLY)

- `DevSpecs/` (this repo) is a read-only canonical reference. Never edit it.
- v1 material is **vendored into this repo**: reference snapshot at
  `agent-docs/research/v1-reference/` (read-only) and seed catalogs at
  `packages/db/src/seed/catalogs/` (canonical, editable with `catalog_version` bumps).
- **Independence rule (D-015):** this repository must never depend on the external v1
  workspace (`/Users/matt-mobile/MATT/web_dev/hftr/`) at build, seed, or runtime. If something
  new is needed from v1, vendor it in and record the provenance in
  `agent-docs/research/v1-carryover.md`. The external v1 project stays read-only history.
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
- Start substantial tasks with `session-start` skill; close with **verify → curate → commit**
  (`/end-run` or `.cursor/workflows/end-of-run.md`). Always **invoke** `commit-message` skill.
- Slash commands: `/continue-build`, `/curate-docs`, `/verify`, `/commit-session`, `/end-run`.

## Sub-agent orchestration

- Decompose substantial multi-package or multi-domain work into **parallel sub-agents** when
  tasks are independent. Only the parent agent spawns sub-agents.
- **All Cursor sub-agents use `composer-2.5`.** Never use Grok (`cursor-grok-*`) for sub-agents.
  (This is separate from the product's **Groq** execution-tier LLM provider.)
- Sub-agent prompts must be high-granularity: absolute paths, explicit constraints, verification
  steps, and structured return format. Parent re-verifies all sub-agent output (zero-trust).
- Rule: `.cursor/rules/parallel-subagents.mdc`; skill: `.cursor/skills/parallel-orchestration/`.

## Git commits

- Use **Conventional Commits** with hftr-v2 scopes and a **full structured body**.
  Subject ≤72 chars; body must list **every staged file** under `Files changed`
  (path + what + why). Never paragraph-only or truncated messages.
- **Mandatory end-of-run:** after verification, **read and follow**
  `.cursor/skills/commit-message/SKILL.md` — inventory diffs, plan chunks, commit
  each chunk. A run with uncommitted verified work is incomplete.
- One logical intent per commit; bundle code with owning `agent-docs/` when same intent.
- Cross-check: Files changed bullet count == staged file count.
- Pre-commit: `pnpm typecheck`, `pnpm lint`, `pnpm test` for runtime code.
- Never commit secrets. Push only when user asks.
- Rule: `.cursor/rules/git-commits.mdc`; skill: `.cursor/skills/commit-message/`;
  workflows: `end-of-run.md`, `verify-and-ship.md`; commands: `/end-run`, `/commit-session`.
