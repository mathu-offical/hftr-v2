# Research relevance graph (“basic vector”)

Living spec for company knowledge connectivity without pgvector. Decision: **D-069**.
pgvector / embedding store remains deferred (**REQ-RES-005**).

## Graph surfaces

| Edge | Storage | Weight meaning |
|------|---------|----------------|
| Concept ↔ concept | `concept_links` | Qualitative `weightBand` + relation type |
| Concept ↔ library | `library_concepts` | Curation status + membership |
| Concept ↔ topic | `topic_concepts` | Topic membership |
| Evidence ↔ concept | `sourceRef` digests / seals | Provenance, not similarity |

## Scoring today

- Jaccard / token overlap on titles + summaries (`scoreRelevanceBand`) → `low|medium|high`
- Gate suite in `validateEvidencePackages` (relevance, duplicate, entitlement, leak, coherence, freshness)
- Extended gates: `sector_scope`, `source_credibility`, `corroboration` (D-070)

## Operator meaning

Relevance is a **typed weighted network** over sector/news/library relations — not cosine similarity over embeddings. Librarians and UI use bands + repairHints; never expose float scores as compute inputs to models.
