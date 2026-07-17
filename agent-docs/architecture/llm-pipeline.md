# hftr-v2 LLM Pipeline

The model-bearing layers of the system. Governing rule (inherited, non-negotiable): the
execution-agent compile stage is the LAST model-bearing stage. Dispatch and verification are
deterministic and provider-free.

## 1. Tier map (user-confirmed 2026-07-16)

```
        ┌────────────────────────────────────────────────────┐
        │ STRATEGIC — Claude (Anthropic)                     │
        │ deep analysis, research synthesis, regime theses   │
        │ invoked SELECTIVELY by the Mistral orchestrator    │
        └───────────────▲────────────────────────────────────┘
                        │ delegation (schema-locked)
┌───────────────────────┴────────────────────────────────────┐
│ TACTICAL / ORCHESTRATION — Mistral (mistral-large-latest)  │
│ the main middleware engine: bulk analysis, lead decomposi- │
│ tion, decision-tree expansion, routing, assistant          │
└───────────────▼────────────────────────────────────────────┘
                │ compile handoff (DecisionTree + LeverState)
┌───────────────┴────────────────────────────────────────────┐
│ EXECUTION — Groq (llama-3.3-70b-versatile)                 │
│ format/compile ActionInstruction, schema verification aid   │
└───────────────▼────────────────────────────────────────────┘
                │ ActionInstruction (strict JSON schema)
        ═══ MODEL-FREE BELOW THIS LINE ═══
   deterministic gates → dispatch → broker → verification
```

Model selection uses allowlisted `MODEL_CAPABILITY_REGISTRY` + company `llm_policy`
(D-027). Runtime auth is **user-saved keys only** — deployment env API keys do not authorize
calls. Defaults: strategic `claude-sonnet-4-5` (requires org ZDR attestation in strict mode),
tactical/assistant `cerebras/zai-glm-4.7` (default ZDR), execution `groq/openai/gpt-oss-20b`
(strict json_schema). Optional env model-id overrides must still be allowlisted.
`HFTR_LLM_MODE=deterministic` forces placeholder handlers for CI.

### Job chain (D-027 / D-039)

```
research.curate (RESEARCH orchestrator)
  → research.gather (RESEARCH, model-free: Brave/SEC/market/news + catalog)
  → research.validate (RESEARCH, model-free relevance/leak/entitlement)
  → research.synthesize (STRATEGIC, optional LLM → ConceptBatch)
  → research.admit (RESEARCH, auto_admit_validated | require_operator_approval)
research.company_sweep → fan-out research.curate per active research module
research.strategic (STRATEGIC escalate path; deterministic fallback)
trend.promote (RESEARCH admission; evidence_fit consults admitted library refs)
  → tactical.expand (TACTICAL)     // TreeExpandOutput or deterministic tree
  → compile.select (COMPILE)       // CompileSelectionOutput bands + deterministic qty
  → dispatch.paper_trade (DISPATCH) // model-free
  → verify.reconcile_order (VERIFY) // venue fill settlement
```

ModelGateway is injected at drain time (inline promote/curate uses the session user;
cron uses company-owner key resolution). Quantity/price remain calculator-owned.
Gather + validate never call models; synthesize is the strategic optional stage.

## 2. Choice-generation over token-generation (v2 spec §"UPDATED LLM MODEL USAGE")

LLMs primarily SELECT from deterministic control palettes rather than generate free assessments:
- **Numbers and times are never in the output loop** (v2 spec §NUMBER HANDLING, D-008/D-009):
  all financial numbers AND authoritative dates/times/durations travel as opaque `ValueRef`
  handles with qualitative descriptor blocks; models drive the deterministic calculator +
  clock/calendar services via `calc.*` tools and select band positions/calc plans, never
  literals. Timestamps MAY appear as read-only context (temporal orientation block) but any
  literal number/datetime in a model output field is rejected by the leak linter. Output
  schemas type value fields as refs. Full design: `number-handling.md`.
- Every tier call receives: (a) the artifact to refine, (b) the applicable **lever registry
  slice** with bounded ranges (min/typical/max from the band catalog), (c) allowed enum choices.
- Output schema constrains responses to lever selections + choice IDs + bounded numeric values +
  short structured rationales. Out-of-range/unknown levers are rejected fail-closed
  (v1 `enforceScopeStrict`).
- Progressive disclosure: strategic sees family-level palettes; tactical sees tree-shape
  palettes; execution sees order-shape palettes only. No tier can set another tier's levers.

## 3. Call mechanics per provider

