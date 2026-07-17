# Canvas Node Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace expanding canvas modules with fixed interactive dashboard cards that expose per-field validation, legal labeled link-kind ports, and connection-derived names that users can customize and restore.

**Architecture:** Put deterministic port and naming behavior in `@hftr/contracts`, persist generated-name state on `modules`, and make link APIs regenerate non-custom names transactionally with link writes. The web node consumes these projections, keeps required setup fields always visible, and opens the existing inspector without changing node geometry.

**Tech Stack:** TypeScript, Zod, Drizzle/Postgres, Next.js App Router, React, React Flow (`@xyflow/react`), Vitest, Playwright, IronBee browser verification.

## Global Constraints

- Never edit `DevSpecs/`, `agent-docs/research/v1-reference/`, or `/Users/matt-mobile/MATT/web_dev/hftr/`.
- Render only link kinds legal for a module type according to `LINK_RULES`; the server remains authoritative.
- Numeric and temporal setup writes continue through append-only ValueRefs; do not place raw values in model paths.
- Node dimensions do not expand on selection; inline controls remain editable and use `nodrag nowheel`.
- Validation text and port meaning are text-first; color only reinforces.
- Math remains non-deletable and keeps the stable generated name `Deterministic Math Calculator`.
- `nodeTypes` stays at module scope and custom node rendering remains memoizable.

---

### Task 1: Contract helpers and tests

**Files:**
- Modify: `packages/contracts/src/modules.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Produces: `moduleLinkPorts(type: ModuleType): { inbound: readonly LinkKind[]; outbound: readonly LinkKind[] }`
- Produces: `handleIdForLink(kind: LinkKind, direction: 'in' | 'out'): string`
- Produces: `linkKindForHandlePair(sourceHandle?: string | null, targetHandle?: string | null): LinkKind | null`
- Produces: `deriveGeneratedModuleName(input: { type: ModuleType; baseName: string; inboundNames: readonly string[]; outboundNames: readonly string[] }): string`
- Extends: `CreateModuleInput` with optional `generatedNameBase`; `UpdateModuleInput` with optional `restoreGeneratedName`.

- [ ] **Step 1: Write failing contract tests**

Test that trading ports include inbound `data_feed`, `directive`, and `fund_route`, outbound `directive`, `verification`, `fund_route`, and `data_feed` where `LINK_RULES` permits. Test exact matching pairs such as `directive-out → directive-in`, reject mixed kinds, retain legacy-pair compatibility, derive a stable capped name, and keep Math’s name stable.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @hftr/contracts test`
Expected: FAIL because the new helpers and payload fields do not exist.

- [ ] **Step 3: Implement helpers**

Use a fixed `LinkKind` display/order array:

```ts
export const LINK_KIND_ORDER: readonly LinkKind[] = [
  'data_feed',
  'directive',
  'verification',
  'fund_route',
];
```

Build inbound/outbound unions from `LINK_RULES`, parse new `{kind}-{in|out}` handles, and preserve the four legacy pairs during migration. Name derivation uses base names of neighbors (never their generated full names), deduplicates/sorts, emits compact `←` / `→` context, caps at 80 characters, and returns the stable Math base unchanged.

- [ ] **Step 4: Run contract tests**

Run: `pnpm --filter @hftr/contracts test`
Expected: PASS.

### Task 2: Persist name provenance and regenerate names in APIs

**Files:**
- Modify: `packages/db/src/schema/companies.ts`
- Create: `packages/db/migrations/0010_canvas_node_generated_names.sql` (or Drizzle-generated equivalent)
- Modify: `apps/web/app/api/companies/[companyId]/modules/route.ts`
- Modify: `apps/web/app/api/companies/[companyId]/modules/[moduleId]/route.ts`
- Modify: `apps/web/app/api/companies/[companyId]/links/route.ts`
- Modify: `apps/web/app/api/companies/[companyId]/links/[linkId]/route.ts`
- Create: `apps/web/lib/module-generated-name.ts`
- Test: API/contract tests where existing harness permits.

**Interfaces:**
- Adds DB columns: `generated_name_base text not null`, `name_customized boolean not null default false`.
- Produces: `refreshGeneratedModuleNames(db, companyId, moduleIds): Promise<ModuleNameUpdate[]>`.
- PATCH rename sets `nameCustomized=true`; `{ restoreGeneratedName: true }` recomputes current generated name and sets false.

- [ ] **Step 1: Add schema and migration**

Backfill existing records with `generated_name_base = name`; default existing and new rows to generated (`name_customized = false`). New module creation stores `input.generatedNameBase ?? input.name`.

- [ ] **Step 2: Add deterministic refresh helper**

Load company modules and links, use neighbors’ `generatedNameBase`, call the contract derivation helper, and update only rows where `nameCustomized=false`. The helper has no model/provider dependency.

