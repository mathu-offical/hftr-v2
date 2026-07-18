# Research tab shelves + floating inspector (D-049)

Living design for the left Research tab layout and floating in-galaxy inspector.

## Left Research tab (top → bottom)

1. **Submit new topic** — primary control at top; creates a research topic (module picker when multiple research modules exist).
2. **Submit research article** (D-079) — link URL (+ optional notes) or raw text/markdown; model-free; lands as `sourceClass: operator` concept on Runtime shelf (optional library picker).
3. **Entity search** — single search field; entity-type buttons switch the corpus:
   - `Topics` · `Concepts` · `Tags` · `Libraries`
4. **Library shelves** — expandable groups; each library (or seeded category) is a **folder of pages**:
   - Caret expands the folder to list pages (catalog / admitted concepts as readable page leaves).
   - **Folder name click** opens the matching **overview topic page** when one exists (same title as the library, e.g. Seeded trading mechanisms); otherwise opens the library inspector + galaxy nest.
   - **Page leaf click** opens that page in the floating inspector and traces it in the galaxy.
   - Shelves:
     - **System curated (runtime)** — cadence libraries for all `system:*` scopes (D-069): movers, execution logs, daily summaries, runtime policies, trend lists, sector news. Movers/sector/daily jobs seal verified-normalized views + readable reports (D-070/D-072); other folders bootstrap with shaped placeholders. Shelf visible even when a slice is empty.
     - **Runtime (user / engine)** — operator-created and engine-admitted libraries (not baseline seed).
     - **Baseline seeded** — one shelf (same bordered section chrome as system/runtime). Inside: **Overview · Seeded trading mechanisms**, then **inline catalog folders** (Strategy families, Guardrails, Session constraints, Broker policy, Trend lead patterns, **Sector knowledge**) partitioned by seed catalog tags. Folders use the same caret/folder-row pattern as runtime libraries. Within a folder, distinct `tier_*` tags nest as tier subfolders; single-bucket catalogs stay flat. **Sector knowledge** materializes vendored `sector_seeds` for the company’s `sectorFocuses` (create + PATCH); multiple coarse sectors nest as `sector_*` subfolders (D-076).
5. **Pages** — company topics as a compact list (including folder overview topics such as Seeded trading mechanisms). Selection opens the Page inspector. Linked topic IDs from the open page’s synopsis/`[[wikilink]]`s are text-highlighted in this list.
6. **Archive** (D-047) — soft-deleted research; Restore / Clear archive.
7. **Modules & tools** (collapsed) — research module actions, company sweep, Obsidian export.

## Main workspace

- The **Galaxy** overlay is owned by the left Research panel: it opens when the left panel
  is open on the Research tab, and closes when the left panel collapses (or when Data is
  selected). Overlay close (×) collapses the left panel too. No Galaxy | Page tab strip.
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
| Select baseline Overview | Focus topic membership | Overview page article | Overview control at top of Baseline seeded shelf |
| Wikilink in synopsis | Same as concept/topic select | Opens target in inspector | — |

## Classification rules (libraries)

| Shelf | Rule |
|-------|------|
| Baseline seeded | Active library is baseline (`name === "Seeded trading mechanisms"` OR `topicScope === "compile_time_mechanisms"`); pages shown as inline catalog folders by bootstrap catalog tags; optional `tier_*` subfolders inside those folders; Sector knowledge uses `sector_seeds` + per-sector `sector_*` tags |
| System curated | `topicScope` starts with `system:` — **`system:movers`** → Daily movers watch (bootstrap + `library.system_movers` handler); other `system:*` scopes ship incrementally |
| Runtime | All other active libraries |

## Client caching (library UI)

Stale-while-revalidate via `apps/web/lib/research-resource-cache.ts` + `research-resource-api.ts`:

| Resource | Persist | Role |
|----------|---------|------|
| `libraries` | memory + sessionStorage | Shelf chrome (names / scopes) — hydrate before network |
| `topics` | memory + sessionStorage | Pages list + folder overview links |
| `libraryConcepts` | memory + sessionStorage | Folder page indexes (lazy on expand; baseline warm-prefetched) |
| `concepts` | memory only | Search corpus (bodies); not session-persisted |
| Shelf expand UI | sessionStorage | Which catalog / runtime / system folders are open |

Refresh rules: soft revalidate on company mount + every 30s while the left panel is open (never wipe chrome first). Mutations (topic create, archive, curate, research run) invalidate then force-refresh. Manual refresh control on the Library shelves header.

## Related

- D-040 topics / galaxy / hybrid articles
- D-045 catalog bootstrap / Seeded trading mechanisms
- D-047 archive + confidence + chips
- D-048 multi-domain research sources (orthogonal)
- `ui-ux/research-galaxy-topic-view-design.md`
