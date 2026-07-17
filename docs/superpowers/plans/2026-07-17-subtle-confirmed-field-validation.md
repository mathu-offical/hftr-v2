# Subtle Confirmed-Field Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace prominent green confirmed-field borders and `Set · label` chips with subtle, accessible green checks inside the trailing edge of every shared setup field.

**Architecture:** Keep validation behavior centralized in `ModuleSetupFields.tsx`. Missing fields retain warning styling and explicit labels; confirmed fields use neutral input chrome plus one reusable in-field confirmation indicator. Extend the existing canvas dashboard E2E flow to assert the visual-state contract after setup is saved.

**Tech Stack:** React 19, TypeScript strict, Tailwind utility classes, Next.js App Router, Playwright.

## Global Constraints

- Apply the treatment through `ModuleSetupFields` so company creation, engine setup, and canvas nodes cannot drift.
- Missing state remains warning-colored with `Required · label`.
- Confirmed state uses neutral input borders; no `Set · label` text.
- Confirmation check sits inside the trailing field boundary, is pointer-transparent, and has screen-reader text `Confirmed: {field label}`.
- Capital allocation places the check in the value input, not the mode select.
- Target-exit placement reserves room for the native date/time control.
- Do not modify unrelated working-tree changes.

---

### Task 1: Shared confirmed-field presentation

**Files:**

- Modify: `apps/web/components/canvas/ModuleSetupFields.tsx:50-175`
- Test: `apps/web/e2e/canvas-node-dashboard.spec.ts:39-53`

**Interfaces:**

- Consumes: `missingFields: readonly ModuleSetupField[]`
- Produces: shared `ConfirmedFieldCheck` presentation and neutral confirmed `fieldBorderClass`

- [x] **Step 1: Extend the E2E assertion to describe the desired state**

After filling and saving the trading setup, assert:

```ts
await expect(tradingNode.getByText('Set · Topic / sector', { exact: true })).toHaveCount(0);
await expect(tradingNode.getByLabel('Confirmed: Topic / sector')).toBeVisible();
await expect(tradingNode.getByLabel('Confirmed: Capital allocation')).toBeVisible();
await expect(tradingNode.getByLabel('Confirmed: Target exit')).toBeVisible();
await expect(topicField).toHaveClass(/border-\[var\(--color-line\)\]/);
await expect(allocationField).toHaveClass(/border-\[var\(--color-line\)\]/);
await expect(targetExitField).toHaveClass(/border-\[var\(--color-line\)\]/);
```

- [ ] **Step 2: Run the focused E2E test and confirm it fails**

> Note: Red phase was not recorded — disk-full recovery truncated working files before the failing run could be captured; restored from git and proceeded to implementation.

Run:

```bash
cd /Users/matt-mobile/MATT/web_dev/hftr-v2/apps/web
pnpm exec playwright test e2e/canvas-node-dashboard.spec.ts --reporter=line
```

Expected: FAIL because confirmed fields still render `Set · label`, green borders, and no accessible in-field checks.

- [x] **Step 3: Replace the success chip with a reusable in-field check**

In `ModuleSetupFields.tsx`, keep a missing-only status component and add:

```tsx
function ConfirmedFieldCheck(props: { field: ModuleSetupField; insetForNativeControl?: boolean }) {
  return (
    <span
      role="status"
      aria-label={`Confirmed: ${SETUP_FIELD_LABELS[props.field]}`}
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full border
        border-[var(--color-ok)]/50 bg-[var(--color-ok)]/10 px-1 text-[9px]
        text-[var(--color-ok)] ${props.insetForNativeControl ? 'right-8' : 'right-2'}`}
    >
      ✓
    </span>
  );
}
```

Render `Required · label` only while missing. Wrap each confirmed input in `relative`; apply trailing padding; place the check inside:

```tsx
<div className="relative">
  <input className={`${fieldBorderClass(false, props.compact)} pr-8`} />
  <ConfirmedFieldCheck field="topic_sector" />
</div>
```

For allocation, wrap only the value input. For target exit, use `pr-14` and `insetForNativeControl`.

- [x] **Step 4: Make confirmed field borders neutral**

Change `fieldBorderClass` state selection to:

```ts
const state = missing
  ? 'border-[var(--color-warn)] focus:border-[var(--color-warn)]'
  : 'border-[var(--color-line)] focus:border-[var(--color-accent)]';
```

- [x] **Step 5: Run static checks**

Run:

```bash
cd /Users/matt-mobile/MATT/web_dev/hftr-v2
pnpm --filter @hftr/web exec tsc --noEmit
pnpm --filter @hftr/web lint
```

Expected: both commands pass.

- [x] **Step 6: Run the focused E2E test**

Run:

```bash
cd /Users/matt-mobile/MATT/web_dev/hftr-v2/apps/web
pnpm exec playwright test e2e/canvas-node-dashboard.spec.ts --reporter=line
```

Expected: PASS.

- [x] **Step 7: Verify through IronBee**

Navigate to a day-trading canvas, save setup values, inspect the ARIA snapshot for `Confirmed:` statuses, take a screenshot to confirm checks are inside field boundaries, and check console messages for new errors.

Evidence (2026-07-17): ARIA exposed `Confirmed:` statuses for all three fields; cropped node
screenshot visually confirmed checks inside topic, allocation value, and target-exit fields with
native calendar spacing; incremental console check after sequence 1427 returned no new errors.

- [x] **Step 8: Commit**

Completed as `dd71f0c` (`feat(canvas): subtle confirmed-field validation (D-034)`).

Stage only:

```bash
git add apps/web/components/canvas/ModuleSetupFields.tsx \
  apps/web/e2e/canvas-node-dashboard.spec.ts \
  docs/superpowers/plans/2026-07-17-subtle-confirmed-field-validation.md
```

Commit with the workspace-required structured message and D-034 connection.
