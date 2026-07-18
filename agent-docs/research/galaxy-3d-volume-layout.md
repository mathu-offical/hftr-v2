# Galaxy 3D volume layout research (D-116)

**Status:** implemented baseline (2026-07-18)  
**Owns:** nest-center packing, force tuning for volumetric neural galaxy  
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
| Camera | default / light `zoomToFit` | Frames pancake as “full” |

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
4. **Camera:** auto `zoomToFit` with larger padding after physics ready so volume fills the viewport.
5. **Do not** adopt hyperbolic or force-in-a-box yet; document as follow-ups if volume still reads flat after camera + packing.

## 4. Implementation map

| File | Change |
|------|--------|
| `apps/web/lib/galaxy-physics.ts` | `fibonacciSpherePoint`, `scaleSpherePoint`; rewrite center placers; spring/charge tunings |
| `apps/web/lib/galaxy-physics.test.ts` | Assert Z span ≈ XY (volume packing) |
| `apps/web/components/research/GalaxyView.tsx` | center strength, charge distanceMax, zoomToFit padding, warmup |
| `agent-docs/ui-ux/research-galaxy-topic-view-design.md` | §4.1 volume contract + plan |
| `agent-docs/research/tech-decisions.md` | TD-09 amendment |
| `agent-docs/dev-intent/decisions-log.md` | D-116 |

## 5. Follow-up plan

| Priority | Item | Trigger |
|----------|------|---------|
| P1 | Live IronBee orbit check — confirm Z depth while rotating | After HMR; IronBee MCP available |
| P1b | Clear `layoutCommittedRef` / remount when nest packing signature changes | If operators still see old pancake until hard refresh |
| P2 | Optional `forceRadial` shells for concepts inside library | If members still collapse to midplane |
| P3 | `d3-force-clustering` for live nest centers | If pinned `fx/fy/fz` hulls fight volume |
| P4 | Hyperbolic focus mode for >2k concepts | TD-09 LOD ladder stage |
| P5 | Persist camera bookmarks | Product nice-to-have (design § out of scope) |

## 6. Verification

- Unit: `fibonacciSpherePoint` Z span; library centers Z/XY ratio; folder still inside parent.
  **Verified:** `pnpm --filter @hftr/web exec vitest run lib/galaxy-physics.test.ts` — 13/13 pass.
- Browser: open galaxy → wait graph → orbit camera — nests above/below midplane; company envelope not a thin disc.
  **Unverified this session:** IronBee MCP call failed (`server does not exist` despite catalog ready);
  Playwright left-panel open timed out under heavy Next compile. Re-check after hard refresh once
  `:3001` is idle (P1).
- Console: no Application errors after settle — pending browser pass.

## 7. Citations (external)

- vasturiano/d3-force-3d — 3D Verlet force simulation  
- vasturiano/3d-force-graph — WebGL neural-style graphs; clustering discussion #124  
- Fibonacci sphere / phyllotaxis packing for even spherical samples  
- d3-hypertree — deferred hyperbolic alternative  
