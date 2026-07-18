# Engine chip zone layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Snap ENGINE members into process zones (research→data→trend→exec→verify) with funds shelf and clock bus below.

**Architecture:** Add `ENGINE_CHIP_ZONE` + process column map in contracts; `rankEngineMembers` ranks process members only; `layoutEngineGroup` places funds shelf then Time bus.

**Tech stack:** `@hftr/contracts` (`modules.ts`, `canvas-layout.ts`, tests), agent-docs UI layout notes.

---

### Task 1: Zone map + layout

**Files:**
- Modify: `packages/contracts/src/modules.ts` — `ENGINE_CHIP_ZONE`, update `MODULE_COLUMN` / `MODULE_LANE_ROW`
- Modify: `packages/contracts/src/canvas-layout.ts` — exclude funds from rank; funds shelf; Time under funds
- Modify: `packages/contracts/src/contracts.test.ts` — zone / funds / clock tests
- Modify: `agent-docs/ui-ux/canvas-layout-and-dedicated-math-design.md` — document zones
- Modify: `docs/superpowers/specs/2026-07-18-engine-chip-zone-layout-design.md` (already written)

**Steps:** Implement zone constants → failing tests → layout → docs → typecheck/vitest.
