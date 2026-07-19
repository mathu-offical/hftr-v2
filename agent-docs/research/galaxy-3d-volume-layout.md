# Galaxy 3D volume layout research (D-116)

**Status:** implemented + refined (2026-07-18)  
**Owns:** nest-center packing, force tuning for volumetric neural galaxy, volume camera framing  
**Related:** TD-09, D-040, D-107, `ui-ux/research-galaxy-topic-view-design.md`, `apps/web/lib/galaxy-physics.ts`

## 1. Problem (observed)

Live Playwright / operator feedback: the research galaxy **did not use enough 3D space**.

Root cause analysis of D-107 layout:

| Signal | D-107 behavior | Effect |
|--------|----------------|--------|
| Library XY | golden spiral radius ~80–400 | Wide planar spread |
| Library Z | `((i % 5) - 2) * ~22–40` → ≈ **±44** | **Pancake** — Z ≪ XY |
| Folders | XY ring + tiny Z jitter | Nested flat discs |
| Articles | planar spiral + tiny Z | Same |
| `forceCenter` | strength 0.012 | Compresses cloud toward origin |
| Camera | default / light `zoomToFit` | Frames pancake as “full”; elev hacks could land *inside* envelope |

Result: orbit camera still looked like a **flat necklace of nests**, not a volumetric neural cloud.

## 2. Methods surveyed

### 2.1 Keep stack (chosen)

