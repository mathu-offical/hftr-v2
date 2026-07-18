# Security audit checklist (hftr-v2)

Pre-release and periodic operator review. Not a substitute for penetration testing.

**Agent playbook:** `.cursor/workflows/secrets-hygiene-audit.md` · `/secrets-audit`  
**Rules/skills:** `.cursor/rules/secrets-hygiene.mdc`, `.cursor/skills/secrets-hygiene/SKILL.md`

## Ownership and access

- [ ] Every API route uses `withAuth` + `scoping.getOwnedCompany` (or broker/settings equivalent) before reads/writes.
- [ ] Append-only tables (`action_traces`, `verification_records`, `credit_ledger`, `assistant_edits`) have no UPDATE/DELETE paths in app code except archive-first retention (hot → `*_archive` then delete).
- [ ] Company `broker_connection_id` unique index prevents one connection serving multiple companies.
- [ ] Live dispatch fail-closed: `resolveExecutionContext` + `live_gate_blocked` without `live_armed_at` and fresh evidence.

## Secrets and environment

- [ ] `CRON_SECRET` set in production; `/api/queue/drain` returns 401 without `Bearer` match.
- [ ] `DEV_AUTH_BYPASS` is **never** enabled in production deployments (CI e2e only).
- [ ] LLM provider keys: user-owned via settings; env keys do not authorize runtime calls (D-027).
- [ ] Research gather keys: resolved at handler time from `user_research_keys`; never serialized into `jobs.payload` (D-074).
- [ ] Broker credentials stored AES-GCM; verify routes never log plaintext or return ciphertext.
- [ ] Settings GET responses return `keyHint` only — never plaintext or ciphertext.
- [ ] LLM prompts / model gateway inputs never include API keys (header auth only).
- [ ] Dead-letter retry uses `stripSecretsFromJobPayload` before re-enqueue.
- [ ] `maintenance.sweep` scrubs legacy secret fields from job payloads.
- [ ] Prefer header auth over query-param tokens when the provider allows it; never log URLs that embed tokens.
- [ ] `.env.local` / secrets not committed; `.env.example` documents required vars without values.

## Logging and redaction

- [ ] API error responses use stable codes, not stack traces, in production.
- [ ] Queue drain and maintenance logs omit payload bodies that may contain credentials.
- [ ] `enqueue()` rejects known secret field names (`assertNoSecretsInJobPayload`) — fail-closed (D-074).
- [ ] Adapter `Error.message` / `jobs.lastError` use stable codes + status — never raw provider `errorBody`.
- [ ] Smoke scripts print `ok` / `fail` / `skip` only — never secret values.
- [ ] LLM leak lint runs on model outputs (digits + datetime patterns).
- [ ] Auto-disarm events log `companyId` + `reason` only (`live_gate_auto_disarm`).

## Queue and dead letters

- [ ] Dead-letter retry requires company ownership; bulk retry capped at 20 ids.
- [ ] Idempotency keys on retry include suffix to prevent duplicate side effects.
- [ ] Dead jobs GET API does not return `payload` (identity/status/error only).

## Retention

- [ ] `maintenance.retention` archives before delete (90d hot window).
- [ ] Archive tables (`action_traces_archive`, `assistant_messages_archive`, `assistant_edits_archive`) populated before hot row removal.

## Live trading

- [ ] Auto-disarm on broker verify failure, stale evidence while armed, and execution-context block.
- [ ] Operator must type `ARM LIVE TRADING` to arm (D-031).
- [ ] No guaranteed-returns language in UI, docs, or API copy.
