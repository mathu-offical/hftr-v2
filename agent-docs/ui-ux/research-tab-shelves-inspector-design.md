# Research tab shelves + floating inspector (D-049)

Living design for the left Research tab layout and floating in-galaxy inspector.

## Left Research tab (top → bottom)

1. **Submit new topic** — primary control at top; creates a research topic (module picker when multiple research modules exist).
2. **Entity search** — single search field; entity-type buttons switch the corpus:
   - `Topics` · `Concepts` · `Tags` · `Libraries`
3. **Library shelves** — three expandable groups; libraries are a navigator tree:
   - Caret expands children for browsing only.
   - **Primary click on a library name** opens the floating inspector (does not expand inline content).
   - Concept leaves open the inspector + galaxy trace.
   - Shelves:
     - **System curated (runtime)** — cadence libraries (movers/trends/policy). Empty until those ship; shelf still visible.
     - **Runtime (user / engine)** — operator-created and engine-admitted libraries (not baseline seed).
     - **Baseline seeded** — compile-time catalog nest (`Seeded trading mechanisms`, `topicScope=compile_time_mechanisms`).
4. **Pages** — company topics as a compact list; selection opens the Page inspector. Linked topic IDs from the open page’s synopsis/`[[wikilink]]`s are text-highlighted in this list.
5. **Archive** (D-047) — soft-deleted research; Restore / Clear archive.
6. **Modules & tools** (collapsed) — research module actions, company sweep, Obsidian export.

## Main workspace

- Opening the Research tab opens the **Galaxy** overlay only (no Galaxy | Page tab strip).
- **Floating inspector** — panel on the **right** over the galaxy. Shows Page / Concept / Library / Tag detail. Detail never expands inline in the left panel or as a galaxy bottom drawer.
- Galaxy nodes: click opens the same inspector; highlighted node gets a ring + label fly-to.

## Selection behavior

| Action | Galaxy | Floating inspector | Left panel |
|--------|--------|--------------------|------------|
| Select topic/page | Focus membership concepts | Show hybrid article (synopsis + member list as buttons) | Selected + linked pages highlighted |
| Select concept (search / tree / node) | Focus + highlight / fly-to concept | Show concept body + verify/delete | Navigator only (no inline expand) |
| Select tag | Focus tagged concepts; highlight first | Tag member list | Navigator only |
| Select library (name click) | Filter nest chip | Library member list | Caret may expand children separately |
| Wikilink in synopsis | Same as concept/topic select | Opens target in inspector | — |

## Classification rules (libraries)

| Shelf | Rule |
|-------|------|
| Baseline seeded | `name === "Seeded trading mechanisms"` OR `topicScope === "compile_time_mechanisms"` |
| System curated | `topicScope` starts with `system:` (reserved; empty until cadence libraries ship) |
| Runtime | All other active libraries |

## Related

- D-040 topics / galaxy / hybrid articles
- D-045 catalog bootstrap / Seeded trading mechanisms
- D-047 archive + confidence + chips
- D-048 multi-domain research sources (orthogonal)
- `ui-ux/research-galaxy-topic-view-design.md`
