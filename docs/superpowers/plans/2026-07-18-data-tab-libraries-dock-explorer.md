# DATA tab · Libraries dock · Data Explorer Implementation Plan

> **For agentic workers:** Execute task-by-task. Spec: `docs/superpowers/specs/2026-07-18-data-tab-libraries-dock-explorer-design.md` (D-120).

**Goal:** Shared Libraries dock on all left tabs; DATA shows LIVE DATA SOURCES; Data Explorer browse (md/JSON); `live_api` nodes identified by hydrator `sourceKind`.

**Architecture:** Lift Libraries dock out of Research-only layout into `LeftPanel` chrome. Add `DataViewContext` + `DataExplorerOverlay` (mutual exclusion with Galaxy / Market posture). Extend `LiveApiModuleConfig` with `sourceKind`. Readiness from research source registry + existing credential readiness projection.

**Tech Stack:** Next.js App Router, React contexts, Zod contracts, existing library/concept APIs.

## Global Constraints

- Secrets: keyHint / need-key only; never plaintext in Explorer or GET APIs
- Galaxy stays Research-owned (trace); Explorer is content browse
- No freeform query language in this slice
- Document progress in agent-docs + D-120

---

### Task 1: Shared Libraries dock + Company section
- Restructure `LeftPanel.tsx`: dock outside tab scroll; visible when panel open on any tab
- Add Company shelf for `library` canvas modules / company libraries
- Keep create/export/curation in dock

### Task 2: DataViewContext + DataExplorerOverlay
- Provider in `CompanyResearchShell`
- Overlay mount next to Research/Market overlays
- Mutual exclusion wiring in LeftPanel tab effects
- Browse library concepts (md/JSON) + live hydrator readiness view

### Task 3: LIVE DATA SOURCES list
- DATA tab lists registry hydrators with readiness
- Select → Explorer; Place on canvas when entitled

### Task 4: `sourceKind` on live_api
- Contracts + labels + LiveApiConfigForm + palette defaults
- Incomplete chip when missing

### Task 5: Docs + verify
- D-120, ui-spec, shelves design, product-spec brief
- typecheck/lint/tests + IronBee
