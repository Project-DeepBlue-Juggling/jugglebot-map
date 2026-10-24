# Jugglebot map frontend

A Vite + React + TypeScript single-page app for the Jugglebot map. In production the Python server serves the built `frontend/dist` and the API (`/api/v1`) from the same origin on port 8765. There is no sign-in: the signed-in user is whatever `GET /users/me` returns.

Right now the app is the shell (API client, schemas, TanStack Query hooks, item detail panel, new-item modal, search, theme) plus two placeholder routes, `/` (front page) and `/now` (Now / Next / Later).

```bash
npm ci                     # install
npm run dev                # dev server; proxies /api to the Python server on http://localhost:8765
npm run build              # typecheck, then build into dist/
npm run test -- --run      # vitest
npm run lint
npm run typecheck
```
