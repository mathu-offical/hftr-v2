# Engine Data Hub Compound Shelves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Engine Data Hub into a compound shelf surface with live topic feed and dual sim terminal analyzers (D-216).

**Architecture:** Keep one hub module/library per execution engine. Virtual shelves (origin × stream) live in hub config; optional per-shelf `data_out` utility streams; topic auto-feed helper; sim templates gain direct + analyzed analyzers.

**Tech Stack:** Zod contracts (`@hftr/contracts`), Drizzle (`@hftr/db`), engine ensure/handlers (`@hftr/engine`), Vitest.

## Global Constraints

- No LLM below Groq compile; numeric shelf = ValueRefs only (D-008).
- Never put secrets in job payloads (D-074).
- Do not edit `DevSpecs/` or external v1 workspace.
- Live trading remains fail-closed.
- No guaranteed-returns language.

---

### Task 1: Contracts — shelf taxonomy + hub / analyzer config

**Files:**
- Create: `packages/contracts/src/engine-data-hub.ts`
- Modify: `packages/contracts/src/modules.ts` (`LibraryModuleConfig`, `AnalyzerModuleConfig`)
- Modify: `packages/contracts/src/index.ts` (export)
- Test: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Produces: `HubShelfOrigin`, `HubShelfStream`, `HubShelfKey`, `HubShelfOutput`, `EngineDataHubShelvesConfig`, `defaultEngineDataHubConfig()`, `hubShelfStreamId()`, `AnalyzerHubFeedClass`

- [ ] **Step 1:** Add zod enums + default matrix (4 origins × 3 streams) + `topicFeed: { enabled: true }`
- [ ] **Step 2:** Extend `LibraryModuleConfig` with optional shelves / shelfOutputs / topicFeed (defaults via helper on ensure)
- [ ] **Step 3:** Extend `AnalyzerModuleConfig` with `hubFeedClass`, `hubShelfOrigin`, `hubShelfStream`
- [ ] **Step 4:** Unit tests for defaults + streamId encoding
- [ ] **Step 5:** `pnpm --filter @hftr/contracts test`

---

### Task 2: Ensure path seeds hub shelves

**Files:**
- Modify: `packages/engine/src/engines/data-hub.ts`
- Test: `packages/engine/src/engines/data-hub.test.ts` (create if missing)

- [ ] **Step 1:** On create/update hub module config, merge `defaultEngineDataHubConfig()`
- [ ] **Step 2:** Idempotent: do not wipe operator-enabled `shelfOutputs`
- [ ] **Step 3:** Tests for seed + merge
- [ ] **Step 4:** `pnpm --filter @hftr/engine test -- data-hub`

---

### Task 3: Topic live-feed helper

**Files:**
- Create: `packages/engine/src/engines/data-hub-topic-feed.ts`
- Modify: `packages/engine/src/index.ts` (export)
- Modify: `packages/engine/src/handlers/analyzer-concat.ts` (call when analyzed)
- Test: `packages/engine/src/engines/data-hub-topic-feed.test.ts`

- [ ] **Step 1:** `ingestHubTopicCandidate({ db, companyId, hubModuleId, title, provenance, feedClass })` — creates/refreshes `research_topics` when topicFeed.enabled
- [ ] **Step 2:** Wire analyzer.concat for `hubFeedClass === 'analyzed'` when target is hub
- [ ] **Step 3:** Unit tests (enabled/disabled, dedupe by title)

---

### Task 4: Dual terminal analyzers on sim templates

**Files:**
- Modify: `packages/contracts/src/templates.ts` (`sim_gate_*`, `sim_train_*`, `sim_adhoc_*`)
- Test: `packages/contracts/src/contracts.test.ts` (assert two analyzers + hubFeedClass)

- [ ] **Step 1:** Add Direct + Analyzed analyzers; fix link indices
- [ ] **Step 2:** Tests that each default sim template has both feed classes
- [ ] **Step 3:** Run contracts tests

---

### Task 5: Agent-docs + base spec cross-link

**Files:**
- Modify: `agent-docs/dev-intent/decisions-log.md` (D-216)
- Modify: `agent-docs/architecture/data-model.md`
- Modify: `agent-docs/ui-ux/canvas-engine-group-design.md`
- Modify: `agent-docs/ui-ux/ui-spec.md`
- Modify: `agent-docs/product/product-spec.md`
- Modify: `docs/superpowers/specs/2026-07-18-engine-data-hub-design.md` (pointer to D-216)
- Modify: `docs/superpowers/specs/2026-07-19-simulation-engine-templates-design.md` (dual analyzers)

- [ ] **Step 1:** Log D-216 + sync owning docs
- [ ] **Step 2:** Mark success criteria in design spec as code lands

---

### Task 6: Verify

- [ ] `pnpm --filter @hftr/contracts test`
- [ ] `pnpm --filter @hftr/engine test -- data-hub`
- [ ] Typecheck affected packages
- [ ] IronBee browser smoke when DevTools available (hub visible on canvas)
