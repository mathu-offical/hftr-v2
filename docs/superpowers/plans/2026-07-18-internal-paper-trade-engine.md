# Internal Paper Trade Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship D-122 Phase 1 — contracts for engine binding/routing plus `funds_only` default so a company with a provider connection uses live quotes for the market model but fills on the internal paper core (no automatic venue submit).

**Architecture:** Evolve in place. Extend `TradingModuleConfig` with optional `executionBinding`. Dispatch reads routing mode (default `funds_only`). When a broker adapter is available and mode is `funds_only`, call `adapter.getQuote` for MarketModel marks but run `computeFill` / internal book — never `submitOrder`. `execute_on_service` preserves today’s venue path.

**Tech Stack:** Zod contracts (`packages/contracts`), Drizzle/engine dispatch (`packages/engine`), Vitest.

## Global Constraints

- Decision D-122; design: `docs/superpowers/specs/2026-07-18-internal-paper-trade-engine-design.md`
- Only `packages/engine/src/dispatch/` may call `submitOrder`
- Live remains fail-closed; NRA / ValueRefs for financials
- Honest `feedClass` + `simulatorGapTags` — never label synthetic as live
- Default routing mode: `funds_only`
- No secrets in job payloads
- Do not edit `DevSpecs/` or `agent-docs/research/v1-reference/`

---

### Task 1: Paper-engine contracts

**Files:**
- Create: `packages/contracts/src/paper-engine.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/modules.ts` (`TradingModuleConfig`)
- Modify: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Produces: `PaperRoutingMode`, `EngineExecutionBinding`, `BookDeltaDimension`, `BookDelta`, `resolveTradingExecutionBinding(config)`

- [x] **Step 1: Write failing contract tests**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement contracts**
- [x] **Step 4: Run tests to verify they pass**
- [x] **Step 5: Commit** (Phase 1: `f2e1dc5` / `2f06a85` / `9b4b4de`)

---

### Task 2: funds_only dispatch path

**Files:**
- Create: `packages/engine/src/paper/market-model.ts`
- Modify: `packages/engine/src/dispatch/execution-context.ts`
- Modify: `packages/engine/src/dispatch/paper-trade.ts`
- Create or modify: `packages/engine/src/dispatch/paper-trade-funds-only.test.ts` (or extend existing)

**Interfaces:**
- Consumes: `resolveTradingExecutionBinding`, `PaperRoutingMode`
- Produces: `ResolvedExecutionContext.routingMode`; internal fill when `funds_only`

- [x] **Step 1: Write market-model unit tests**
- [x] **Step 2: Implement `resolveMarketQuote`**
- [x] **Step 3: Load module config in `executePaperTrade`; branch on routingMode** (`funds_only` default → internal fill; `execute_on_service`/`both_verify` → venue submit)
- [x] **Step 4: Update gap tags** (`live_market_quote`, `funds_only_routing`, …)
- [x] **Step 6: Commit** (Phase 1 engine: `2f06a85`)

---

### Task 3: Docs curation (Phase 1)

- [x] Design + plan + owning agent-docs committed (`9b4b4de`)

---

### Task 4: Phase 2 — MarketModel fusion + awareness + exits

**Files:**
- Modify: `packages/engine/src/paper/market-model.ts`
- Create: `packages/engine/src/paper/awareness-adapters.ts`
- Modify: `packages/engine/src/paper/market-model.test.ts`
- Modify: `packages/engine/src/dispatch/position-exits.ts`
- Modify: `packages/engine/src/dispatch/paper-trade.ts`
- Modify: `packages/engine/src/index.ts`

- [x] **Step 1: Fuse multi-candidate quotes + `resolveMarketQuoteWithAdapter`**
- [x] **Step 2: Awareness adapters project posture hub + current awareness**
- [x] **Step 3: Wire `scanPositionExitSignals` to MarketModel (adapter live quote when entitled)**
- [x] **Step 4: Tests + typecheck PASS**
- [x] **Step 5: Commit Phase 2** (`26b1f25`)

---

### Task 5: Phase 3 — engine capital isolation

- [x] `capital_isolation_block` failure code
- [x] `computeEngineSpendCapCents` + `resolveDispatchSpendAuthority`
- [x] Wire buy admission + gauntlet `effectiveCapCents` in `paper-trade.ts`
- [x] Contract + balances unit tests
- [x] Commit Phase 3 (`6db8b1f` / `1b1d103` / `e92d5eb`)

---

### Task 6: Phase 4 — both_verify + BookDelta persistence

- [x] `usesProviderAsPrimaryBook` / `shouldShadowVerifyOnProvider` routing split
- [x] `book_deltas` table + persist + training_feedback `book_delta` observation
- [x] Internal fill authoritative; provider shadow submit for linked deltas
- [x] Commit Phase 4 (`0877505` / `f1365d6` / `7f42b68`)

---

### Later phases

- Phase 5: unify InternalPaperCore with `paper-sim` adapter + UI controls
