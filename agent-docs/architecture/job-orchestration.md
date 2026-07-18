# hftr-v2 Job Orchestration — Custom Postgres Queue

User directive (2026-07-16): "as custom as possible, but still stable... without further
dependency lock-in." Design: a hardened, self-owned Postgres queue using the industry-standard
`FOR UPDATE SKIP LOCKED` pattern (the same primitive behind pg-boss, Solid Queue, and v1's
`pipeline_jobs`), with the pipeline-specific features we need baked in natively.

## 1. Why this is the stable choice

- Postgres is already the system of record → enqueue is transactional with business writes
  (transactional outbox: no dual-write problem).
- Moderate throughput (tens of jobs/sec worst case) is squarely inside SKIP LOCKED's proven
  envelope; Redis/broker infra is overkill and adds a SPOF + vendor surface.
- v1 already validated this shape (`pipeline_jobs` + worker + cron drain) — v2 hardens it rather
  than re-inventing.
- Zero external services; portable to any Postgres; worker loop lives in `packages/engine` and
  runs identically in a Vercel function or a dedicated process.

## 2. Schema (see data-model.md `jobs`)

Claim query (the core primitive):

```sql
WITH claimed AS (
  SELECT id FROM jobs
  WHERE status = 'pending'
    AND run_after <= now()
    AND queue_class = ANY($1)
    -- budget admission join: skip jobs whose llm cost_estimate exceeds remaining budget
  ORDER BY priority DESC, run_after ASC
  LIMIT $2
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs j SET status='active', locked_by=$3, locked_until=now() + lease_interval,
  attempts = attempts + 1
FROM claimed WHERE j.id = claimed.id
RETURNING j.*;
```

Rules (from production-queue literature + v1 lessons):
- **Short claim transactions** — claim, commit, then execute. Never hold the row lock during work.
- **Leases, not locks** — `locked_until` expiry makes crashed workers recoverable; a sweep job
  requeues expired leases (`status='active' AND locked_until < now()` → pending, attempt++).
- **Bounded retries with jitter** — `run_after = now() + base * 2^attempts + jitter`; exceeded
  `max_attempts` → `status='dead'` (dead-letter), surfaced in UI + docs audit.
- **Idempotent handlers** — at-least-once delivery; every handler checks `idempotency_key`
  results before re-doing side effects (LLM calls return cached artifacts; dispatch dedupes on
  `deterministic_tasks.idempotency_key`).
- **No secrets in payload (D-074):** `jobs.payload` is identity + intent only. Operator BYOK
  and broker secrets resolve at handler time (`resolveResearchGatherCredentials`,
  `withUserApiKey`, `resolveExecutionContext`). `enqueue()` rejects known secret field names.
- **Queue classes carried from v1:** `RESEARCH | LIBRARY_RESEARCH | POSTURE_RESEARCH |
  STRATEGIC | TACTICAL | COMPILE | DISPATCH | VERIFY | TRAINING` (+ `ASSISTANT`, `BILLING`,
  `MAINTENANCE` in v2). **D-098:** library topic/module research uses `LIBRARY_RESEARCH`;
  market-posture system libraries use `POSTURE_RESEARCH`; both stay off execution and
  assistant/strategic engine lanes. Legacy `RESEARCH` remains for in-flight jobs.
  DISPATCH/VERIFY are drained with highest priority and shortest leases.
- **Fairness / company serial (D-052 / D-098):** claim skips companies that already hold an
  active (non-expired) lease **on the same `queue_class`**, and keeps ≤1 job per
  `(company_id, queue_class)` in a claim batch (null-company maintenance jobs stay parallel).
  Engines on the same company therefore run **sequentially within a lane**, while library
  research and posture research may proceed alongside execution.

## 3. Scheduling

- `job_schedules` table holds recurring definitions (cron expr, queue class, payload template,
  module_id). A `MAINTENANCE` tick materializes due schedules into jobs (idempotent per
  schedule+window key).
- **Equity 15s fallback (D-084):** `maintenance.sweep` calls `enqueueDueEquityRefreshJobs`,
  which plans one `equity.refresh` job per active paper company for the current 15-second
  window when XNYS session phase is `open` / `midday` / `power_hour`. Closed / overnight /
  pre_market defer. Idempotency key `equity-refresh-{companyId}-{window}`. Handler runs
  `recomputeCompanyEquity(…, 'schedule')` without inventing marks.
- Vercel Cron entries (few, coarse): `*/1min queue drain tick`, `pre-market research`,
  `nightly curation + seed verification`, `lease sweep`. Fine-grained cadences (≤5m execution
  tier, ≤30m tactical) come from `job_schedules`, not Vercel config → user-tunable per module.

## 4. Drain execution on Vercel

- `GET /api/queue/drain` (CRON_SECRET bearer): time-boxed loop (budget = maxDuration − safety
  margin), claims → executes → repeats until empty or time-box hit. Each drain tick
  **idempotently enqueues `maintenance.sweep` once per UTC minute** (D-065) so due
  `job_schedules` materialize before claim — research cadence, system:movers, lease reclaim,
  retention enqueue. **Inline promote** drains only
  `RESEARCH|TACTICAL|COMPILE|DISPATCH|VERIFY` with `kickMaintenanceSweep: false` so
  posture/library side-jobs cannot starve paper fill.
- Handlers are plain async functions registered in `packages/engine/handlers/` keyed by
  `queue_class` + job kind — no framework coupling.
- **Escalation path (documented, not built until needed):** if Vercel time-boxing proves too
  tight for market-hours dispatch watchers, deploy `packages/engine` worker loop as a small
  always-on process (Fly/Railway/VPS) pointing at the same Neon DB. Identical code, different
  runner. Decision gate logged as open question OQ-2.

## 5. Watchers (deterministic market-hours loop)

Executable states (`watch|wait|order`) need sub-minute evaluation while market is open. Design:
- A `DISPATCH`-class recurring "watcher sweep" job (every 1 min via drain tick during session
  hours) evaluates all active executable states against fresh quotes in one batch — set-based,
  not per-symbol jobs, keeping job volume low.
- Realtime upgrade path: broker WebSocket consumer inside the dedicated worker (escalation path
  above) pushing evaluations on tick; contract identical.

## 6. Observability

- `jobs` status counts by queue class exposed at `/api/queue/stats` → canvas HUD + node badges.
- Dead-letter jobs create audit entries; drain route logs structured summaries per hop.
- Every job row keeps `company_id`/`module_id` → per-node activity animation on the canvas is a
  direct projection of queue state (hybrid aesthetic hook).
