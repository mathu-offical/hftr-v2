---
name: verify-change
description: Zero-trust verification pass for hftr-v2 changes — tests, browser (IronBee DevTools), console errors, doc accuracy, then commit verified work. Use before finishing any task with runtime-observable effects, at end of implementation runs, or via /verify command.
---

# Verify change (zero-trust)

Nothing is "done" until verified against the running system.

## 1. Classify change

| Type | Verification |
|------|--------------|
| UI/UX | IronBee browser: navigate, interact, snapshot, console |
| API/route | HTTP call or browser flow exercising endpoint |
| Engine/contracts | vitest contract tests |
| DB migration | migrate from zero + scoping helper tests |
| Docs-only | Skip runtime if no behavior claims; else spot-check claims |

## 2. Run tests

When package scaffold exists:

```bash
pnpm typecheck   # or turbo typecheck
pnpm test        # vitest for affected packages
pnpm lint
```

Run only affected package tests when monorepo is large.

## 3. Browser verification (IronBee DevTools only)

**Forbidden:** Cursor built-in browser, plugin-browse-browser for hftr-v2 work.

Flow:
1. `navigation_go-to` → affected page
2. Functional exercise (click/fill/submit — not screenshot-only)
3. `a11y_take-aria-snapshot` for structure confirmation
4. `content_take-screenshot` if visual check needed
5. `o11y_get-console-messages` — zero unexpected errors

Prefer `execute` tool for 3+ step flows.

## 4. Key flows reference

When implementing flows from `ui-ux/ui-spec.md` §7, verify the relevant flow:

1. Clerk sign-up → company wizard → canvas
2. Stripe credits → paper seed → allocations visible
3. Research → trend → compile → paper dispatch → trace in right panel
4. Alpaca paper connect → dispatch to sandbox
5. Assistant edit proposal → confirm → canvas update
6. Live-gate blocked with text-first reasons
7. Math module lineage from trace inspector

## 5. Paper experiment verification

When closing a paper experiment run (`paper-experiment` skill):

- [ ] Preflight confirmed: mode=`paper`, no live adapter/credentials, live gate not bypassed
- [ ] Cohort traces and verification records captured for each company in scope
- [ ] Provenance audit: feedClass honesty + ValueRef lineage (see `number-handling.mdc` §Experiment close-out)
- [ ] Intent-alignment audit scored per `agent-docs/testing/intent-alignment-scoring.md`; hard fail on immutable cap violations
- [ ] Console clean on any UI exercised during the run

## 5b. Secrets hygiene (when credentials-adjacent)

If the change touches enqueue, job handlers, settings APIs, LLM invoke, adapters, or
dead-letter retry — invoke `.cursor/skills/secrets-hygiene/SKILL.md` and confirm:

- [ ] No secrets in new/changed `jobs.payload` shapes (`assertNoSecretsInJobPayload`)
- [ ] Credentials resolve at handler/call time only (not at enqueue)
- [ ] GET settings / public APIs return `keyHint` only — never plaintext/ciphertext
- [ ] LLM prompts contain no API keys; auth is header-only
- [ ] Dead retry strips secrets; adapter errors do not put `errorBody` into `lastError`

Workflow: `.cursor/workflows/secrets-hygiene-audit.md`

## 6. Doc sync

If verification reveals doc drift: fix agent-docs in same session.
Mark any unverified claims with explicit "unverified" until proven.

## 7. Report

Summarize for user: what was verified, how, and any remaining gaps/OQ-n.

## 8. Commit (mandatory — invoke skill)

If verification passed and the working tree has run changes:

1. **Read** `.cursor/skills/commit-message/SKILL.md` and follow it completely
2. Inventory every dirty file; write a chunk plan listing each file per commit
3. Per chunk: **one Files changed bullet per staged file** (path + what + why)
4. HEREDOC commit; cross-check bullet count equals staged file count
5. Report every SHA + subject + file count

**Forbidden:** paragraph-style messages, truncated file lists, skipping the skill.

**Skip commit** only when: no changes, verification failed, or only secrets/artifacts dirty.

Do **not** push unless the user explicitly requests it.

Prefer workflow `.cursor/workflows/end-of-run.md` or `/end-run`.
