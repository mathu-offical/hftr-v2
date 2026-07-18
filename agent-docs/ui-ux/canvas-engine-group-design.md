# Canvas ENGINE group + Math tool design (2026-07-17)

**Status:** API/DB/contracts implemented; canvas parent-group wiring + delete modal + E2E **not verified**  
**Decision:** D-028 (`dev-intent/decisions-log.md`)  
**Related:** D-026 node dashboard (`canvas-node-dashboard-design.md`); D-023/D-024 engine templates + setup

## Goal

1. **Persisted ENGINE groups** — insertable end-to-end templates become a first-class `engine_instances` row with member modules linked by `engine_instance_id`.
2. **Master topic/sector** — one engine-level scope fans out to members unless a member overrides.
3. **Structural React Flow parent** — dashed group chrome with inline master topic editor (not a module type).
4. **Delete with intent** — operator chooses **cascade** (remove members) or **ungroup** (keep modules, drop chrome).
5. **Math as repeatable TOOL** — n8n-style multi-attach `data_feed` docks; Math is never an engine member.

## Identity model

| Entity | Role |
|--------|------|
| `engine_instances` | Persisted group: `template_id`, `label`, `master_topic_sectors`, `canvas_bounds` |
| Member `modules` | `engine_instance_id` FK; `topic_sectors_overridden` when operator edits topic on the node |
| `math` modules | **Never** `engine_instance_id`; may attach to many consumers as TOOL links |

Company creation and `POST .../engines` both insert an engine row and stamp members. Migration `0014` backfills `day_trading_starter`-shaped graphs (nine non-Math modules) into one engine instance.

## Topic cascade

```
engine_instances.master_topic_sectors
  → cascadeEngineMasterTopic (PATCH engine)
  → each member where topic_sectors_overridden = false
     AND type requires topic_sector
     AND type ≠ math
```

**Override:** module `PATCH` with `setup.topicSectors` sets `topic_sectors_overridden = true`.

**Restore:** module `PATCH` with `restoreEngineTopic: true` copies master back and clears override.

Engine group header exposes comma-separated master topic editor + **Save** → `PATCH .../engines/:id`.

## Canvas chrome (target UX)

```
┌─ Engine ──────────────── [Reflow] [Delete] ─┐
│ Day trading engine                          │
│ Topic / sector     [human-length value____] │
│ Capital allocation [USD] [value___________] │
│ Target exit        [datetime-local________] │
│ Template inputs (human labels) …  [Save]    │
│ ┌─────────────────────────────────────────┐ │
│ │  (member module nodes as children)      │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

- React Flow **parent node** `type: engineGroup`; children use `parentId` + relative positions.
- Bounds: `computeEngineBoundsFromPositions(member positions)` + `ENGINE_GROUP_PADDING`.
- Drag handle on group header bar (`engine-group-drag`); inline fields use `nodrag nowheel`.
- Enterable fields sit in a **compact top strip** with visible human-readable labels; tap focuses the control for entry.
- Create / insert / single-engine reflow / engine drag-stop use `placeNextEngineOrigin` so envelopes do not overlap.

**Shipped:** `EngineGroupNode.tsx`, `CanvasEngineGroup` type, non-overlapping placement helpers.

## Delete modal

| Mode | API | Effect |
|------|-----|--------|
| **ungroup** (default) | `DELETE` body `{ mode: 'ungroup' }` or no body | Clear `engine_instance_id` on members; delete engine row; keep modules + links |
| **cascade** | `DELETE` body `{ mode: 'cascade' }` | Delete incident links, member modules, then engine row; refresh neighbor generated names |

Modal copy must state data loss for cascade vs topology preservation for ungroup.

## Math tools (n8n-style)

- **Repeatable:** `POST .../modules` with `type: math` allowed (palette); `DELETE` allowed.
- **Multi-attach:** `LINK_RULES` adds `math→{research,library,live_api,trend,trading,simulator,analyzer,policy,generator,display}` `data_feed` edges.
- **Detection:** `mathCanAttachTo(consumer)` + `isMathToolAttachment(from, to, linkKind)`.
- **Not in group:** create/update rejects `engineInstanceId` on Math (`math_module_cannot_join_engine`).
- **Company seed:** creation still inserts one Math module; additional Math modules are optional tools.

**TOOL chrome (deferred):** consumer nodes show docked Math attachments distinct from primary `data_feed` ports — visual spec TBD; contracts + link rules are in place.

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/companies/:companyId/engines` | List engines + `memberModuleIds` |
| `POST` | `/api/companies/:companyId/engines` | Insert template → engine row + members + links |
| `GET` | `/api/companies/:companyId/engines/:engineId` | Single engine + members |
| `PATCH` | `/api/companies/:companyId/engines/:engineId` | Label, bounds, master topic (+ cascade) |
| `DELETE` | `/api/companies/:companyId/engines/:engineId` | `cascade` \| `ungroup` |

Module routes: `engineInstanceId` on create (non-Math); `restoreEngineTopic` on PATCH.

Contracts: `packages/contracts/src/engines.ts`.

## Verification checklist

- [x] Migration `0014_engine_instances` + schema/types
- [x] Contracts parse tests (`describe('engine instances (D-028)')`)
- [x] Playwright `e2e/canvas-engine-groups.spec.ts` (cascade, override, insert second engine, ungroup)
- [x] IronBee: Engine chrome + Master topic/sector visible on day-trading canvas; console checked
- [x] Engine CRUD + cascade + delete modes (API handlers)
- [x] `EngineGroupNode` component (isolated)
- [ ] `CompanyCanvas` parent groups + engines API insert path
- [ ] Delete modal (cascade vs ungroup) wired from group chrome
- [ ] Inspector: `restoreEngineTopic` affordance for engine members
- [ ] Math TOOL dock chrome on consumer nodes
- [ ] Playwright ARCH-004 (multi-engine + cascade/override)
- [ ] IronBee: grouped layout, master topic save, delete modes, Math multi-attach

## Non-goals

- Fund movement through engine groups (topology only in M1).
- Math inside engine membership.
- Obstacle-avoiding edge routing inside groups (inherits D-023 smoothstep).
