# CLAUDE.md

jugglebot-map: a FastAPI server (`server/`) over a Jugglebot checkout's `map/` and `plans/`, plus the
frontend (`frontend/`).

- Run: `jugglebot-map --repo <checkout>` (port 8765, 127.0.0.1 unless `--host 0.0.0.0`, `--no-open`).
- Build: `cd frontend && npm ci && npm run build` (`frontend/dist` is gitignored).
- Test: `pytest -q` (the fixture checkout under `tests/fixtures/repo` is copied to a tmp dir; a real
  `mapkit` is copied in from `$MAPKIT_SRC` or a sibling Jugglebot checkout).
- Code must run on Python 3.8 (dev box) and 3.11+ (the Pi): `from __future__ import annotations`,
  `typing.Optional/List/Dict` in pydantic fields, no `match`.
- **Full-object rule:** the frontend's zod schemas require every declared field, so every response
  object carries every field in `server/models.py` (null where unknown, never omitted). Adding a field
  means adding it to the model, the store's renderer and the field-set test together.
- Parsing lives in the checkout's `mapkit`, never here; the server only maps it onto the API.
- Domain words follow the Jugglebot checkout's `GLOSSARY.md` (Pathway, Sitting, Throw, ...).
- No upstream names: the frontend's origin project, organisation, account and URL are never named anywhere in this repo (CI check).
- CI (`.github/workflows/ci.yml`): `python` (3.11, `pip install -e .[test]`, `pytest -q`), `frontend` (Node 22: lint, typecheck, vitest, build; every step skipped until `frontend/package.json` exists), `no-upstream-name`.
- `scripts/check_no_upstream_name.sh` greps tracked files for every regex in `scripts/upstream_name_patterns.txt` (the origin project and its organisations); none may appear anywhere in the repo, identifiers and file names included.
