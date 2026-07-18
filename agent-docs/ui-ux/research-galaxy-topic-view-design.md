# Research galaxy + topic view design (D-040)

**Status:** implemented (2026-07-18) — library/folder/article nest hierarchy (D-078), shared
LLM-assist qualitative similarity springs, rich inspector markdown; credentialed research soak
still open for formal G2 sign-off.  
**Decision:** D-040 (base); D-078 (hierarchy + similarity)  
**Owns:** research canvas overlay (galaxy + article tabs), left-panel topics list, library-nested layout, usage telemetry for concepts/topics  
**Related:** `ui-spec.md` §4 LEFT + §6; `product/product-spec.md` § Research/Libraries; `architecture/data-model.md` Research & knowledge; TD-09; D-007; D-039; D-045; DevSpecs `research-library-philosophy.spec.md` (read-only intent)

## 1. Intent

Research agents (external research + librarian modules) create **topics**: agent-owned
organizations that compose new and linked information from company databases, seeded
knowledge bases, and externally gathered evidence. Topics are **not** galaxy nodes.

Galaxy nodes remain **concepts** and **tags**. Topics group concepts and carry a hybrid
wiki article used for operator reading and system retrieval. Every saved research artifact
must land in a **system-usable and operator-viewable** format (library membership, typed
links, article body with semantic inline links, exportable Obsidian markdown).

Usage and reference counters on topics and concepts exist for **system optimization**
(retrieval ranking, librarian prioritization, cadence) in addition to visual graph weight.

## 2. Object model

| Object | Role | Galaxy? |
|---|---|---|
| **Topic** | Agent/research-module **directive** (module-side); may include many concepts; owns hybrid article; may spawn further articles/libraries | No (left panel + focus overlay only) |
| **Concept** | Atomic curated knowledge unit (body, tags, provenance) — **library-side** | Yes (primary node) |
| **Tag** | Cross-cutting label on concepts — **library-side** | Yes (secondary nodes / color / filter chips) |
| **Library** | Curated membership container for concepts/tags/trends/functions; hard spatial nest in galaxy | Nest boundary (hull), not a node |
| **Folder star** | Catalog/runtime tag cluster inside a library (D-078) | Folder hull + nest force |
| **Article orbit** | Topic membership orbit inside a folder (D-078) | Article hull; topics still not concept hubs |
| **Concept link** | Typed edge (`supports`, `contradicts`, …) | Yes (edge; springs blend weight + similarity) |
| **Topic membership** | Join: topic ↔ concept (ordered, role optional) | Defines topic trace subgraph |

### Galaxy hierarchy layout (D-078)

```
Company hull
 └─ Library hull (soft nest)
     └─ Folder sphere (catalog tag / runtime; mass = amalgamated vocabulary)
         └─ Article orbit (topic)
             ├─ Concept nodes
             └─ Tag satellites (capped; click → parent concept)
```

Semantic distance uses the **same** LLM-assist regex normalize + Jaccard band path as
librarian relevance (`low|medium|high`) — see `architecture/research-relevance-graph.md`.

### Topic composition sources (provenance classes)

Topics may link concepts whose provenance spans:

1. **Company space** — prior research runs, admitted library concepts, module outputs  
2. **Seeded knowledgebase** — compile-time / catalog seed libraries (**D-045** /
   **D-081** / **D-086** / **D-096** `bootstrapCompanyKnowledge` materializes `SEED_CATALOG_NAMES`
   into `catalog_seed` concepts in the **Seeded trading mechanisms** library, plus
   **separate top-level** catalog directive topics, optional **Desk focus** combination
   topics from company `sectorFocuses`, and class/tier/sector child directives on the
   research module)  
3. **External gather** — Brave / SEC / market-news evidence → validated → synthesized concepts (D-039)

Librarian agents score relevance across resources; research agents create/update topics and
articles as part of curation tasks. Both write through the same contracts so UI and engine
share one graph.

## 3. UI layout

```
│ Research tab                       │  [ Galaxy | Page ]   filters / layout       │
│  Topics (all company)              │                                               │
│  Concepts & tags (searchable)      │  Layered overlay: rotating tag chips +        │
│  Workspace Galaxy|Page             │  force graph (concepts) inside library nests  │
│  Modules & libraries (collapsed)   │                                               │
│                                    │  Topic focus: dim outsiders + darker animated │
│                                    │  path/hull for selected topic trace           │
└────────────────────────────────────┴───────────────────────────────────────────────┘
```

### 3.1 Left panel — Topics primary

- Research tab lists **all company topics** first (grouped by owning research module; tree
  when `parent_topic_id` set): title, status (`active|archived|deferred`), priority, concept
  count, coverage hint, last-queried / reference badges (text-first).
- Next: **Concepts & tags** — company-wide searchable concept database with tag chip filters;
  Focus opens galaxy highlight for that concept.
