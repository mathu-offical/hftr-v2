# Research tab shelves + floating inspector (D-049)

Living design for the left Research tab layout and floating in-galaxy inspector.

## Left Research tab (top → bottom)

1. **Submit new topic** — primary control at top; creates a research topic (module picker when multiple research modules exist).
2. **Entity search** — single search field; entity-type buttons switch the corpus:
   - `Topics` · `Concepts` · `Tags` · `Libraries`
3. **Library shelves** — three expandable groups; each library is a **folder of pages**:
   - Caret expands the folder to list pages (catalog / admitted concepts as readable page leaves).
   - **Folder name click** opens the matching **overview topic page** when one exists (same title as the library, e.g. Seeded trading mechanisms); otherwise opens the library inspector + galaxy nest.
   - **Page leaf click** opens that page in the floating inspector and traces it in the galaxy.
   - Expanded folders may include an **Overview** row that opens the index topic (same page also listed under Pages).
   - Shelves:
     - **System curated (runtime)** — cadence libraries (movers/trends/policy). Empty until those ship; shelf still visible.
     - **Runtime (user / engine)** — operator-created and engine-admitted libraries (not baseline seed).
     - **Baseline seeded** — compile-time catalog nest; opens expanded by default. **Seeded trading mechanisms** is the folder of mechanism pages; the overview page remains in the Pages list and is also reachable via folder name / Overview.
4. **Pages** — company topics as a compact list (including folder overview topics such as Seeded trading mechanisms). Selection opens the Page inspector. Linked topic IDs from the open page’s synopsis/`[[wikilink]]`s are text-highlighted in this list.
5. **Archive** (D-047) — soft-deleted research; Restore / Clear archive.
6. **Modules & tools** (collapsed) — research module actions, company sweep, Obsidian export.

## Main workspace

- Opening the Research tab opens the **Galaxy** overlay only (no Galaxy | Page tab strip).
- **Floating inspector** — panel on the **right** over the galaxy. Shows Page / Concept / Library / Tag detail. Detail never expands inline in the left panel or as a galaxy bottom drawer. Overlay + inspector + left Research tab are viewport-bounded; inspector body and folder page lists scroll independently.
- Galaxy nodes: click opens the same inspector; highlighted node gets a ring + label fly-to. Library chips / nest labels use short names; default view is **3D** with visible nest sphere outlines.

## Selection behavior

| Action | Galaxy | Floating inspector | Left panel |
|--------|--------|--------------------|------------|
| Select topic/page | Focus membership concepts | Show hybrid article (synopsis + member list as buttons) | Selected + linked pages highlighted |
| Select concept / folder page leaf | Focus + highlight / fly-to concept | Show concept body + verify/delete | Navigator only (no inline expand) |
| Select tag | Focus tagged concepts; highlight first | Tag member list | Navigator only |
| Select library folder (no overview topic) | Filter nest chip | Library member list | Caret expands page leaves separately |
| Select library folder (with overview topic) | Focus topic membership | Overview page article | Folder + Pages list selection |
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