| | Anthropic (Claude) | Mistral | Groq |
|---|---|---|---|
| Structured output | tool-use forced (`tool_choice`) with JSON schema | `response_format: {type: "json_schema", strict: true}` | `response_format` json_schema, `strict: true` |
| Tool calling | yes (assistant not needed here) | yes — powers assistant + orchestration routing (≤128 tools) | limited use; compile is single-schema |
| Context budget | large; used for research synthesis | 256k (Large 3) | keep prompts small; speed tier |
| Retry policy | 2 retries, exp backoff, then requeue job | same + honor `X-RateLimit-Remaining` | same; sub-second calls allow tighter timeout class |

Every call goes through `packages/llm/call.ts`:
`callSchema({provider, tier, schemaRef, input, envelope})` →
1. budget admission check (below), 2. **numeric substitution pass** (replace every financial
number and authoritative datetime in the input payload with ValueRef + descriptors; prepend the
deterministic temporal orientation block; assert none remain), 3. provider call
with strict schema, 4. Zod re-validation (never trust provider strictness alone), 5. **numeric
leak lint** on output, 6. `llm_calls` ledger write (including leak-lint result), 7. schema- or
leak-invalid → one bounded repair attempt → fail job with `schema_validation_failed` /
`numeric_leak` (never silently degrade).

## 4. Rate limiting = admission control, not truncation (v2 spec requirement)

- `llm_budgets` defines per-scope windows: max calls/minute, max cost/day per provider per
  company. Job claim query joins budgets: a job whose `cost_estimate` exceeds remaining budget
  is NOT claimed (stays pending, visible in UI as "budget-queued").
- Initial-call limiting: module cadences and fan-out caps (e.g. max leads decomposed per
  tactical cycle) bound the NUMBER of calls; we never truncate context or outputs to fit limits.
- 429s: exponential backoff via `run_after` bump; repeated 429s trip a provider circuit breaker
  flag surfaced on the canvas node.

## 5. Idempotency & determinism at low levels

- Every LLM job carries `idempotency_key` = hash(tier, schemaRef, input digest, control snapshot
  version). Replays return the stored artifact instead of re-calling.
- Pipeline steps are as small as feasible (v2 spec: "specific pipeline steps as possible for
  idempotent functionality"): one lead per tactical expansion job; one tree per compile job.
- All prompts are versioned files in `packages/llm/prompts/` (system prompts carried/adapted
  from v1's Master Router, Regime Detection, Research Fabric, Strategy Specialist, Risk
  Supervisor, Learning Agent set). Prompt changes bump a `prompt_version` recorded on artifacts.

## 6. Tier responsibilities & schemas (contract names from packages/contracts)

| Stage | Model | Input → Output |
|---|---|---|
| research_synthesize | Claude | ResearchDirective + EvidencePackage[] → ConceptBatch (tagged concepts + links) |
| trend_emit | Mistral | ConceptBatch + RegimeSnapshot + philosophy → TrendCandidate[] |
| lead_nominate | Mistral | Trend + universe + activation preview → LeadPackage[] |
| deep_review (selective) | Claude | LeadPackage escalation (low confidence / high stakes) → LeadReview |
| tree_expand | Mistral | LeadPackage + strategy family palette → DecisionTree v1 |
| tree_refine | Mistral | DecisionTree + market delta → TreeRefinement (lever deltas only) |
| compile | Groq | DecisionTree branch + execution palette → ActionInstruction |
| assistant_edit | Mistral | user msg + company state digest + edit-tool registry → tool calls (JSON patches) |

Claude invocation policy: Mistral's orchestration step outputs an `escalate_to_strategic`
boolean + reason enum; a budget-capped Claude job is enqueued only when true (plus scheduled
pre-market synthesis). This keeps Claude cost bounded and matches "Mistral delegates to Claude".

## 7. Built-in assistant (Mistral)

- Company-scoped chat with access to the currently viewed company graph.
- Edits ONLY via hardened tool functions (no freeform writes): `create_module`, `update_module_config`,
  `link_modules`, `set_policy`, `allocate_funds`, `create_watchlist`, `trigger_tier`, each with a
  strict JSON schema mirroring the API layer's Zod validators — the assistant calls the same
  validated service functions as the UI, never SQL.
- Every applied edit is written to `assistant_edits` with the JSON patch and requires either
  inline user confirmation (default) or falls under a user-enabled auto-apply policy scoped to
  non-financial edits. Fund movements and live-mode changes ALWAYS require explicit confirmation.
- **Numeric capture rule (D-008):** when the user states an amount ("allocate $500"), the model
  does NOT restate the number. Its tool call references the source span
  (`{amountFrom: {messageId, spanStart, spanEnd}}`); a deterministic parser extracts and
  normalizes the digits from the user's original text into an `operator_input` ValueRef, and the
  confirmation card renders that parsed value back to the user before applying. Model-emitted
  amount fields are rejected by the leak linter like any other numeric output.
