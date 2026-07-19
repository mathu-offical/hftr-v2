# Vendored seed catalogs

Snapshot of the v1 research catalogs, copied into this repository on 2026-07-16 so that
**v2 has zero build-time or run-time dependency on the v1 workspace**. These files are the
canonical seed sources for v2 from now on; the v1 originals are historical reference only.

| File                                      | Seeds                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `seeded-strategy-catalog.json`            | strategy families (Tier A/B/C), compound patterns, prediction-market families, deterministic tool catalog, literature registry |
| `guardrail-recovery-package-catalog.json` | guardrail packages grd-001…008, recovery ladders rec-001…006, block reason families                                            |
| `broker-policy-envelope-catalog.json`     | per-venue policy envelopes incl. throttle presets (e.g. `paper_balanced_general_v1`, `paper_hft_swarm_v1`) |
| `session-constraint-catalog.json`         | session legality constraints per venue/asset class                                                                             |
| `compliance-policy-package-catalog.json`  | compliance policy packages (entitlement truthfulness, retention, language rules)                                               |
| `sector-behavior-seed-catalog.json`       | sector behavior seeds for research modules                                                                                     |
| `company-event-archetype-catalog.json`    | company event archetypes (earnings, guidance, etc.)                                                                            |
| `macro-geopolitical-trigger-catalog.json` | macro/geopolitical trigger taxonomy                                                                                            |
| `trend-lead-pattern-library.json`         | trend→lead pattern library                                                                                                     |

Rules:

- Edit these copies going forward (with `catalog_version` bumps); do not re-sync from v1.
- `seed-catalogs.ts` (M2) parses these files, validates against `@hftr/contracts`, and
  upserts by catalog key with `catalog_version` + `literature_refs` columns.
- Numeric band values referenced by these catalogs live in
  `agent-docs/research/v1-reference/tier-lever-and-bounded-range-reference.md` (also vendored).
