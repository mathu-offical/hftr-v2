# DATA company libraries + shell-persistent inspector (D-133)

| Field | Value |
|---|---|
| Status | implemented |
| Decision | D-133 |
| Related | D-049, D-121, D-128 |
| Owns | DATA tab company library rows; shell floating inspector layer |
| Does not own | RightPanel execution tabs; Galaxy nest physics |

## Intent

1. **DATA tab** lists company canvas `library` modules (engine-created or manual) in addition
   to active live API hydrators.
2. **Library file reading** uses the Galaxy-style floating inspector, mounted at **shell**
   level so it layers over Research / Market posture / Data backgrounds.
3. Opening a library/concept **does not** switch the left-tab overlay — background stays
   whatever tab was last navigated.

## DATA tab

- Section **Company libraries** below live sources.
- Rows: `modules.filter(type === 'library')` — compact one-line (name · topicScope).
- Select → resolve DB library by `config.topicScope` (fallback name) → `inspectLibrary`.
- Dock **Company** section uses the same open path.

## Shell inspector

- Mount `ShellInspectorLayer` as sibling above canvas overlays (`z-40`).
- Driven by existing `ResearchViewContext` (`pageInspectorOpen` + `inspectorTarget`).
- Fetches research graph (and topic detail) when inspector is open — independent of Galaxy
  overlay visibility.
- `ResearchOverlay` no longer hosts the aside (avoids unmount on tab switch).
- `inspectConcept` / `inspectLibrary` / `inspectTag` / `selectTopic` open the inspector
  **without** forcing `overlayOpen` / Research tab.

## Live API

- Unchanged: select hydrator → Data Explorer (live query/widgets). Library content is not
  the Explorer’s job.

## Docs

- ui-spec §LEFT Data + Floating inspector; decisions-log D-133; extend D-121 note.
