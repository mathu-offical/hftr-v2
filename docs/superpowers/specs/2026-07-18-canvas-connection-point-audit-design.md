# Canvas connection-point audit + default engines (D-108)

**Status:** implemented  
**Date:** 2026-07-18  
**Living audit:** `agent-docs/ui-ux/canvas-connection-point-audit.md`

## Goal

Harden default ENGINE setups so insert/create yields specific view patterns and wiring that matches runtime functionality. Connection points are audited for placement, labeling, and separation — ports serve clearer defaults, not chrome.

## Locked decisions

| Topic | Rule |
|-------|------|
| Clock-in recipients | `TIME_BEARING` ∪ `{library, display}`; Math stays Calc-ref only |
| Additive clock | Time ports never replace data / system / fund / Math I/O |
| Time hub | Top = Schedule; Right = Time bus; Left = Authority in |
| Consumers | Bottom far-left = Clock in; Math docks to the right of clock_in |
| Natures | `data` / `system` / `fund` / `time` — styled + labeled distinctly |
| Inspector | May hide unlocked **delivery** outs only; clock / master / system / fund locked |
| Legal connects | `schedule_out` / `time_bus_out` → `clock_in` only; fail-closed |

## Catalogs

- `packages/contracts/src/port-channels.ts` — `MODULE_PORT_CHANNELS`, `CLOCK_IN_MODULE_TYPES`, `isLegalStreamPortPair`, `resolveExposedChannels`
- `moduleStreamPorts` enrichment places edges/slots/natures and additive clock_in + delivery buses

## Default engines

Execution spines include research→librarian→library (ingest + curation) plus zone-aligned process links; analyzers ship with explicit `emitMode`. Time provision links clock-in recipients onto the Time hub.

## Verification

- Contract vitest: additive clock invariant, Time split ports, slot legality, delivery hide
- IronBee: day-trading + research engine — labeled ports, nature edge styles, clock additive