- Workspace strip: **Galaxy | Page** switches the layered overlay tabs (Page = hybrid article).
- Opening the left Research panel (Research tab) auto-opens the Galaxy overlay; collapsing
  the left panel (or selecting Data) hides it. Overlay close collapses the left panel.
- Selecting a topic:
  1. Ensures Research overlay is open.
  2. Activates **Galaxy** tab (Page available via tab).
  3. Applies **topic focus** on the galaxy (see §4.3).
  4. Loads hybrid article for the Page tab.
- Secondary (collapsed): module create/run controls, libraries + Obsidian export.

### 3.2 Main content — tabbed Research overlay

Layered panel over the company canvas (does not replace module graph permanently; opens as
the Research workspace overlay when Research left-tab is active or a topic is selected).

Tabs:

| Tab | Content |
|---|---|
| **Galaxy** | Full rotating concept/tag galaxy, library-nested (§4) |
| **Page** (Article) | Hybrid wiki for the selected topic (§5) |

Shared chrome: search, tag filter chips, library scope multi-select, layout mode (nested
default), zoom controls, clear-topic-focus.

### 3.3 Rotating info tags layer

Above/around the force graph: a layered, slowly rotating (or orbiting) set of **info tag**
chips drawn from visible concepts’ tags (and optionally topic-level keywords). Behavior:

- Tags remain filterable chips (click = set `activeTag`, same as today’s galaxy filter).
- Motion is subtle; respects reduced-motion preference (static layout when
  `prefers-reduced-motion: reduce`).
- Tag layer does not occlude click targets for nodes; pointer-events on chips only.

## 4. Galaxy organization

### 4.1 Soft nested library clusters (3D physics default)

- Company galaxy = outer 3D force space (`react-force-graph-3d` + `d3-force-3d`).
- Each **library** is a **soft spherical nest** (attractor + restore force) with a **visible
  wireframe / translucent sphere outline** at the nest center and radius. Concepts with
  primary membership are pulled toward / restored into their library volume.
- A larger **company envelope** sphere outlines the full organizational cloud (bounds visible
  library nests).
- Cross-library concept links may span nests (spring length still set by weight band + relation).
- Concepts in multiple libraries: **primary membership** determines nest; secondary
  memberships shown as badges on the concept card / node label, not duplicated nodes.
- Master library (if flagged) may render as the outermost company cloud or a dedicated nest —
  default: **master = company outer**, curated libraries = inner nests.
- Reducing scope (library filter, zoom into one nest) remains stable because nest forces
  reheat with the filtered subgraph.

### 4.2 Zoom, filters, re-layout

| Control | Effect |
|---|---|
| Zoom in/out | Camera + nest LOD (labels, then nodes, then tag layer) |
| Library multi-select | Show only selected nests; hide others (or collapse to dimmed empty hulls) |
| Tag filter | Dim/hide non-matching concepts inside remaining nests |
| Search | Fly-to matching concept; keep nests |
| Topic select | Topic focus (§4.3) without destroying nest layout |
| Clear filters | Restore full company nested layout |

Re-organization is **driven by UI selection state**, not by rewriting stored positions
(positions may be session-cached for stability; persisted layout coords are optional/M2+).

### 4.3 Topic focus (dim + path)

On topic select (left panel or deep-link):

1. **Dim** concepts and edges not in the topic’s membership set (and optionally 1-hop
   neighbors if an “include neighbors” toggle is on — default **off**).
2. Draw the topic’s **trace path**: darker edges among member concepts (and optional soft
   hull around the member set), **subtly animated** (pulse/dash offset). Reduced-motion →
   static darker stroke only.
3. **Fly-to / fit** camera on the member subgraph while keeping library nest structure.
4. Topic is **not** inserted as a galaxy node; focus is overlay + dimming only.

Clearing topic focus restores full brightness; nest layout stays.

### 4.3.1 Hover, labels, and reference readout (D-100)

- Hovering a concept / tag satellite / nest hull / link opens a terminal-styled **info card**
  near the pointer (`data-testid="galaxy-hover-card"`): nest path (library / folder / article),
  curation + source class, link degree, **Queried / Referenced** usage, and up to four tags.
  Links show relation · weight band · qualitative similarity and endpoint titles.
- Visual: hovered node brightens; 1-hop neighbors stay lit; other nodes/edges dim. 2D mode
  paints a ring + label on hover even when zoomed out.
- Nest physics: stronger folder/article restore than library soft-pull so hierarchy reads as
  nested spheres; slightly stronger charge + collide to reduce stacked blobs.
- Tag orbit: max 24 chips; quieter chip chrome; pointer-events only on chips.

### 4.4 Performance (TD-09)

- Prefer 3D physics space; 2D fallback only on WebGL failure or explicit operator toggle.
  Soft nest forces still apply in 2D (planar projection).
