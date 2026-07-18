---
name: secrets-hygiene
description: Audit and enforce API key / secret hygiene in hftr-v2 — job payloads, LLM calls, settings APIs, logs, dead-letter retry, adapter errors. Use when adding integrations, touching enqueue/handlers/settings, reviewing security, or when the user asks about API keys, BYOK, credentials, or secret exposure.
---

# Secrets hygiene (hftr-v2)

Fail-closed checklist so operator secrets never appear in durable transit, LLM
prompts, logs, or public-facing responses. Decisions: **D-027**, **D-074**.

## When to use

- Adding or changing LLM / research / broker credential paths
- Touching `enqueue`, research handlers, dead-letter retry, settings APIs
- Security review / `/verify` when secrets-related files changed
- User asks about API keys, BYOK, exposure, or credential leakage

## Invariants (must hold)

| Invariant | Mechanism |
|-----------|-----------|
| No secrets in `jobs.payload` | `assertNoSecretsInJobPayload` at enqueue; strip on dead retry |
| LLM auth header-only | `withUserApiKey` → `rawCall({ apiKey })` headers; never in `userPayload` |
| Research keys at handler time | `resolveResearchGatherCredentials(db, companyId)` |
| Settings GET = hints only | `keyHint` last-4; never ciphertext/plaintext |
| Legacy scrub | `scrubSecretsFromJobPayloads` in `maintenance.sweep` |
| Smoke ≠ runtime | Env keys only under `HFTR_*_SMOKE` / `ALPACA_PAPER_SMOKE` |

## Audit checklist

```
- [ ] Grep for *ApiKey / alpacaSecret / privateKeyPem in enqueue payloads and Zod job schemas
- [ ] Confirm new handlers resolve secrets via DB decrypt, not job.payload
- [ ] Confirm LLM prompts/directives have no credential fields
- [ ] Confirm settings GET/PUT responses never include ciphertext or full keys
- [ ] Confirm adapters do not console.log URLs or Authorization headers
- [ ] Confirm Error.message / lastError use stable codes (no provider errorBody)
- [ ] Confirm dead-letter retry uses stripSecretsFromJobPayload
- [ ] If new secret field name invented: add to FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS
- [ ] Update agent-docs/ops/security-audit.md if protocol changed
```

## Grep seed (run from repo root)

```bash
rg -n 'braveApiKey|alpacaSecret|privateKeyPem|\.\.\.gatherKeys|jobs\.payload' \
  packages/engine apps/web/app/api --glob '*.ts'
rg -n 'assertNoSecretsInJobPayload|resolveResearchGatherCredentials|withUserApiKey' \
  packages --glob '*.ts'
```

Expected: key field names appear in `gather-credentials.ts`, adapters' in-memory bags,
and forbidden-key lists — **not** in handler enqueue objects or API curate/query payloads.

## Safe patterns

```ts
// ✅ enqueue — identity + intent only
await enqueue(db, clock, {
  kind: 'research.gather',
  payload: { companyId, moduleId, requestId, queryText, topicScope },
  ...
});

// ✅ handler — resolve then use in-process only
const creds = await resolveResearchGatherCredentials(db, companyId);
await gatherEvidencePackages({ ...creds, query });

// ✅ LLM — scoped callback
await withUserApiKey(db, clerkUserId, provider, (apiKey) =>
  rawCall({ provider, model, apiKey, system, user }),
);

// ✅ dead retry
payload: stripSecretsFromJobPayload(dead.payload as Record<string, unknown>),
```

```ts
// ❌ never
payload: { companyId, ...gatherKeys }
payload: { apiKey: plain }
Error(`provider failed: ${res.errorBody}`) // may reach jobs.lastError / UI
```

## Related

| Asset | Path |
|-------|------|
| Always-on rule | `.cursor/rules/secrets-hygiene.mdc` |
| Integrations skill | `.cursor/skills/external-integrations/SKILL.md` |
| Integrations rule | `.cursor/rules/external-integrations.mdc` |
| Workflow | `.cursor/workflows/secrets-hygiene-audit.md` |
| Security checklist | `agent-docs/ops/security-audit.md` |
| Queue contract | `agent-docs/architecture/job-orchestration.md` |

## After changes

1. `pnpm --filter @hftr/engine exec vitest run src/queue/payload-secrets.test.ts`
2. Typecheck affected packages
3. Curate docs if behavior changed; cite D-074
4. Invoke `verify-change` then `commit-message` per end-of-run
