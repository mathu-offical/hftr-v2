# Company Equity and Multi-Source Services Design

## Goal

Make company equity a first-class persisted company value and make all verified user-owned
market/API connections automatically available to modules and engines according to declared
service requirements.

## Equity contract

Each company owns a materialized equity projection:

- `equity_cents`: hard cash plus the current market value of every confirmed open position.
- `equity_as_of`: the deterministic clock time of the last successful calculation.
- `equity_status`: `fresh`, `stale`, or `unavailable`.
- `equity_version`: monotonically increasing version preventing an older calculation from
  overwriting a newer one.

The public company projection exposes the cents value as a decimal string. Internal provenance
and freshness remain available to operational surfaces. A failed calculation preserves the last
successful number and changes status; it never writes a guessed value.

## Authoritative calculation

`recomputeCompanyEquity(db, clock, companyId, trigger)` is the only function that materializes
company equity. It is deterministic and model-free.

```text
equity = hard cash + sum(confirmed open quantity * current position mark)
```

Only filled or broker-reconciled positions count. Pending orders, proposals, simulations, and
unconfirmed fills do not. Paper hard cash is the company seed plus ledger deltas. Broker-backed
hard cash comes from a fresh verified broker snapshot.

Position-mark precedence:

1. Broker-reported market value for a position owned by that broker connection.
2. A fresh quote from the position's venue.
3. The deterministic median of all fresh compatible quote sources for paper positions.
4. If any nonzero confirmed position has no valid fresh mark, status is `unavailable`.

Source financial values enter the append-only `numeric_values` store. Equity is a derived
`usd_cents` ValueRef with parent refs for cash and marks; `companies.equity_ref` points to the
latest successful result while `equity_cents` is the materialized read projection.

## Refresh behavior

Recompute after confirmed fills/reconciliation, ledger changes, position changes, connection
verification/revocation, and fresh quote events. Streaming quote events are preferred. If a
stream is unavailable, an active-market watcher refreshes every 15 seconds. The directory never
performs broker network calls.

The clock and market calendar determine freshness. Stale data keeps the last successful number
with `equity_status=stale`; missing required marks set `unavailable`.

## User-owned multi-source services

Credentials and connections are user-owned and managed from root User Settings. They are never
copied into companies, modules, or engines.

Modules and engine templates declare required and optional `ServiceCapability` values. A
deterministic resolver folds in every verified user connection whose capabilities match a
module or engine requirement. Many matching sources are allowed. Required gaps block only the
affected execution path; optional gaps reduce coverage and remain visible.

The resolver normalizes both broker/market connections and configured provider API keys into
service sources without copying credentials. Resolved bindings are persisted in
`module_service_bindings` with module, source kind (`broker_connection|user_api_key`), source id,
capability, status, and verification timestamp. Engine status is the aggregate of its member
requirements. Source verification, revocation/removal, module creation, and engine insertion
trigger re-resolution for affected companies.

Live dispatch remains fail-closed unless every required execution capability is satisfied.
Market-data sources may be combined for research and valuation, but an order is submitted only
through an adapter explicitly compatible with the instruction venue.

## UI behavior

Company cards show:

- `Seed $10,000.00`
- `Current value $10,245.30`
- `Stale` or `Unavailable` text when applicable

Money uses tabular numerals. Color reinforces status but never replaces text.

Root User Settings lists all market/API connections, capabilities, verification state, and
affected module coverage. Company canvas modules and engine chrome show missing required service
warnings and optional coverage warnings.

## Error and concurrency behavior

- Equity updates compare `equity_version`; stale writers cannot overwrite newer projections.
- A malformed, negative, or stale source ValueRef fails closed.
- Duplicate quote sources for the same venue/account are deduplicated before median selection.
- Revoked or failed connections are excluded immediately.
- Connection and equity recomputation failures are observable but never invoke a model.

## Verification

- Contract tests: capability declarations, requirement aggregation, equity response schemas.
- Engine tests: cash-only equity, multiple positions, median marks, broker precedence,
  missing/stale marks, and version conflict.
- Integration tests: fill, ledger, quote, and connection changes trigger recomputation.
- API/UI tests: root connection coverage, module warnings, and card seed/current value.
- IronBee: root settings, company cards, warnings, and console-error check.
