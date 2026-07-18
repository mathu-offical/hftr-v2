# Secrets hygiene audit playbook

Step-by-step audit that operator API keys and broker secrets stay off public and
durable-transit surfaces.

**Skill:** `.cursor/skills/secrets-hygiene/SKILL.md`  
**Rule:** `.cursor/rules/secrets-hygiene.mdc` (always apply)  
**Decisions:** D-027 (user keys), D-074 (no secrets in job payloads)

## When to run

- Before claiming an integrations or settings change complete
- After any change to `enqueue`, research handlers, dead-letter, LLM invoke, adapters
- Periodic security pass / pre-release (`agent-docs/ops/security-audit.md`)

## 1. Inventory secret classes

Confirm each class still maps to encrypted storage + handler-time resolve:

| Class | Table | Resolve |
|-------|-------|---------|
| LLM | `user_api_keys` | `withUserApiKey` |
| Research | `user_research_keys` | `resolveResearchGatherCredentials` |
| Broker | `broker_connections` | `resolveExecutionContext` / gather credentials |

## 2. Grep for payload leaks

```bash
rg -n 'braveApiKey|alpacaSecret|privateKeyPem|\.\.\.gatherKeys' \
  packages/engine/src/handlers apps/web/app/api --glob '*.ts'
rg -n 'payload:\s*\{[^}]*[Aa]pi[Kk]ey' packages apps/web --glob '*.ts'
```

**Pass:** no matches in enqueue `payload: { ... }` objects except identity fields.

## 3. Public API surface

- GET `/api/settings/keys`, `research-keys`, `brokers*` → `keyHint` only
- Dead jobs GET → no `payload` field in response
- Job summary → `lastError` is stable codes only (spot-check handlers)

## 4. LLM path

- `packages/llm/src/invoke.ts` — `userPayload` has no `apiKey`
- `packages/llm/src/providers.ts` — key only in headers
- `llm_calls` schema — no prompt/secret columns

## 5. Queue guardrails

- `assertNoSecretsInJobPayload` called from `enqueue`
- Dead retry uses `stripSecretsFromJobPayload`
- `maintenance.sweep` calls `scrubSecretsFromJobPayloads`

```bash
pnpm --filter @hftr/engine exec vitest run src/queue/payload-secrets.test.ts
```

## 6. Adapter / log hygiene

- No `console.log` of request URLs that embed tokens
- Prefer header auth; if query-param auth required by provider, never log the URL
- Provider `errorBody` not copied into thrown `Error.message`

## 7. Report

Record:

- Pass / fail per section
- Any new forbidden key names added to `FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS`
- Doc updates (`security-audit.md`, decisions-log) if protocol changed

Then continue with `.cursor/workflows/end-of-run.md` if code changed.

## Related

- Credentialed integrations playbook: `.cursor/workflows/credentialed-integrations.md`
- Ops checklist: `agent-docs/ops/security-audit.md`
