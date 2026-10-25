#!/usr/bin/env bash
# Fast-forward the data clone; restart the server when the pull changed mapkit/.
# The server imports the checkout's mapkit once at start-up, so without the restart it keeps
# serving the old parser after the pull brings a new one.
# Env: DATA_REPO (default ~/map-live/Jugglebot), MAP_SERVICE (default jugglebot-map).
set -u
REPO="${DATA_REPO:-$HOME/map-live/Jugglebot}"
SERVICE="${MAP_SERVICE:-jugglebot-map}"
export GIT_TERMINAL_PROMPT=0
before="$(git -C "$REPO" rev-parse HEAD)" || exit 1
# --ff-only: never merges or rebases; refuses (non-zero) while the server holds an unpushed map-bot commit.
git -C "$REPO" pull --ff-only || exit $?
after="$(git -C "$REPO" rev-parse HEAD)"
if [ "$before" != "$after" ] && ! git -C "$REPO" diff --quiet "$before" "$after" -- mapkit; then
    echo "mapkit/ changed ($before -> $after): restarting $SERVICE"
    systemctl --user restart "$SERVICE"
fi
