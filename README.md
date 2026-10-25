# jugglebot-map

A viewer and editor for a Jugglebot checkout's project map: the `map/` items (pathways, ideas, features,
bugs, tickets) and the plans on `plans/active`, `plans/parked` and `plans/archived`. One Python process
(FastAPI + uvicorn) serves a file-backed API under `/api/v1` and the built frontend from `frontend/dist`.
The files in the checkout are the only state: every edit is written straight to the item's markdown file.

Licence: MIT (`LICENSE`).

## Run

```bash
pip install -e .                       # once, into a venv (Python 3.11+; the dev box also runs 3.8)
jugglebot-map --repo ~/Desktop/Jugglebot          # or JUGGLEBOT_REPO=... jugglebot-map
jugglebot-map --repo ~/map-live/Jugglebot --host 0.0.0.0 --no-open   # the Jetson
```

`--port` defaults to 8765; the bind is 127.0.0.1 unless `--host 0.0.0.0`; a browser opens unless
`--no-open`. `--no-git` turns the git writer off (it is off anyway when the checkout has no `origin`
remote: dev mode); `--debounce-ms` (default 5000) and `--watch-ms` (default 300) set the commit and
invalidate windows. The server refuses to start (exit 2) when the checkout has no `map/config.yaml`, and it
imports the checkout's own `mapkit` parser by putting the checkout root on `sys.path` (no install step).

Three optional environment variables:

- `MAP_NIGHTLY_DIR` - the live checkout's `temp/reports/nightly`. Unset means the header chip reads NEVER
  and `GET /api/v1/nightly` says `configured: false`. The server only reads `status` and `latest.md` there
  (on a 60 s timer, never inside a request) and never writes.
- `MAP_WEB_BASE` - the URL prefix the History section links repo documents under, e.g.
  `https://github.com/org/repo/blob/main`. Unset, it is derived from the `origin` remote (https or
  `git@` form); with no remote the links are null.
- `MAP_CORS_ORIGINS` - comma-separated browser origins allowed to call the API cross-origin (the Jugglebot
  GUI files items this way). Unset means no CORS headers at all.

## Build the frontend

```bash
cd frontend && npm ci && npm run build      # writes frontend/dist (gitignored)
```

Without `frontend/dist` the server still serves the API; `GET /` answers "run `npm run build`" and the
same line is printed at startup. With it, any browser navigation outside `/api/` gets `index.html`.

## Test

```bash
pip install -e ".[test]"
pytest -q
```

The contract suite copies `tests/fixtures/repo` into a temporary directory (writes never touch the
checkout) and copies a real `mapkit` into it from `$MAPKIT_SRC` (a Jugglebot checkout root), else a
sibling `../Jugglebot` or `../Jugglebot-map`; it skips when none is found. CI clones Jugglebot's `main`
shallowly into `/tmp/jb` and sets `MAPKIT_SRC=/tmp/jb`, so pytest does not skip there.

The live contract check (`bash scripts/contract_check.sh`, needs Node and `MAPKIT_SRC`) starts the real
server on a temp copy of the fixture repo and parses every GET response with the frontend's zod
schemas (`frontend/src/api/contract.live.test.ts`, also `npm run contract` with `CONTRACT_BASE_URL`
set); a key the server sends and the schema lacks, or the reverse, fails it. CI runs it after pytest.

## API summary

All under `/api/v1` (the bare path works too). Every response object carries every declared field
(the full-object rule; see `server/models.py`).

