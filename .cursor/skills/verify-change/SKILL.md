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

## 5. Doc sync

If verification reveals doc drift: fix agent-docs in same session.
Mark any unverified claims with explicit "unverified" until proven.

## 6. Report

Summarize for user: what was verified, how, and any remaining gaps/OQ-n.

## 7. Commit (mandatory if changes exist)

If verification passed and `git status` shows uncommitted run changes:

1. Invoke `commit-message` skill (or `commit-session` workflow)
2. Split by logical intent; bundle code + agent-docs
3. Commit with structured Conventional Commit body
4. Include verification results in the **Verification** section
5. Report commit SHA(s) in the final summary

**Skip commit** only when: no changes, verification failed, or dirty files are secrets/artifacts only.

Do **not** push unless the user explicitly requests it.
