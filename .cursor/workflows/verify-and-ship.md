# Verify, Commit, and Report Workflow

Standard close after **every verified update** and at **end of every session** (D-134).
Incomplete without invoking `commit-message` skill. Do not wait for the user to ask.

**Sources:** `.cursor/skills/verify-change/SKILL.md`, `.cursor/skills/commit-message/SKILL.md`,
`.cursor/workflows/end-of-run.md`

## Fixed order

```
implement / update → verify → curate docs → INVOKE commit-message skill → report
```

## Steps

### 1. Verify

Follow `verify-change` skill steps 1–5. **Stop** if verification fails.

### 2. Curate

Ensure agent-docs reflect verified behavior.

### 3. Commit (invoke skill — mandatory now)

1. **Read** `.cursor/skills/commit-message/SKILL.md` (full file)
2. Inventory every dirty file (`git diff --name-status`)
3. Publish chunk plan with **every file listed** per commit
4. For each chunk: **one Files changed bullet per staged file** + HEREDOC body
5. Cross-check bullet count = staged file count
6. Never use paragraph-only commit messages

### 4. Report

- Built + verified (how)
- Every commit SHA + subject + file count
- Uncommitted leftovers + why

### 5. Push

Only when user explicitly asks.

## Skip commit only when

| Condition | Commit? |
|-----------|---------|
| Verification passed + dirty files | **Yes — required immediately** |
| Session ending with dirty files | **Yes — required** |
| Clean tree | No |
| Verification failed | No |
| Only secrets/artifacts dirty | No |

## IronBee only

Browser via IronBee DevTools.

## Milestone gates

Gate claim requires verification + commits + decisions-log entry.