| Endpoint | 2xx | 4xx |
|---|---|---|
| `GET /users`, `GET\|PATCH /users/me` | users; me | |
| `GET /projects`, `GET /projects/{p}`, `GET /projects/{p}/memberships` | one project, two admin memberships | 404 unknown project |
| `GET /projects/{p}/tasks` | every item, plan and plan step as a Task | |
| `POST /projects/{p}/tasks` | 201 Task (new `map/<kind>-<slug>.md`) | 405 plan/phase kind; 422 schema error |
| `GET /projects/{p}/tasks/{id}` | Task + `blocking` + `blocked_by` | 404 |
| `PATCH /projects/{p}/tasks/{id}` | Task (file rewritten, `updated` bumped) | 409 modified / reparent cycle / pathway live plans; 405 plan/phase; 422 |
| `DELETE /projects/{p}/tasks/{id}` | 204 (file removed) | 409 modified / children or dependencies; 405 plan/phase |
| `GET\|POST /projects/{p}/dependencies`, `DELETE .../dependencies/{id}` | list; 201 Dependency; 204 | 409 cycle; 405 plan/phase as the blocked side; 404 |
| `GET /health` | `{"status": "ok"\|"degraded", "errors": [{"path", "message"}], "banner": {"level": "error"\|"warning"\|null, "message", "since"}}` | |
| `GET /events` | SSE: one `event: invalidate` per burst of changes (API edit or file on disk) | |

Quiet stubs: `POST /projects/{p}/undo` 404 "Nothing to undo"; comments `[]`; notifications `[]`;
`unread_count` `{"count": 0}`; `notifications/stream` 404; `/users/me/tasks` `[]`.

Identity: an item's id is `uuid5(mapkit ITEM_NAMESPACE, slug)`, a plan's the same of its filename, a plan
step's of `<filename>#<normalised step id>`. Plans and steps are read-only here (edit the plan file);
their `editable` is false.

Short IDs: every Item also carries `short_id` (`JB-<n>`, frontmatter `id:`, from `mapkit.ids`; `null` for
plans, phases and an Item without one). `/tasks/{task_id}` accepts the uuid or the short ID (`JB-12`,
`jb12`, any case); a bare `12` is accepted on GET only, and PATCH and DELETE answer 422 for it. A
duplicated ID answers 409 and shows on `/health`. `POST /tasks` allocates the next ID (1 + max over the
index, the `id:` lines of files the index skipped, and `origin/main`) and refuses a supplied one (422); a
PATCH whose `id` or `short_id` differs from the current value is 422. The git writer, after its
`pull --rebase`, renumbers every Item it added and has not pushed whose ID the rebase brought in on another
file (`map: renumber JB-a -> JB-b <stem>`, its own commit) and refreshes the index; its other subjects stay
`map: <titles>` with no ID. The renumber loads `map/` leniently, like the index: a malformed Item is
skipped but its `id:` line still counts, so it neither stops the push nor gets its ID handed out again.
`unpushed` is true for an Item this clone filed whose push has not landed (from git at start, so it
survives a restart): its short ID is provisional, the UI shows it muted with an "unsent" marker, and the
drawer writes that Item's uuid into `?item=` (a renumber must not reopen the drawer on another writer's
Item), switching to `?item=JB-<n>` once the push lands. A bare page link keeps its page and query through the
redirect to the project (`/now?item=JB-5`). The server needs a checkout whose `mapkit` has
`ids.py`.

The conflict token is the task's `updated_at`: send it as
`if_unchanged_since` (body field or query parameter) on PATCH or DELETE, and a mismatch answers
`409 {"detail": "Task was modified", "current": <Task>}`. Closing or dropping a pathway that still has
an active or parked plan answers the delete-conflict shape with detail "Pathway still has live plans"
and the plans under `children`.

## Parse errors (the minimum)

A hand-edited file that does not parse (bad YAML, a status outside its kind's set, a missing required
field, a filename/kind mismatch, two items sharing a slug) is skipped and the rest of the map keeps being
served. `GET /health` then answers `{"status": "degraded", "errors": [{"path", "message"}]}` with the
repo-relative path and the parser's message. A write whose result would not parse is refused with 422
before the file is touched. The in-app banner for a degraded health is a later phase.

## Live updates and the git writer

A `watchdog` observer on `map/`, the three plan directories and `GLOSSARY.md` rebuilds the index 300 ms
after the last filesystem event and sends exactly one `invalidate` on `/events`; the server's own writes
join the same window, so an API edit is one event, not two.

When the checkout has an `origin` remote (and `--no-git` is not given) the server commits: 5 s after the
last API edit it runs

