# verification (lands in M2)

Schema-locked trade verification + recovery ladders (v1 carryover; verification schemas are
IMMUTABLE — AGENTS.md invariant 3).

Planned surface:

- `verifyTrace(trace, schemaVersion)` — field-by-field verification against the registered
  schema; emits a `VerificationRecord` (pass | fail | blocked, failure codes from contracts).
- `runRecoveryLadder(record, ladderRef)` — deterministic recovery phases (widen → reduce →
  cancel → escalate) from the seeded recovery_ladders catalog; each phase bounded, logged,
  and idempotent.
- Blocked/failed outcomes escalate through the queue (`VERIFY` class) and surface in the
  right-panel activity feed with text-first status.
