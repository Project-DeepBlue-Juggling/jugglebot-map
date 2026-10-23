#!/usr/bin/env bash
# deploy.sh - (re)deploy jugglebot-map on the Pi. Run by hand over SSH from the
# fork checkout (~/jugglebot-map). Idempotent: every step is safe to repeat.
#
#   ./deploy.sh
#
# Steps: Node 22 (NodeSource) if node is missing or older; git pull --ff-only;
# frontend build when frontend/package.json exists; .venv + pip install -e .; the three
# systemd units copied to /etc/systemd/system; daemon-reload; enable --now the
# pull timer and the server; restart the server; print both is-active states.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
UNITS=(jugglebot-map.service jugglebot-map-pull.service jugglebot-map-pull.timer)
NODE_MAJOR=22

say() { printf '\n== %s\n' "$*"; }

node_major() {
    command -v node >/dev/null 2>&1 || { echo 0; return; }
    node --version | sed -E 's/^v([0-9]+).*/\1/'
}

if [ "$(node_major)" -lt "$NODE_MAJOR" ]; then
    say "installing Node ${NODE_MAJOR} from NodeSource (found: $(node --version 2>/dev/null || echo none))"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
else
    say "node $(node --version) is new enough"
fi

say "git pull --ff-only (jugglebot-map)"
git -C "$HERE" pull --ff-only

if [ -f "$HERE/frontend/package.json" ]; then
    say "building the frontend"
    (cd "$HERE/frontend" && npm ci && npm run build)
fi

if [ ! -x "$HERE/.venv/bin/python" ]; then
    say "creating .venv"
    python3 -m venv "$HERE/.venv"
fi
say "pip install -e ."
"$HERE/.venv/bin/pip" install --quiet --upgrade pip
"$HERE/.venv/bin/pip" install --quiet -e "$HERE"

say "installing systemd units"
for u in "${UNITS[@]}"; do
    sudo install -m 0644 "$HERE/deploy/$u" "/etc/systemd/system/$u"
done
sudo systemctl daemon-reload
sudo systemctl enable --now jugglebot-map-pull.timer
sudo systemctl enable --now jugglebot-map.service
sudo systemctl restart jugglebot-map.service

say "status"
printf 'jugglebot-map.service     %s\n' "$(systemctl is-active jugglebot-map.service || true)"
printf 'jugglebot-map-pull.timer  %s\n' "$(systemctl is-active jugglebot-map-pull.timer || true)"
