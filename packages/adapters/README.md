# @hftr/adapters

Broker adapters behind the single `BrokerAdapter` interface from `@hftr/contracts`
(`agent-docs/architecture/broker-integration.md`). Adapters vary by **policy and behavior**,
never by engine logic — paper and live share one engine.

| Adapter      | Status      | Notes                                                                                     |
| ------------ | ----------- | ----------------------------------------------------------------------------------------- |
| `paper-sim`  | implemented | deterministic in-memory fills (seeded slippage model); used by M1-M3 paper loop and tests |
| `alpaca`     | M2          | US equities paper+live; deep-link funding UX                                              |
| `kalshi`     | M5          | event contracts                                                                           |
| `polymarket` | M5          | event contracts                                                                           |
| `coinbase`   | future      | crypto                                                                                    |

Rules:

- Only `@hftr/engine/dispatch` may call `submitOrder` (enforced by review + import tests).
- Every quote is labeled with its `feedClass` — entitlement truthfulness carries over from v1.
- Credentials are decrypted at the edge of apps/web and passed in; adapters never read env
  keys directly (CI smoke keys are wired by tests only).
