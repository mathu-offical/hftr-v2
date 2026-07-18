# Research archive, confidence, and system chips (D-047)

Living design for soft-delete **Archive**, qualitative **confidence**, and inline **system chips**.

## Operator model

| Surface | Meaning |
|---------|---------|
| Live Research / Libraries / Galaxy / Page | Active rows only |
| **Archive** (left panel) | Soft-deleted concepts, topics, libraries |
| **Clear archive** | Hard-delete archived runtime rows only |
| **Archive runtime** | Soft-delete all non-seeded research |

Protected (never archive-all / never clear):

- Concepts with `sourceClass: catalog_seed`
- Library / topic titled **Seeded trading mechanisms**

## Per-object actions (live)

| Action | Behavior |
|--------|----------|
| **Delete** | Soft archive (`status=archived`, `archived_at`) |
| **Verify** | Confidence bump (`verify` → up one band) |
| **Refine** | Body/synopsis edit (leak-linted) + confidence bump |

## Confidence

- Bands only: `low | medium | high` on `concepts` and `research_topics`
- Bumps on: library accept / auto_admit, research admit, verify, refine
- No raw floats on operator or model-facing surfaces (NRA)

## System chips

Optional markdown: `[[sys:tool|lever|catalog|module:id]]` renders as an inline chip via `ResearchMarkdown`.

## API

- `GET /api/companies/:id/research/archive` — list archived
- `POST` same path with `ArchiveResearchInput` actions:
  `archive_runtime`, `clear_archive`, `archive_object`, `restore_object`,
  `verify_object`, `refine_object`

## Verification

- Engine unit: `packages/engine/src/libraries/archive.test.ts`
- Web unit: `apps/web/lib/research-sys-chips.test.ts`
- Browser: Archive section + concept Verify/Delete on galaxy detail
