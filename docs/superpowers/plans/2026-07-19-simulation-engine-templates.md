# Simulation ENGINE templates implementation plan (D-189)

> **For agentic workers:** implement task-by-task; commit after each green slice.

**Goal:** Ship sim ENGINE templates + create/palette wiring so execution adds default 2 child sims (pre gate + post train), adhoc sims stand alone, and add-to-existing-exec requires parent + placement.

**Spec:** `docs/superpowers/specs/2026-07-19-simulation-engine-templates-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `packages/contracts/src/paper-engine.ts` | `SimulationPlacement`, `SimulationEngineRole`, binding helpers |
| `packages/contracts/src/engines.ts` | `simulationBinding` on setup snapshot; InsertEngineInput parent/placement |
| `packages/contracts/src/templates.ts` | category `simulation`; 3 templates; section; sim deps + expand |
| `packages/contracts/src/contracts.test.ts` | Template + expand tests |
| `apps/web/components/CreateCompanyForm.tsx` | Simulation catalog; default 2 sims; count control |
| `apps/web/components/canvas/Palette.tsx` | Simulation store section; parent+placement for linked |
| `apps/web/app/api/companies/.../engines/route.ts` | Persist simulationBinding on insert |
| agent-docs + this plan | D-189 curation |

## Tasks

### Task 1: Contracts — binding types + setup snapshot

Add to `paper-engine.ts` / `engines.ts` as specified in design.

### Task 2: Contracts — templates + expand helpers

Add three ENGINE_TEMPLATES; `engineCreateSection` → `simulation`; `EXECUTION_ENGINE_SIM_DEPENDENCIES`; `expandEngineSeedsWithSimDeps`; `DEFAULT_EXECUTION_SIM_COUNT = 2`.

### Task 3: CreateCompanyForm + Palette

Wire UI; default expand sims on exec add; allow count 0..N.

### Task 4: Engines API persist binding

Stamp `setupSnapshot.simulationBinding` from insert body.

### Task 5: Docs + verify

decisions-log, canvas-engine-group-design, product-spec, data-model, engine-node-family.

## Verification

- `pnpm --filter @hftr/contracts test`
- Typecheck web for touched files
- Manual: create company with 1 exec → see 2 sim seeds (when UI ready)
