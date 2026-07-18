# Operations runbook (hftr-v2)

Operator-facing procedures for queue drain, credentials, live arming/disarm, dead letters,
retention audit, and rollback. Billing (Stripe) is **deferred** — see D-032.

## Queue drain

1. Confirm no live-armed companies are dispatching (`companies.live_armed_at` null or disarmed).
2. Run the worker drain path (`packages/engine/src/queue/drain.ts`) or stop enqueue sources.
3. `maintenance.sweep` reclaims expired leases and prunes completed jobs (7d).
4. Inspect `/api/queue/stats` — pending/active should trend to zero before schema migrations.

## API keys and broker credentials

- LLM keys: user-owned via settings; env keys do not authorize runtime calls (D-027).
- Research keys (Brave, market news): user-owned via settings (`user_research_keys`); env for smoke only (D-039).
- Broker credentials: AES-GCM in `broker_connections`; never log plaintext.
- Rotate keys in settings → re-verify connection → re-run live-gate review if live-bound.

### CLI connectivity smoke (opt-in)

| Command | Gate | Checks |
|---------|------|--------|
| `pnpm smoke:llm` | `HFTR_LLM_SMOKE=1` | Present `*_API_KEY` → models-list (Anthropic format-only) |
| `pnpm smoke:research` | `HFTR_RESEARCH_SMOKE=1` | Brave, Marketaux, Alpaca news, Finnhub, Polygon when keys set |
| `pnpm smoke:alpaca-paper` | `ALPACA_PAPER_SMOKE=1` | Alpaca paper adapter vitest smoke |

All scripts exit 0 with `skip:` when the gate or keys are unset. Never log secret values.
Matrix: `agent-docs/research/integrations-matrix.md`. Playbook: `.cursor/workflows/credentialed-integrations.md`.

## Alpaca paper smoke

**Automated (opt-in):** `pnpm smoke:alpaca-paper` or `node scripts/smoke-alpaca-paper.mjs`
with `ALPACA_PAPER_SMOKE=1` and env credentials (`ALPACA_PAPER_KEY` / `ALPACA_PAPER_SECRET`,
alias `ALPACA_PAPER_KEY_ID`). Runs `verifyConnection`, `fetchBars`, and `getBalances` against
Alpaca paper only. Optional `ALPACA_PAPER_SUBMIT=1` submits one tiny SPY paper market order and
cancels when accepted — never enable in CI without explicit operator intent. Skips cleanly when
unset (exit 0). Secrets are never logged.

**Manual UI path (encrypted round-trip):** full submit/reconcile through app-saved credentials
requires operator keys in settings — the smoke script cannot decrypt `broker_connections`.

1. Open any company canvas → **User settings** (header) → **Brokers** tab.
2. Enter Alpaca paper key ID + secret → **Save** → **Verify** (hits `createAlpacaPaperAdapter`
   via `POST /api/settings/brokers/:id/verify`).
3. Open company **top drawer** (ribbon) → **Settings** tab → **Bind connection** → choose verified
   Alpaca paper row.
4. Run a paper loop: bottom panel **Trends** → promote a candidate → confirm dispatch uses the
   bound adapter (`GET /api/companies/:id/broker` shows `feedEntitlementLabel`:
   `alpaca_iex_paper`).

Record pass/fail in ops notes; automated smoke does not replace the encrypted UI spine check.

## Live arming (fail-closed)

Live dispatch requires **all** of:

1. Checklist `overallPass` from `evaluateLiveGateChecklist`
2. Fresh evidence persisted (`live_gate_evidence`, &lt;24h)
3. Operator types exactly `ARM LIVE TRADING` on `POST .../live-gates/arm` (D-031)
4. `companies.live_armed_at` set

### Disarm (immediate)

1. `POST /api/companies/:companyId/live-gates/disarm` — clears `live_armed_at`.
2. UI: top-bar **ModeSwitch** → open live gate panel → **Disarm** (when armed).
3. Verify: `GET .../live-gates/status` shows `liveArmedAt: null`; broker GET shows
   `liveGateBlocked: true` for live-bound companies without arming.
4. Before rollback or credential rotation on a live-bound company, disarm first.

UI: top-bar **ModeSwitch** shows checklist text-first (`Live trading is gated.`); **Arm** is
disabled until evidence passes; confirmation input placeholder is `ARM LIVE TRADING`.

Engine: `resolveExecutionContext` + `resolveBrokerAdapter` throw `live_gate_blocked` without arming.

## Dead-letter jobs

- List: `GET /api/companies/:companyId/jobs/dead`
- Retry: `POST .../jobs/dead/:jobId/retry` — re-enqueues with a new idempotency suffix
- UI: bottom panel **Dead letters** tab → select job → **Retry**

### Dead-letter retry procedure

1. Open company canvas → expand bottom panel (`` ` ``) → **Dead letters** tab.
2. Note `kind`, `attempts`, and `lastError` on the dead job row.
3. Fix root cause (module config, missing catalog, provider key, etc.).
4. Click **Retry** on the row (or `POST .../jobs/dead/:jobId/retry`).
5. Run queue drain (`GET /api/queue/drain` or cron) and confirm job completes or fails with a
   new actionable error — do not retry blindly in a loop.

## Retention (M6, D-030)

| Artifact | Hot window | Action today |
|----------|------------|--------------|
| `jobs` completed | 7d | pruned by `maintenance.sweep` |
| `action_traces` | 90d hot | **count + log only** (`maintenance.retention`) — no delete until archive table |
| `assistant_messages` / `assistant_edits` | 90d hot (D-030) | policy recorded; purge job not shipped |

### Retention audit procedure

1. Ensure `maintenance.sweep` has run (enqueues `maintenance.retention` each sweep).
2. Check worker logs for `maintenance.retention: traces beyond 90d hot window` with `staleCount`.
3. SQL spot-check (read-only): `SELECT count(*) FROM action_traces WHERE created_at < now() - interval '90 days';`
4. **No delete** until cold archive table ships — counts are audit-only.
5. Assistant rows: same 90d policy; no purge job yet — track `staleCount` manually if needed.

## Rollback

1. Disarm live (`POST .../live-gates/disarm`).
2. Set company `mode` to `paper` if needed (DB or future API).
3. Revert deployment; run migrations backward only with explicit ops approval.
4. Replay dead-letter retries after root cause fixed.

## Assistant proposals

Bounded write tools only: `rename_module`, `patch_module_config`, `add_watchlist_item`.
Confirm via assistant dock or `POST .../assistant/proposals/:id/confirm`.