- [ ] **Step 3: Wire module PATCH**

Normal `name` PATCH marks customized. Restore ignores arbitrary name input, computes from current graph, updates name + flag, and returns the updated row.

- [ ] **Step 4: Wire link create/delete**

After the link write, refresh both endpoint names. Return `{ link, renamedModules }` from POST and `{ deleted: true, renamedModules }` from DELETE so the canvas updates without reload.

- [ ] **Step 5: Verify types and migration**

Run: `pnpm --filter @hftr/db typecheck && pnpm --filter web typecheck`
Expected: PASS.

### Task 3: Labeled port registry and fixed dashboard node

**Files:**
- Modify: `apps/web/components/canvas/types.ts`
- Modify: `apps/web/components/canvas/ModuleSetupFields.tsx`
- Modify: `apps/web/components/canvas/ModuleNode.tsx`
- Modify: `apps/web/components/canvas/CompanyCanvas.tsx`
- Modify: `apps/web/components/canvas/InspectorPanel.tsx`
- Modify: `apps/web/app/companies/[companyId]/page.tsx`

**Interfaces:**
- `CanvasModule` gains `generatedNameBase` and `nameCustomized`.
- `ModuleNodeData` receives the same naming fields.
- `ModuleSetupFields` renders one field row with its own status chip and highlight.
- Inspector update patches include `nameCustomized`.

- [ ] **Step 1: Replace generic handle spec**

Map `LinkKind` to label/color. Render inbound target handles on the left and outbound source handles on the right using `moduleLinkPorts`. Labels are always visible; unsupported kinds do not render.

- [ ] **Step 2: Convert node to fixed dashboard body**

Remove selected-only expansion. Always render required setup controls at a fixed width. Keep save behavior inside the card, prevent drag/wheel capture, and keep status visible. Selection changes border only.

- [ ] **Step 3: Align validation with each control**

Move each Required/Set chip into the corresponding label row. Apply warn/ok border to that input/select row; remove the detached chip strip and global setup-complete pill.

- [ ] **Step 4: Update canvas connection and name state**

Rehydrate edges with `{linkKind}-out` / `{linkKind}-in`. Decode matching handles. Apply `renamedModules` returned by link POST/DELETE. Always render the inspector for the selected node, including incomplete modules.

- [ ] **Step 5: Add customize/restore inspector UX**

Show “Custom name” after rename. Add `Restore generated name`, call PATCH `{ restoreGeneratedName: true }`, and apply returned `name`, `generatedNameBase`, and `nameCustomized`.

- [ ] **Step 6: Run lint/typecheck**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

### Task 4: E2E, docs, and runtime verification

**Files:**
- Modify: `apps/web/e2e/company-workspace.spec.ts`
- Modify: `agent-docs/ui-ux/canvas-node-dashboard-design.md`
- Modify: `agent-docs/ui-ux/ui-spec.md`
- Modify: `agent-docs/dev-intent/decisions-log.md`
- Modify: `agent-docs/plans/master-build-plan.md` or active M1 sprint status if implementation status changes.

**Interfaces:**
- E2E identifies fields by accessible labels and ports by visible labels.

- [ ] **Step 1: Update E2E expectations**

Assert unselected trading node already contains all required fields, each Required chip is co-located in its label, clicking chrome opens inspector, the card does not change bounding box, legal labeled ports are visible, setup save changes each chip to Set, and restore-generated-name is available after customization.

- [ ] **Step 2: Run focused and full verification**

Run:

```bash
pnpm --filter @hftr/contracts test
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter web exec playwright test e2e/company-workspace.spec.ts
```

Expected: all PASS.

- [ ] **Step 3: Verify running UI with IronBee**

Navigate to a company, inspect ARIA first, interact with a node field, open inspector, exercise customize/restore and a legal connection if practical, capture screenshot/ARIA evidence, then check console messages. Expected: fixed dashboard geometry, inline field validation, labeled ports, correct inspector, no new console errors.

- [ ] **Step 4: Curate docs**

Mark D-026 implemented/verified only after evidence exists. Record exact commands and browser observations; keep any unverified aspect explicit.

- [ ] **Step 5: Commit verified logical chunks**

Invoke `.cursor/skills/commit-message/SKILL.md`, inventory all dirty files including pre-existing user changes, stage only this feature’s chunks, and use the repository’s structured per-file commit body.

## Self-review

- Spec coverage: labeled legal ports, fixed editable card, inline validation, inspector, generated/custom/restore naming, docs, tests, and browser verification each map to a task.
- Placeholder scan: no TBD/TODO/“implement later” instructions remain.
- Type consistency: persistence fields are consistently `generatedNameBase` / `nameCustomized`; API restore input is `restoreGeneratedName`; port ids are `{LinkKind}-{in|out}`.
