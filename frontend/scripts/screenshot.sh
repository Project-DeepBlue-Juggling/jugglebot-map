#!/usr/bin/env bash
# Real layout check: build the app, serve it with the real map, and take 1500x900
# Firefox screenshots of the Front page and Now / Next / Later (happy-dom does no layout).
#
#   scripts/screenshot.sh <out-dir> [map-repo]
#
# Needs: firefox, python3, the server venv (JUGGLEMAP_VENV, default
# ~/Desktop/PDJ_venv/venv). Writes <out-dir>/front.png and <out-dir>/now.png.
set -euo pipefail
OUT=${1:?usage: screenshot.sh <out-dir> [map-repo]}
MAP_REPO=${2:-$HOME/Desktop/Jugglebot-map}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
VENV=${JUGGLEMAP_VENV:-$HOME/Desktop/PDJ_venv/venv}
SERVER_PORT=${SERVER_PORT:-8796}
WRAP_PORT=${WRAP_PORT:-8795}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)

(cd "$ROOT/frontend" && npm run build >/dev/null)

# A tiny wrapper page: the iframe plus a slow 1x1 image delays the load event so
# the app's data has arrived before Firefox takes the shot.
cat > "$OUT/wrap_server.py" <<PY
import sys, time, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
GIF = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        if u.path == "/slow":
            time.sleep(float(q.get("s", ["4"])[0])); self.send_response(200)
            self.send_header("Content-Type", "image/gif"); self.end_headers(); self.wfile.write(GIF)
        else:
            url = q.get("url", [""])[0]
            body = ('<!doctype html><html><body style="margin:0;background:#000"><iframe src="%s" '
                    'style="border:0;width:1500px;height:900px"></iframe><img src="/slow?s=%s" '
                    'width="1" height="1"></body></html>' % (url, q.get("d", ["4"])[0])).encode()
            self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers(); self.wfile.write(body)
HTTPServer(("127.0.0.1", $WRAP_PORT), H).serve_forever()
PY

fuser -k "$SERVER_PORT/tcp" "$WRAP_PORT/tcp" >/dev/null 2>&1 || true
# shellcheck disable=SC1091
source "$VENV/bin/activate"
(cd "$ROOT" && python -m server.cli --repo "$MAP_REPO" --port "$SERVER_PORT" --no-open --no-git >/dev/null 2>&1 &)
python3 "$OUT/wrap_server.py" >/dev/null 2>&1 &
WRAP_PID=$!
trap 'kill $WRAP_PID 2>/dev/null; fuser -k "$SERVER_PORT/tcp" >/dev/null 2>&1 || true' EXIT
sleep 3

PID=$(curl -s "http://localhost:$SERVER_PORT/api/v1/projects" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')
for pg in "front:" "now:/now"; do
  name=${pg%%:*}; sub=${pg#*:}
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "http://localhost:$SERVER_PORT/projects/$PID$sub")
  prof="$OUT/ffprof-$name"; rm -rf "$prof"; mkdir -p "$prof"
  MOZ_HEADLESS=1 timeout 120 firefox -headless -no-remote -profile "$prof" -window-size 1500,900 \
    -screenshot "$OUT/$name.png" "http://127.0.0.1:$WRAP_PORT/wrap?url=$enc&d=4" >/dev/null 2>&1
  rm -rf "$prof"
done
rm -f "$OUT/wrap_server.py"
echo "wrote $OUT/front.png and $OUT/now.png"
