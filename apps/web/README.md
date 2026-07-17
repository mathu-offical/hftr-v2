# @hftr/web

Next.js 15 (App Router) application: UI shell, canvas (M1), panels, and all API routes.

## Route hardening contract

Every API route follows the same pattern (`lib/api.ts`):

1. **Auth:** `withAuth()` — Clerk session required; 401 otherwise. The middleware is
   default-deny; only `/`, sign-in/up, `/api/health`, and `/api/queue/drain` are public
   (drain enforces `CRON_SECRET` itself).
2. **Input:** `parseBody(req, Schema)` — Zod-validated against `@hftr/contracts`; 400 with
   field-level issues on failure. Route params validated the same way.
3. **Ownership:** all data access goes through `@hftr/db` scoping helpers; a non-owned or
   missing entity is a uniform 404 (`not_found`) — no existence leaks.
4. **Domain limits:** explicit 422 codes (`company_limit_reached`, `link_kind_not_allowed`,
   `math_module_not_deletable`, …).
5. **Errors:** unexpected failures log server-side and return an opaque 500.

## API surface (current)

| Route                             | Methods            | Notes                                          |
| --------------------------------- | ------------------ | ---------------------------------------------- |
| `/api/health`                     | GET                | public liveness + db probe                     |
| `/api/queue/drain`                | GET                | Vercel cron (per-minute), `CRON_SECRET` bearer |
| `/api/queue/stats`                | GET                | queue depth projection                         |
| `/api/companies`                  | GET, POST          | create auto-provisions the Math module (D-008) |
| `/api/companies/:id`              | GET, PATCH, DELETE | DELETE = archive (soft)                        |
| `/api/companies/:id/modules`      | GET, POST          | per-type config validated via schema registry  |
| `/api/companies/:id/modules/:mid` | GET, PATCH, DELETE | math module non-deletable                      |
| `/api/companies/:id/links`        | GET, POST          | edges validated against `LINK_RULES`           |

## UI

Design tokens in `app/globals.css` (dark, one accent, text-first status chips — ui-spec §1).
Pages: `/` landing, `/companies` directory. The canvas, panel shell, and assistant surface
land with M1 (`agent-docs/plans/m1-sprint-spec.md`).
