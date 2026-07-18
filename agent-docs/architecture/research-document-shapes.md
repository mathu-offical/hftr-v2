# Research document shapes (system curated)

Living spec for rigid markdown shapes on system-curated library concepts.
Philosophy intent: `DevSpecs/research-library-philosophy.spec.md` (read-only). Decision: **D-069**.

## SystemDocKind

| Kind | Topic scope | Required H1 / sections |
|------|-------------|------------------------|
| `movers_lens` | `system:movers` | H1 title; prose lens (no tables of prices) |
| `movers_report` | `system:movers` | H1; `## Scan window`; `## Leadership notes`; `## Related lenses` with wikilinks |
| `execution_log` | `system:execution_logs` | H1; `## Session`; `## Actions`; `## Outcomes` |
| `daily_summary` | `system:daily_summaries` | H1; phase sections `## Pre-open` / `## Midday` / `## Close` / `## Post-analysis` |
| `runtime_policy` | `system:runtime_policies` | H1; `## Scope`; `## Constraints`; `## Escalation` |
| `trend_list` | `system:trend_lists` | H1; `## Active trends`; `## Watch`; `## Deferred` |
| `sector_bulletin` | `system:sector_news` | H1; `## Sector focus`; `## Headlines`; `## Cross-links` |

## Fail-closed gates (`validateDocumentShape`)

1. **Required sections** — headings present (case-insensitive match on `##` titles).
2. **Wikilink density** — reports/bulletins require ≥1 `[[wikilink]]` or `[[title]]` form when kind is report/bulletin/summary.
3. **Tag membership** — `system_curated` plus kind tag (`movers`, `sector_news`, …).
4. **Leak lint** — no digit runs, `$`, `%` in body (D-008); use ValueRefs / private metricRefs off-body.
5. **sourceRef** — `system:…`, `evidence:…`, or `seal:…` prefix.

On failure emit `repairHints: string[]` (bands + qualitative instructions only — never raw ratios).

## Librarian score (`scoreDocumentCuration`)

Qualitative bands only (`low` | `medium` | `high`):

- `structureBand` — section completeness
- `linkBand` — wikilink / concept_link connectivity
- `freshnessBand` — age vs kind TTL
- `overallBand` — min of components (fail-closed: any `low` → overall `low` when required)

Raw ratios stay in append-only curation prior telemetry (**D-071**); models see bands + repairHints only.
