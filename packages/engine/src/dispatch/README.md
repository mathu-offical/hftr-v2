# dispatch (lands in M2)

Deterministic order dispatch — the ONLY caller of `BrokerAdapter.submitOrder`.

Planned flow (broker-integration.md, llm-pipeline.md):

1. `finalizeTask(instruction)` — resolve every ValueRef in an `ActionInstruction` through the
   calc store; re-run the sanity gauntlet at this boundary; produce a `DeterministicActionTask`.
2. `preDispatchGauntlet(task)` — session legality (calendar service), broker policy envelope,
   capital limits, market structure checks. Any failure → `blocked` trace, never a warning.
3. `dispatch(task, adapter)` — submit with the idempotency key; poll fills within
   `fillTimeoutMs` (a clock/calendar-rooted ref); write the immutable `action_trace`.
4. Hand the trace to `verification/` for schema-locked verification and recovery ladders.
