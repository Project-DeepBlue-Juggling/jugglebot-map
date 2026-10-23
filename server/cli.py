"""``jugglebot-map``: one uvicorn process serving the API and the built frontend."""
from __future__ import annotations

import argparse
import sys
import threading
import webbrowser
from typing import List, Optional

from server.config import ENV_REPO, ConfigError, setup
from server.gitwriter import DEFAULT_DEBOUNCE_MS
from server.watcher import DEFAULT_WATCH_MS

DEFAULT_PORT = 8765


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="jugglebot-map", description=__doc__)
    p.add_argument("--repo", help="Jugglebot checkout (default: $%s)" % ENV_REPO)
    p.add_argument("--port", type=int, default=DEFAULT_PORT, help="default %(default)s")
    p.add_argument("--host", default="127.0.0.1",
                   help="bind address (default %(default)s; 0.0.0.0 on the Pi)")
    p.add_argument("--no-open", action="store_true", help="do not open a browser")
    p.add_argument("--no-git", action="store_true",
                   help="never commit or push (the default when the checkout has no origin remote)")
    p.add_argument("--debounce-ms", type=int, default=DEFAULT_DEBOUNCE_MS,
                   help="commit this long after the last API edit (default %(default)s)")
    p.add_argument("--watch-ms", type=int, default=DEFAULT_WATCH_MS,
                   help="invalidate this long after the last file change (default %(default)s)")
    return p


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        cfg = setup(args.repo)
    except ConfigError as exc:
        print("jugglebot-map: %s" % exc, file=sys.stderr)
        return 2
    import uvicorn

    from server.app import BUILD_HINT, create_app

    app = create_app(cfg, git=False if args.no_git else None,
                     debounce_ms=args.debounce_ms, watch_ms=args.watch_ms)
    w = app.state.writer
    print("jugglebot-map: git writer %s" % (
        "off (--no-git or no origin remote)" if w is None else
        ("on (map-bot -> origin/main)" if w.enabled else "REFUSED: " + app.state.banner.get()["message"])),
        flush=True)
    if not app.state.have_dist:
        print("jugglebot-map: %s" % BUILD_HINT, flush=True)
    url = "http://%s:%d/" % ("localhost" if args.host in ("127.0.0.1", "0.0.0.0") else args.host,
                             args.port)
    print("jugglebot-map: serving %s on %s" % (cfg.repo_root, url), flush=True)
    if not args.no_open:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