- **`react-force-graph-3d` + `d3-force-3d`** (already TD-09) — correct engine family for neural / knowledge-graph explorers ([vasturiano/3d-force-graph](https://github.com/vasturiano/3d-force-graph), [d3-force-3d](https://github.com/vasturiano/d3-force-3d)).
- Custom nest forces remain (library / folder / article / foreign repel / cohesion) — hierarchical soft spheres are product-specific; not replaced by generic DAG modes.

### 2.2 Clustering plugins

- **`d3-force-clustering` / `d3-force-cluster-3d`** — attract nodes to cluster centers. Overlaps our nest attractors; deferred unless we need live-moving centers.
- **force-in-a-box** — 2D / hierarchical packing; authors note **flat 3D risk** if Z unused ([issue #124](https://github.com/vasturiano/3d-force-graph/issues/124)).

### 2.3 DAG / radial modes (`dagMode`)

- `radialout` / `zout` on 3d-force-graph — good for trees; our graph is **cyclic** with soft library membership → not a primary layout.

### 2.4 Hyperbolic layouts (deferred)

- **d3-hypertree**, H3 / Gyrolayout — excellent for huge trees with focus+context; wrong metaphor for multi-membership concept nets + library hulls. Revisit only if concept counts exceed LOD of TD-09 ladder.

### 2.5 Spherical packing (chosen for nest centers)

- **Fibonacci / phyllotaxis sphere** — even unit-sphere samples via golden angle; standard for distributing N points in 3D without polar banding ([Fibonacci lattice](https://iris.joshua-becker.com/lab/fibonacci-lattice-3d/), spherical Fibonacci literature).
- **Concentric shells by size tier** — larger libraries on slightly different shell radii so depth reads as hierarchy, not one thin sphere.

## 3. Decision (D-116)

1. **Library centers:** Fibonacci sphere on concentric shells (`computeLibraryCenters3D`), not XY spiral.
2. **Folder / article centers:** Fibonacci sphere *inside* parent hull (not planar rings).
3. **Forces:** weaken `center` (~0.004); raise charge `distanceMax`; slightly longer spring rest lengths; longer warmup/cooldown.
4. **Nest / folder fill:** `createNestShellRadialForce` + `createFolderShellRadialForce` push members onto hashed radial bands so balls are not hollow cores.
5. **Camera:** packing-derived `computeVolumeCameraPose` (elevated orbit outside company envelope) + **Fit** control; gentle idle auto-rotate (paused on pointer). Prefer this over `zoomToFit`+elev hacks that could frame from inside the envelope.
6. **Do not** adopt hyperbolic or force-in-a-box yet; document as follow-ups if volume still reads flat after camera + packing.

## 4. Implementation map

| File | Change |
|------|--------|
| `apps/web/lib/galaxy-physics.ts` | Fibonacci packing; nest/folder shell radials; `computeCompanyEnvelopeBounds` / `computeVolumeCameraPose` |
| `apps/web/lib/galaxy-physics.test.ts` | Volume packing + camera + folder shell tests |
| `apps/web/lib/galaxy-nest-hulls.ts` | Company envelope sized via shared bounds helper |
| `apps/web/components/research/GalaxyView.tsx` | Wire forces; Fit volume; idle orbit; DEV `layoutStats` (+ camera) |
| `agent-docs/ui-ux/research-galaxy-topic-view-design.md` | §4.1 volume contract + plan |
| `agent-docs/research/tech-decisions.md` | TD-09 amendment |
| `agent-docs/dev-intent/decisions-log.md` | D-116 |

### Force / packing summary

| Nest centers | `fibonacciSpherePoint(i, N)` on radius `baseShell + tier*shellStep` (large shells) |
| Folders / articles | Fibonacci sphere *inside* nest radius (`folderOrbR`, `articleOrbR`) |
| Nest fill | `createNestShellRadialForce` — soft radial spring so nest members leave the center and fill the ball |
| Folder fill | `createFolderShellRadialForce` — same for folder members (articles still own article orbits) |
| Springs | Longer nest↔folder / folder↔article distances |
| Charge | Softer; `distanceMax` raised so Z repulsion is not clipped early |
| Center force | Weakened so Z packing is not crushed toward the midplane |
| Layout commit | Cleared when `nestPackingSignature` changes so new packing is not overridden by stale FG coords |
| Camera | `computeVolumeCameraPose` (~22° elev, ~38° azim, distance ≈ envelope×2.55) + Fit button + idle orbit |

## 5. Follow-up plan

| Priority | Item | Trigger |
|----------|------|---------|
| ~~P1~~ | Live layout AABB — `zOverX ≈ 0.88` on 8-lib company | **Done 2026-07-18** (`layoutStats`) |
| ~~P1b~~ | Clear `layoutCommittedRef` on `nestPackingSignature` change | **Done** |
| ~~P2~~ | `createNestShellRadialForce` fills nest ball volume | **Done** |
| ~~P2b~~ | Folder shell radial + packing-derived camera / Fit / idle orbit | **Done 2026-07-18** |
| ~~P2c~~ | Distinct library **clusters** (D-132): separate hulls, nest-dominant forces, weak cross-lib springs, brighter library shells | **Done 2026-07-18** |
| P3 | `d3-force-clustering` for live nest centers | If pinned `fx/fy/fz` hulls fight volume |
| P4 | Hyperbolic focus mode for >2k concepts | TD-09 LOD ladder stage |
| P5 | Persist camera bookmarks | Product nice-to-have (design § out of scope) |
| P6 | Faster graph GET / warm cache | Graph still ~3m cold — UX lag unrelated to packing |

### D-132 cluster contract → D-136 free-float → D-139 celestial

| Lever | Behavior (D-139 builds on D-136) |
|-------|------------------|
| Concepts / tags | Free-float celestial bodies (planet/rock/ember/comet/moon) |
| Article | **Star hub** — soft-orbits folder system; concepts orbit live star |
| Packing | Soft library separation (gap ~1.06) so related nests can interact (D-145) |
| Semantic springs | Client overlap + shared display tags + membership (when DB links sparse) |
| Cross-nest high similarity | Stronger/shorter springs — bridges systems |
| Folder | **Orbital shelf band** + tangential spread (not core-pile); weak when article owns node |
| Article | **Star hub** — soft-orbits folder system; concepts orbit live star + tangential ring |
| Tags | Display-chip satellites + shared-tag bridges; system/catalog tags excluded |
| Topics | Membership orbits + star springs to hub when hub is a concept |
| Library | Faint framing only |
| Foreign repel | Near-off |
| LOD | **All** folders + article stars in library scope (D-141); chips filter |
| Live map | Research-cache invalidation + 8s overlay poll reshapes orbits |
| QA | `layoutStats` nestMembership folder/article orbit fractions + hull counts |

## 6. Verification

- Unit: `fibonacciSpherePoint` Z span; library centers Z/XY ratio; folder still inside parent;
  packing signature; nest/folder shell radial; volume camera outside envelope;
  **non-overlapping library hulls**; library cohere; cross-library link scale.
  **Verified:** `vitest run lib/galaxy-physics.test.ts` — see latest run.
- Browser: open Research galaxy → `window.__hftrGalaxyHoverTest.layoutStats()`.
  Expect `clusterSeparation.ok === true` and `nestMembership.fractionInside` high after settle
  (target ≥0.7 once simulation cools). Volume AABB `zOverX` should remain healthy.
- Console: no Application errors after settle — IronBee o11y when MCP available.

## 7. Citations (external)

- vasturiano/d3-force-3d — 3D Verlet force simulation  
- vasturiano/3d-force-graph — WebGL neural-style graphs; clustering discussion #124  
- Fibonacci sphere / phyllotaxis packing for even spherical samples  
- d3-hypertree — deferred hyperbolic alternative  
