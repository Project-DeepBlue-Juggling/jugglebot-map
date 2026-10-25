"""Nightly status: the 04:00 full-tier run's ``status`` line, read by a timer.

``MAP_NIGHTLY_DIR`` names the live checkout's ``temp/reports/nightly``; unset
means NEVER and ``configured`` false. The directory is only ever read, never
written. A background thread re-reads it every 60 s and requests are answered
from the cached value, so a slow disk can never block one. The STALE and NEVER
rules follow ``tools/nightly_ticker.sh`` (date older than two days; no status
file); the line format is ``GREEN|RED|DEFERRED <counts> <iso-date>``.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("jugglebot_map")

ENV_DIR = "MAP_NIGHTLY_DIR"
REFRESH_S = 60.0
STALE_AFTER_DAYS = 2
KNOWN = ("GREEN", "RED", "DEFERRED")


def _parse_date(token: str) -> Optional[datetime]:
    try:
        d = datetime.fromisoformat(token.replace("Z", "+00:00"))
    except ValueError:
        try:
            d = datetime.combine(date.fromisoformat(token), datetime.min.time())
        except ValueError:
            return None
    return d if d.tzinfo else d.astimezone()  # naive = local time, as `date -d` reads it


def read_status(directory: Optional[str], now: Optional[datetime] = None) -> Dict[str, Any]:
    """One reading of ``<directory>/status``; touches the disk, so only the refresher calls it."""
    never = {"state": "NEVER", "line": None, "date": None, "age_days": None,
             "configured": bool(directory)}
    if not directory:
        return never
    try:
        with open(os.path.join(directory, "status"), encoding="utf-8") as fh:
            line = fh.readline().strip()
    except OSError:
        return never
    if not line:
        return never
    tokens = line.split()
    state = tokens[0] if tokens[0] in KNOWN else "NEVER"
    when = _parse_date(tokens[-1]) if len(tokens) > 1 else None
    out = {"state": state, "line": line, "date": when.date().isoformat() if when else None,
           "age_days": None, "configured": True}
    if when is not None:
        age = (now or datetime.now(timezone.utc)) - when
        out["age_days"] = max(age.days, 0)
        if age.total_seconds() > STALE_AFTER_DAYS * 86400:
            out["state"] = "STALE"
    return out


def read_latest(directory: Optional[str]) -> Optional[str]:
    if not directory:
        return None
    try:
        with open(os.path.join(directory, "latest.md"), encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return None


class NightlyCache:
    def __init__(self, directory: Optional[str] = None, refresh_s: float = REFRESH_S) -> None:
        self.directory = directory if directory is not None else (os.environ.get(ENV_DIR) or None)
        self.refresh_s = refresh_s
        self._lock = threading.Lock()
        self._status = read_status(self.directory)  # first read at construction
        self._latest = read_latest(self.directory)
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def refresh(self) -> None:
        status, latest = read_status(self.directory), read_latest(self.directory)
        with self._lock:
            self._status, self._latest = status, latest

    def status(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._status)

    def latest(self) -> Optional[str]:
        with self._lock:
            return self._latest

    def start(self) -> None:
        if not self.directory or self._thread is not None:
            return

        def loop() -> None:
            while not self._stop.wait(self.refresh_s):
                try:
                    self.refresh()
                except Exception:
                    log.exception("jugglebot-map: nightly status refresh failed")

        self._thread = threading.Thread(target=loop, name="nightly-status", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
