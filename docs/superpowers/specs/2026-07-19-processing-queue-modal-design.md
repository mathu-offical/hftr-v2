# Processing queue modal (company-scoped) — D-193

## Intent

Operators need a single board of this company’s background jobs, separated by
`queueClass` lane, without leaving the company canvas. The top-ribbon chip becomes
the entry point.

## Decisions

| Choice | Value |
|--------|--------|
| Entry | Top-bar button labeled **Processing queue** |
| Scope | Current `companyId` only |
| Columns | Every `QueueClass` enum value (empty → Idle) |
| Rows | `pending` + `active` + `dead` only |
| Bottom panel | Lineage Queue / Dead letters unchanged |
| Stats source | Company `jobs/pending` + `jobs/dead` (not global `/api/queue/stats`) |

## UI

- Button shows text-first depth: idle, or pending/active counts; dead count in block tone.
- Modal: portal to `document.body`, `z-[100]`, Escape + backdrop close.
- Horizontally scrollable columns; each card: kind, status, attempts, truncated
  `lastError` (dead), relative/updated time.
- Poll while modal open (~15s); chip polls the same company endpoints when closed.

## APIs (existing)

- `GET /api/companies/[companyId]/jobs/pending`
- `GET /api/companies/[companyId]/jobs/dead`

## Out of scope

Process-wide listing, drain HUD, completed/failed history, in-modal retry (use Dead tab).
