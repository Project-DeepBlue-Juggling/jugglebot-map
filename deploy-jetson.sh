#!/usr/bin/env bash
# deploy-jetson.sh - (re)deploy jugglebot-map on the Jetson as USER systemd units (no sudo).
# Idempotent. Layout: app clone ~/map-live/jugglebot-map (this repo), data clone ~/map-live/Jugglebot.
set -euo pipefail

LIVE="$HOME/map-live"
APP="$LIVE/jugglebot-map"
DATA="$LIVE/Jugglebot"
PY="${MAP_PYTHON:-$HOME/Desktop/PDJ_venv/venv/bin/python}"
APP_URL="${MAP_APP_URL:-https://github.com/Project-DeepBlue-Juggling/jugglebot-map.git}"
DATA_URL="${MAP_DATA_URL:-https://github.com/Project-DeepBlue-Juggling/Jugglebot.git}"
UNIT_DIR="$HOME/.config/systemd/user"
UNITS=(jugglebot-map.service jugglebot-map-pull.service jugglebot-map-pull.timer)
say() { printf '\n== %s\n' "$*"; }

mkdir -p "$LIVE"
[ -d "$APP/.git" ] || { say "cloning app"; git clone -b main "$APP_URL" "$APP"; }
[ -d "$DATA/.git" ] || { say "cloning data"; git clone -b main "$DATA_URL" "$DATA"; }
say "git pull --ff-only (both)"
git -C "$APP" pull --ff-only
git -C "$DATA" pull --ff-only

say "building the frontend"
(cd "$APP/frontend" && npm ci && npm run build)

[ -x "$APP/.venv/bin/python" ] || { say "creating .venv from $PY"; "$PY" -m venv "$APP/.venv"; }
say "pip install -e ."
"$APP/.venv/bin/pip" install --quiet --upgrade pip
"$APP/.venv/bin/pip" install --quiet -e "$APP"

say "installing user units"
mkdir -p "$UNIT_DIR"
for u in "${UNITS[@]}"; do install -m 0644 "$APP/deploy/jetson/$u" "$UNIT_DIR/$u"; done
systemctl --user daemon-reload
systemctl --user enable --now jugglebot-map-pull.timer
systemctl --user restart jugglebot-map-pull.timer  # a changed OnCalendar takes effect now
systemctl --user enable --now jugglebot-map.service
systemctl --user restart jugglebot-map.service

say "status"
printf 'jugglebot-map.service     %s\n' "$(systemctl --user is-active jugglebot-map.service || true)"
printf 'jugglebot-map-pull.timer  %s\n' "$(systemctl --user is-active jugglebot-map-pull.timer || true)"
for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS http://127.0.0.1:8765/api/v1/health && { echo; exit 0; }
    sleep 1
done
echo "health check failed" >&2; exit 1
