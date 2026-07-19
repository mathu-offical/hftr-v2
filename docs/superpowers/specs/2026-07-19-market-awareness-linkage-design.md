# Market awareness linkage hybrid (D-175)

**Status:** implementation  
**Date:** 2026-07-19  
**Decision:** D-175  
**Surfaces:** Market Posture window (primary) · Model canvas (secondary)

## Intent

Ship a **unique linkage-first hybrid** for baseline market awareness and top movers:

1. Search **news + live data + symbols**
2. **Pre-link** news, trends, and library concepts/tags to symbols, watchlist items, and recommendations
3. Use those links as **scoring metrics** in compound rank (alongside RS / volume / corroboration)
4. Emit **multi-level analysis** into the Market Posture expanded view (Evidence → Links → Trends → Recommendations)

Model remains process/hydration chrome; Posture is the operator-facing multi-level readout.

## Non-goals

- Full exchange tape / advance-decline market-wide universe (still capped movers universe)
- Embeddings / pgvector (D-069 deferred)
- LLM-emitted prices, scores, or timestamps (D-008 / D-009)

## Link contract

`MarketAwarenessLink` (model-free):

| Field | Meaning |
|-------|---------|
| `fromKind` | `news` \| `library_concept` \| `trend` \| `macro` |
| `fromId` | digest / concept id / trend id |
| `fromLabel` | qualitative title (leak-linted) |
| `toKind` | `symbol` \| `watchlist` \| `recommendation` |
| `toId` | symbol or watchlist/suggestion id |
| `strengthBand` | `low` \| `medium` \| `high` |
| `asOfIso` | seal / scan time |

Built during `library.system_movers` from evidence packages, library corpus titles, and active trend candidates. Persisted on `VerifiedNormalizedBundle.awarenessLinks`.

## Scoring

Per symbol, compound score gains:

- `newsLinkBand` — strongest news→symbol link
- `libraryLinkBand` — strongest library→symbol link
- `trendLinkBand` — trend→symbol presence
- `linkCoverageBand` — how many link kinds fire (absent/single/dual/multi → low/medium/high)

Lexicographic rank prefers corroboration, then **link coverage**, then leadership, library/news fit, volume.

Jaccard text fit remains a fallback lane when explicit links are sparse.

## Posture UI levels (primary)

| Level | Content |
|-------|---------|
| Evidence | News/live packages that produced links |
| Links | Edge list: article/concept/trend ↔ symbol |
| Trends | Trend candidates grounded by links |
| Recommendations | suggested_search → verified → watching with placement bands |

All share `asOfIso` from the movers seal. Charts can slice link kinds / recommendation tiers.

## Model (secondary)

Hydration exposes link counts on compound_rank / gather stages; no duplicate multi-level tables
in the Model (Posture owns the four-level tables).

**D-179:** Model uses wider spacing and dashed **`emit`** edges from mid-pipeline stages /
process-function nodes into panel boards (including awareness_* surfaces projected from
`awarenessAnalysis`).

## Verification

- Unit: link builder + compound rank with link bands
- Analyze → hub GET returns `awarenessAnalysis`
- Posture overlay shows four levels with testids
- IronBee when available

## Files (implementation)

- `packages/contracts/src/market-awareness-links.ts`
- `packages/contracts/src/watchlist-suggestions.ts` / `verified-normalize.ts` / `market-hub.ts`
- `packages/engine/src/libraries/movers-awareness-links.ts`
- `packages/engine/src/libraries/movers-compound.ts`
- `packages/engine/src/handlers/library-system-movers.ts`
- `apps/web` hub route + `MarketPostureOverlay`
- `agent-docs` D-175 + ui-spec §4
