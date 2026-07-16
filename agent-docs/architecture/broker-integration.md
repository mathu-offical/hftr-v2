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
| M2 | **Alpaca Trading API** | Stocks + crypto. Paper env = same API, different base URL + keys → the parity showcase. User supplies their own account API keys. Live requires their funded brokerage account (Alpaca onboarding is on Alpaca's side). Market data: IEX feed free tier; entitlement labeled per compliance baseline |
| M3 | **Kalshi** | Regulated US prediction markets; REST + WS; demo environment for paper-equivalent. Contracts priced 1–99¢ ≈ probability; edge formula carried from v1 (`edge = p_model - p_market - fee_drag - slippage_drag`) |
| M4 | **Polymarket CLOB** | Wallet/allowance-based auth (more friction; needs key custody design). Phase-gated behind Kalshi learnings |
| M4+ | **Coinbase Advanced** | Broader crypto coverage than Alpaca; evaluate need after crypto module usage data |

## 3. Connection & credential UX

- Settings → Integrations: per-venue connect cards (enter keys / OAuth / wallet as applicable),
  live verification handshake with capability readout, key last-four display only.
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

## 6. Reconciliation & verification

- Post-dispatch reconciliation jobs (VERIFY class) pull fills per venue and diff against
  expected `ActionInstruction` outcomes → `verification_records` + `dispatch_reconciliation`
  events (v1 pattern). WebSocket auth/listen/error/reconcile events are compliance evidence and
  are persisted.
- Every venue adapter ships with a recorded-fixture test suite + a sandbox smoke test runnable
  in CI (paper creds via env).
