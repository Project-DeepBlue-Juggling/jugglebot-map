#!/usr/bin/env bash
# Start the real server on a temp copy of the fixture repo and run the frontend's live contract check.
# Needs MAPKIT_SRC (a Jugglebot checkout root) unless a sibling ../Jugglebot exists.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8799}"
TMP="$(mktemp -d)"
trap 'kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$TMP"' EXIT
python - "$TMP/repo" <<'PY'
import sys
sys.path.insert(0, "tests")
import conftest
conftest.make_repo(sys.argv[1])
PY
python -m server.cli --repo "$TMP/repo" --port "$PORT" --no-open --no-git &
SERVER_PID=$!
for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/api/v1/health" >/dev/null && break; sleep 0.2; done
cd frontend
CONTRACT_BASE_URL="http://127.0.0.1:$PORT" npm run contract
