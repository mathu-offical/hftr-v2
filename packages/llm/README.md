# @hftr/llm

Provider clients + the schema-locked call wrapper for the three model tiers
(`agent-docs/architecture/llm-pipeline.md`):

| Tier      | Provider         | Role                                                   |
| --------- | ---------------- | ------------------------------------------------------ |
| strategic | Anthropic Claude | deep analysis, strategy refinement, research synthesis |
|           | → Mistral Large  | automatic continuity when Anthropic key missing/401 (D-067) |
| tactical  | Mistral / Cerebras | orchestration, curation, the built-in assistant      |
| execution | Groq             | fast schema-locked formatting/compiling                |

## `callSchema(...)` — the only way to call a model

Wrapper pipeline (every step mandatory):

1. Numeric substitution pass: raw values/datetimes in the input are replaced with ValueRef
   handles + descriptors before serialization (caller responsibility, verified here).
2. Temporal orientation block prepended (from `@hftr/engine` calendar service).
3. Provider call with JSON output mode, bounded retries on transient failures.
4. Zod parse against the registered output schema — invalid = retry once, then fail closed.
5. `leakLint` from `@hftr/engine` over the parsed output — any raw numeric/datetime outside
   the whitelist rejects the entire response (`numeric_leak`).
6. Usage row for `llm_calls` accounting returned to the caller (the queue handler persists it).

Providers are implemented over plain `fetch` (Anthropic Messages API; Mistral + Groq are
OpenAI-compatible chat completions) to keep the dependency surface minimal.
