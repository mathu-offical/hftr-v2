# Research curation priors (weak supervision)

Gates and document-shape validators are **labeling functions (LFs)**, not ground truth.
Decision: **D-071**. Inspired by Snorkel-style weak supervision + reject-repair loops.

## Layers

| Layer | Storage | Visible to LLM? |
|-------|---------|-----------------|
| Raw ratios / Hamming / thresholds | append-only `curation_score_events` | **No** |
| `scoreBand`, `gateId`, `passed`, `reason`, `repairHints` | validation + librarian envelope | **Yes** |
| Operator accept/edit | `assistant_edits` / admission | Preference pairs later (not online training) |

## Flow

1. Gate + shape LFs score every candidate → triage (unanimous high → fast admit; conflict/low → librarian queue).
2. Librarian LLM gets **bands + repairHints only**; reject-repair ≤3 iterations.
3. Operator approval under `require_operator_approval` creates `(draft, accepted)` pairs for future preference learning.
4. Active learning: prioritize disagreement / medium-band samples.

No floats in model prompts (D-008). No guaranteed-returns language.