- Preserve simulation node positions across focus/filter updates (seed nest coords once).
- LOD ladder: hide tag orbit → simplify labels → aggregate small libraries when zoomed out.

## 5. Hybrid article (wiki) view

### 5.1 Content model

Hybrid article on each topic:

1. **Agent synopsis** — semantic markdown description maintained by research/librarian
   curation; includes **inline links** to concepts, libraries, evidence, and related topics
   (wikilink or typed ref syntax resolved in renderer).
2. **Concept sections** — expandable ordered sections from member concepts (title, summary
   or body excerpt, tags, library admission status, provenance). Order = topic membership
   order (librarian/research adjustable).

Articles are first-class curated artifacts: saving research means updating concept graph
**and** keeping topic article + memberships coherent so both Galaxy and Article views stay
truthful.

### 5.2 Inline links & semantics

- Links in synopsis resolve to in-app navigation: open concept card, switch to Galaxy +
  focus node, open related topic article, or open evidence/run provenance.
- No raw financial numbers authored by models into article bodies (NRA / leak lint on
  model-bearing write path — D-008).
- Text-first status for admission / validation chips in concept sections.

### 5.3 Export

Obsidian zip continues per library; topic articles that reference exported concepts are
included under `topics/` as markdown notes with wikilinks to member concept titles
(`exportObsidianTopicNotes` + library export route).

## 6. Usage & reference telemetry

Topics and concepts track system use for optimization **and** visual weight:

| Metric | Meaning | Updated when |
|---|---|---|
| `query_count` | Times retrieved/queried by system (research bus, librarian, promote evidence_fit, assistant lookup, article/galaxy open API) | Each authorized query hit |
| `last_queried_at` | Clock-module timestamp of last query | Same |
| `reference_count` | Times referenced by other research artifacts (topic membership, concept_links, evidence refs, article inline links resolved at write) | On create/delete of referencing edges |
| `last_referenced_at` | Last reference change | Same |

Rules:

- Counters are **monotonic append-friendly** (prefer increment events or periodic rollup from
  append-only `knowledge_access_events` if write contention matters — choose event log if
  hot paths contend; otherwise denormalized columns on `concepts` / `research_topics`).
- Visual: node size / edge emphasis may incorporate `reference_count` (band-normalized), never
  raw PnL-like numbers in model text.
- Optimization: librarian ranking, topic coverage gaps, stale unused concepts, cadence
  scheduling prefer high-reference / recently-queried nodes when exploring related work;
  low-query orphans surface for archival review.
- Operator-visible in concept/topic detail: “Queried N · Referenced M · Last queried …”
  (text-first).

## 7. Data / API deltas (implementation contract)

Schema additions (names indicative; migrate under ownership scoping):

- `topic_concepts` — `(topic_id, concept_id, sort_order, role?)` unique `(topic_id, concept_id)`
- `research_topics` — `synopsis_md` (or `body_md`), usage columns above; keep existing tree fields
- `concepts` — usage columns above
- Optional `knowledge_access_events` — append-only `(company_id, entity_kind, entity_id, access_kind, actor, created_at)`

APIs:

- `GET/PATCH .../topics`, `GET .../topics/:id` (membership + synopsis + usage)
- `PUT .../topics/:id/concepts` (ordered membership; research/librarian only via jobs + operator)
- Graph endpoint: nodes include `primaryLibraryId`, usage bands; links unchanged; response
  includes library nest metadata for layout
- Query/record endpoints or middleware that bumps counters on read paths used by engine

## 8. Safety & invariants

- Model-free below compile unchanged; research gather/validate/admit remain D-039.
- Leak lint on synopsis/concept body writes from model tiers.
- Live trading unaffected; research view is knowledge-only.
- No guaranteed-returns language in article templates or UI copy.

## 9. Verification plan (when implementing)

- [x] Contract tests for topic membership + usage increments  
- [x] Playwright: select topic → galaxy dims + path visible; Article tab shows synopsis + sections  
- [x] Library nest multi-select chrome + synopsis Edit/Save (PATCH)  
- [x] Obsidian export includes topic notes with member wikilinks  
- [x] IronBee: open galaxy overlay (Galaxy/Article/search); library toolbar when nests exist  
- [x] Console: no Application error after Open galaxy (after HMR settle)  

## 10. Out of scope (this decision)

- Replacing concepts with topics as galaxy nodes  
- Soft-only clustering as default layout  
- Persisted 3D camera bookmarks (nice-to-have later)  
- Changing Obsidian export format beyond adding topic notes  

## Approaches considered

| Approach | Summary | Why not default |
|---|---|---|
| Soft clustering only | Force-pull same-library nodes | Less stable when scope reduces |
| Topics as galaxy hubs | Topic nodes in graph | User: topics are organizations only |
| Assembled article only | No synopsis store | Weaker semantic narrative; hybrid preferred |
| Dim-only focus | No path overlay | Weaker trace readability; path+dim preferred |
