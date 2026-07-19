# hftr-v2 Broker Integration

User directive (2026-07-16): "as many full real connections as possible"; real funding stays at
the broker; easy paper↔live switching per company; easy UI-facing fund-adding once connected.

## 1. Adapter contract (`packages/adapters`)

Carried from v1's `IBrokerAdapter` and hardened:

```ts
interface BrokerAdapter {
  venue: 'paper_sim' | 'alpaca' | 'kalshi' | 'polymarket' | 'coinbase';
  mode: 'paper' | 'live';
  capabilities(): AdapterCapabilities;      // assets, order types, sessions, funding support
  verifyConnection(): ConnectionStatus;      // fail-closed on any auth/entitlement failure
  getBalances(): BalanceSnapshot;
  getPositions(): PositionSnapshot[];
  getQuote(ref: InstrumentRef): QuoteSnapshot;
  submitOrder(task: DeterministicActionTask): SubmitResult;  // ONLY deterministic core calls this
  cancelOrder(...); replaceOrder(...);
  getFills(since): FillRecord[];             // verification/reconciliation source
  fundingLink(): FundingUX;                  // deep link / instructions / api-flow descriptor
}
```

Invariants: adapters differ by policy/behavior only — engine semantics identical (v1 rule).
Paper and live are the SAME adapter class with different credentials/base URLs wherever the
venue supports it. Adapter never interprets strategy; it maps `DeterministicActionTask` to venue
payloads with precision-safe rounding tables per instrument.

## 2. Venue rollout

| Phase | Venue | Notes (verified 2026-07) |
|---|---|---|
| M1 | **paper_sim** (internal) | Deterministic fill simulator carried from v1's paper adapter, upgraded: quote-anchored fills, slippage model from band catalog, simulator-gap tags mandatory on traces |
| M2 (D-027) | **Alpaca Trading API (paper)** | Adapter + connect/verify/exclusive company bind shipped. Paper base `https://paper-api.alpaca.markets`; IEX quotes labeled `alpaca_iex_paper`. Capital admission uses `min(virtual allocation, broker buying power)`. Live URLs remain fail-closed (`live_gate_blocked`). |
| M3 | **Kalshi** | Regulated US prediction markets; REST + WS; demo environment for paper-equivalent. Contracts priced 1–99¢ ≈ probability; edge formula carried from v1 (`edge = p_model - p_market - fee_drag - slippage_drag`) |
| M4 | **Polymarket CLOB** | Wallet/allowance-based auth (more friction; needs key custody design). Phase-gated behind Kalshi learnings |
| M4+ | **Coinbase Advanced** | Broader crypto coverage than Alpaca; evaluate need after crypto module usage data |

## 3. Connection & credential UX

- Settings → Brokers: **Alpaca paper** is the most direct path — paste **API Key ID** +
  **Secret Key** from the Alpaca paper dashboard, then one **Save & verify** (encrypt +
  handshake). No OAuth for Alpaca. Other venues may use keys / OAuth / wallet as applicable;
  capability readout and key last-four only after save.
- Credentials encrypted at rest (AES-GCM, app KMS key); never sent to the browser after entry;
  decryption only inside adapter calls (server).
- `broker_connections.status` drives fail-closed behavior: any company in live mode whose
  connection errors flips to `blocked` state visibly on the canvas and halts dispatch admission.

## 4. Paper ↔ live switching (per company)

- Company mode toggle is prominent but guarded: switching to live runs the **live gate
  checklist** (carried from v1): connection verified, entitlements valid, verification pass-rate
  threshold met on paper history, guardrail packages active, user types explicit confirmation.
- Same engine both modes; mode selects adapter credentials + policy envelope (tighter live
  throttle presets from the v1 catalog). All traces tagged with mode; paper traces carry
  simulator-gap/realism tags.

## 5. Funding UX ("easy UI-facing adding of funds")

- **MVP:** company header shows broker cash/buying power (live) or credit-funded seed (paper).
  "Add funds" button → venue-native funding deep link (Alpaca dashboard transfer page, Kalshi
  deposit page) + inline instructions; balance auto-refreshes on return (poll + manual refresh).
