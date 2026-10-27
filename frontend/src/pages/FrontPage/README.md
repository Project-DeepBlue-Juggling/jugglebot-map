# Front page components (reused by Now / Next / Later and the drawer)

- `FrontPage` (route; `onOpen?(taskId)` from the shell) -> `FrontPageView {tasks, deps, users, onOpen}` -> `HoverProvider` -> masthead, tile grid (3 cols, every open Pathway), `InboxWall` (every card); the page scrolls as one.
- `PathwayTile {pathway, view}`: `StatusPill`, `PriorityTag`, `BranchChip` (non-main only), Destination (clamped to 3 lines, full text in `title=` and the drawer), `SegmentedBar {units, view}`, "x of y stops done", "n tickets open", `NextBox {pathway, next, hasPlans, view}`, `WhatRemains {remaining, view}` (cap 4 + "+n more"), `Owners`, inbox tokens.
- `InboxWall {view}` -> `InboxCard {task, view}` (idea/feature/bug, kind hue); `TicketCard {task, view}` (neutral, `ticket_type` label). Both exported for the rail and the lanes.
- Every card takes one `view: MapView` = `buildMapView(tasks, deps, users, onOpen, now?)` -> `{ix, pathways, hues, onOpen, now}`; ask `lib/derive.ts` (`lanes`, `nextStop`, `progress`, `openBlockers`, ...) with `view.ix`.
- `Openable {id, view, as?, label?, className?, style?}` is the only clickable: `data-item-id` + hover classes + `onOpen(id)` on click / Enter. `DepTags {task, view, max?}` renders blocked-by / blocks tags as Openables.
- Hover: wrap a page in `<HoverProvider openBlockerIds={openBlockerIdsOf(view)}>`; any element can opt in with `useItemHover(id)` (`features/hover`).
- Colours: `theme/palette.ts` (`KIND_HUES`, `pathwayHues`, `STATE_STYLES` by `taskState`, `STATUSES_BY_KIND`, `statusLabel`).
- The drawer unit only needs `onOpen`: the shell holds the open task id and renders the shared drawer (`features/drawer`); nothing here renders on open.
- One-scroll contract (owner, 2026-10-27, JB-68; retires the earlier no-scroll layout): the page root is `h-full overflow-y-auto` and nothing inside it scrolls: the tile grid has no fixed height and shows every tile, the wall shows every card (each a fixed `FRONT_LAYOUT.card` high). Tests pin the CSS contract only; the real check is `scripts/screenshot.sh`.
