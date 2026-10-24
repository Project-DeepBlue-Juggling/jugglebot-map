# Jugglebot map frontend

A Vite + React + TypeScript single-page app for the Jugglebot map. In production the Python server serves the built `frontend/dist` and the API (`/api/v1`) from the same origin on port 8765. There is no sign-in: the signed-in user is whatever `GET /users/me` returns.

Right now the app is the shell (API client, schemas, TanStack Query hooks, shared item drawer, new-item modal, theme) plus the Front page (`/`, see `src/pages/FrontPage/README.md`) and Now / Next / Later (`/now`). Computed views live in `src/lib/derive.ts`, colours in `src/theme/palette.ts`, the hover highlight in `src/features/hover/`.

```bash
npm ci                     # install
npm run dev                # dev server; proxies /api to the Python server on http://localhost:8765
npm run build              # typecheck, then build into dist/
npm run test -- --run      # vitest
npm run lint
npm run typecheck
```

## Visual check

happy-dom does no layout, so the vitest "no-scroll" and 400 px tests only pin the CSS contract (classes and inline heights). The real layout check is `scripts/screenshot.sh <out-dir>`: it builds the app, serves the real map and takes 1500x900 Firefox screenshots `front.png` and `now.png`; look at both after any layout change. Current observations (2026-10-24): the Front page shows six equal tiles with Destination clamped to three lines and bar, count, Next box always visible, and an inbox band whose first card row is whole with the next row peeking; Now / Next / Later shows plan titles (not slugs), clean phase summaries, a Done column capped at six rows plus "+n more", and lanes and rail scrolling inside the page.
