# v1 reference snapshot (vendored 2026-07-16)

Read-only snapshot of every v1 artifact v2 still consults, copied into this repository so
**v2 has no dependency on the v1 workspace** (`/Users/matt-mobile/MATT/web_dev/hftr/`).
The v1 originals remain untouched historical sources; this snapshot is what agents and
humans should read from now on. Do not import from `code/` at runtime — it is reference
material for porting, excluded from all builds (this directory lives under `agent-docs/`,
outside every package's `tsconfig` include).

| Path | Contents |
|---|---|
| `tier-lever-and-bounded-range-reference.md` | numeric band values (min/typical/max) with literature citations |
| `academic-quant-tool-catalog.md` | deterministic tool ↔ academic literature map |
| `compliance-and-policy-operating-baseline.md` | compliance baseline (entitlements, session legality, retention) |
| `1-general.audit.md` | v1 DevSpecs general audit — contract inventory source |
| `wiki/` | five load-bearing concept pages: deterministic dispatch, execution-agent compile, guardrails, activation validation, tier-lever model |
| `code/contracts/` | v1 `packages/contracts/src` — HandoffEnvelope, trees, levers, verification shapes |
| `code/pipeline-nodes/` | v1 pipeline node implementations — bands, levers, regime, session legality, dispatch/verify logic |

Seed-data catalogs (strategy/guardrail/broker/session/etc. JSON) are vendored separately at
`packages/db/src/seed/catalogs/` because they are consumed by seed scripts, not just read by
humans. Porting rules and the v1→v2 concept mapping live in
[../v1-carryover.md](../v1-carryover.md).