- **Paper:** "Add funds" draws from platform credits (Stripe-purchased) into the company seed —
  one-click amounts ($100 / $1k / $10k / custom of simulated capital; credit pricing defined in
  product spec).
- **Future (OQ-3):** Alpaca **Broker API** would enable true in-app ACH funding via Plaid
  processor tokens (`POST /v1/accounts/{id}/ach_relationships` → `/transfers`), but requires a
  correspondent/broker-dealer arrangement with Alpaca. Not an MVP dependency; revisit when the
  platform has users.

## 7. Internal paper engine + dual books (D-122)

Approved design: `docs/superpowers/specs/2026-07-18-internal-paper-trade-engine-design.md`.

- **Per-engine binding:** each trading engine may bind to a real service (Alpaca paper, …)
  or use internal paper functions when unbound.
- **Routing modes:** `funds_only` (default) | `execute_on_service` | `both_verify`.
  Safest default = `funds_only`: provider ledger is an **added funds source**; orders fill on
  the **internal paper core** against the **live market model** (adapter/hydrator quotes when
  entitled). Elevating to `execute_on_service` or `both_verify` is explicit.
- **Capital isolation:** each execution engine spends only its allocated slice; cross-engine
  spend requires explicit share/transfer (fund_router).
- **Main book:** company rollup of engine books.
- **Deltas:** `both_verify` (and sim-vs-live marks) produce `BookDelta` artifacts for
  weighting / valve training (D-125). Phase 1: contracts + `funds_only` dispatch.
  Phase 2: MarketModel multi-candidate fusion + awareness adapters (posture hub /
  current awareness) + position-exits marks via MarketModel.
  Phase 3: `resolveDispatchSpendAuthority` — engine envelope/ledger spend caps;
  `capital_isolation_block` when raiding another engine’s slice.
  Phase 4: `both_verify` keeps internal fill authoritative; shadow `submitOrder` on
  the provider produces append-only `book_deltas` + observation `training_feedback`
  (`mutation_class=book_delta`). Gap tags: `both_verify_linked` /
  `both_verify_no_provider`.
  Phase 5: `computeInternalPaperFill` (InternalPaperCore) shared by dispatch and
  `paper-sim`; module `executionBinding.brokerConnectionId` overrides company bind;
  elevate modes fail closed without a connected service; trading inspector exposes
  routing + connection controls.
  Phase 6 (D-171): unbound `paper_sim` + `funds_only` uses **quote-only** Alpaca paper
  teacher via `resolveDispatchMarketQuote` (company/module/owner creds, same discovery
  as atr_stream / D-137) — live `feedClass` + `live_market_quote` tags without
  `submitOrder`. Compile sizing + position-exit marks share the helper.
  Phase 7 (D-177): fuse company price ValueRefs (`live_api:quote:*` from trend poll,
  alpaca quote marks) into MarketModel candidates; catalog `max_slippage_bps_band`
  + optional square-root participation impact on InternalPaperCore fills; honesty
  tags `square_root_impact_proxy` vs `no_market_impact`; off-hours prior-session
  rebucket (`prior_session_mark`) so weekend paper can use venue last prints.
  Phase 7b (D-187): operator-visible honesty chips (Executions + ticker); feed-class
  ValueRef sourceIds on dispatch marks; multi-share verify asserts impact proxy.
- Company-level `broker_connections` bind remains for credentials; it no longer implies
  automatic venue submit for every paper trade (routing mode decides).

## 8. Reconciliation & verification

- Post-dispatch reconciliation jobs (VERIFY class) pull fills per venue and diff against
  expected `ActionInstruction` outcomes → `verification_records` + `dispatch_reconciliation`
  events (v1 pattern). WebSocket auth/listen/error/reconcile events are compliance evidence and
  are persisted.
- **Capital admission projection:** `GET /api/companies/:id/broker` returns bound connection
  summary, venue, feed entitlement label when known, latest `broker_balances_snapshot` (or live
  adapter hydrate when connected and no snapshot yet), company virtual balance, and
  `effectiveCapCents = min(virtual, broker buying power)` when bound — else virtual only.
  `liveGateBlocked` is always true for live-mode companies until explicit gates pass.
- Every venue adapter ships with a recorded-fixture test suite + a sandbox smoke test runnable
  in CI (paper creds via env).
