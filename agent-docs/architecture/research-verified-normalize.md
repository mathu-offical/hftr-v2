# Verified normalize (multi-source seal)

When live API / news evidence is corroborated across independent sources, run one deterministic
verify+normalize pass and seal a **system-normalized view**. Downstream consumers skip full
re-verification until TTL invalidation. Still persist **readable curated reports**.

Decision: **D-072**.

## Contracts

### `SystemNormalizedView`

Qualitative schema per kind (`movers_board`, `sector_bulletin`, `daily_summary_phase`, …):
symbols/sectors as strings, strength/direction bands, headline clusters, source digest list.
No raw prices/% on the view surface; ValueRefs live in private `metricRefs` if needed.

### `VerifiedNormalizedBundle`

- `view`, `corroborationBand` (`low|medium|high`)
- `sourceDigests[]`, `verifiedAt`, `expiresAt`, `sealId` (content hash)
- `gatesSnapshot` (band-only)
- `reportConceptId` optional link to readable article

Corroboration: ≥2 independent domains → medium; ≥3 + primary-tier → high; single source → low + short TTL.

## Engine API

- `corroborateAndNormalize(evidence[], kind) → VerifiedNormalizedBundle | null`
- `isSealValid(bundle, now)` — TTL + digest set; if invalid → re-gather/re-verify

## Dual persist

| Surface | Purpose |
|---------|---------|
| Normalized view record | UI chips, galaxy filters, job inputs |
| Readable report concept | Operator/LLM article in system library shelves |

Reports use `sourceRef: seal:{sealId}` and shaped markdown (`research-document-shapes.md`).

## Consumer contract

1. Load latest unexpired seal for `(companyId, kind, subjectKey)`.
2. If valid → use view + report; **skip** gather validation gates.
3. If expired/missing → enqueue gather+verify-normalize; fall back to last report with text-first `stale`.