```
git add -A -- map
git commit -m "map: <titles>" -- map          # author and committer map-bot <map-bot@jugglebot.local>
git pull --rebase --no-autostash origin main  # on failure: git rebase --abort (if a rebase is in progress)
git push origin HEAD:refs/heads/main
```

The subject is the changed items' titles joined by `; ` (72 characters at most, `...` when cut); there is
no `Logbook-Entry` trailer and the generator is not run (`docs/project-map.md` is regenerated upstream).
A failed pull (a conflict) or push never discards anything: the rebase is aborted, the local commit and
the working tree stay, `/health`'s `banner` turns `error` with the operation and git's stderr tail, and
the next edit retries (the next success clears the banner). Any other failure in the flush, the short-ID
renumber included, sets the same banner. A `map/` file left uncommitted by a process that died inside the
5 s window is committed at the next start without waiting for an edit (an untracked one is a new Item and
counts as `unpushed` until its push lands). Only `main` is written: on another branch the writer refuses
to start, the banner is a `warning` and every write answers 403.

## Jetson runbook

Hosted on the robot Jetson (user `jetson`, LAN IP 192.168.20.34) as **user** systemd units (no sudo; linger
keeps them running). The server is deliberately cheap (idle ~0.3 % of one core, ~58 MB) and the unit pins it
behind the robot: `Nice=10`, `CPUWeight=20`, `IOWeight=20`, `CPUQuota=20%`, `MemoryMax=300M`.

Layout, all under `~/map-live/` (the map server must never write to the robot's `~/Desktop/Jugglebot`):

- `~/map-live/jugglebot-map` - clean clone of this repo on `main`, with its own `.venv` (built from the PDJ
  interpreter, Python 3.11+) and the built `frontend/dist`;
- `~/map-live/Jugglebot` - the data clone on `main` whose `map/` is served and committed (pushes use the
  global `credential.helper store`, https; commits are authored `map-bot`).

```bash
git clone -b main https://github.com/Project-DeepBlue-Juggling/jugglebot-map.git ~/map-live/jugglebot-map
~/map-live/jugglebot-map/deploy-jetson.sh      # clones the data repo if missing; idempotent, rerun after every fork change
```

`deploy-jetson.sh` fast-forwards both clones, builds the frontend (the installed Node 22), creates `.venv` and
`pip install -e .`, installs `deploy/jetson/*` into `~/.config/systemd/user/`, enables the pull timer and the
server, restarts the server, prints `is-active` for both and curls `/api/v1/health`.

`jugglebot-map-pull.timer` runs `deploy/jetson/pull.sh` every 2 minutes: `git pull --ff-only` on the data
clone (never merges; while an unpushed `map-bot` commit waits it fails until the server's retry lands). When
the pull changed `mapkit/` it also runs `systemctl --user restart jugglebot-map`, because the server imports
the checkout's mapkit once at start-up (`tests/test_pull_restart.py`).

Acceptance checks:

1. A phone on the LAN opens `http://192.168.20.34:8765` (or `http://<jetson-hostname>.local:8765`).
2. An edit in the browser lands on `main` within 10 s as `map-bot` (`git log -1 --format='%an %s' origin/main`
   after a fetch).
3. A file edited by hand in `~/map-live/Jugglebot/map/` shows in the open page within 1 s.
4. `/inbox` from another checkout (commit + push there) appears within about 2 minutes (the pull timer).
5. A forced conflict (`systemctl --user stop jugglebot-map-pull.timer`, push a title change from another
   checkout, then edit that title in the browser; start the timer again) shows the red banner and keeps the
   edit on disk and in a local commit; resolve by hand in `~/map-live/Jugglebot` and the next edit clears it.

When a check fails: `journalctl --user -u jugglebot-map -e` (startup lines say whether the git writer is on,
off or REFUSED), `journalctl --user -u jugglebot-map-pull -e`, `systemctl --user list-timers`,
`curl -s http://127.0.0.1:8765/api/v1/health`, `git -C ~/map-live/Jugglebot status -sb`.

### Retiring the Pi

After the Jetson serves correctly, on `jeeves` (owner-run):

```bash
sudo systemctl disable --now jugglebot-map.service jugglebot-map-pull.timer
```
