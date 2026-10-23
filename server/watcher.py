"""Filesystem watcher: a burst of changes -> one index rebuild -> one ``invalidate``.

``watchdog`` observes ``map/``, the plan directories and ``GLOSSARY.md`` (the
repo root is watched non-recursively and filtered to that one name). Every
event, and every :meth:`Watcher.poke` from the server's own writes, restarts a
single ``watch_ms`` timer; when it expires the store's cached index is dropped,
rebuilt, and the broker publishes exactly one ``invalidate``. An API edit
therefore produces one event even though its file write is also seen by
inotify: both land in the same window.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any, Callable, List, Optional

log = logging.getLogger("jugglebot_map")

DEFAULT_WATCH_MS = 300
ROOT_FILES = ("GLOSSARY.md",)


class Debouncer:
    """Run ``fn`` once, ``delay_s`` after the LAST :meth:`trigger` call."""

    def __init__(self, delay_s: float, fn: Callable[[], None], name: str = "debounce") -> None:
        self.delay_s = delay_s
        self._fn = fn
        self._name = name
        self._lock = threading.Lock()
        self._timer: Optional[threading.Timer] = None
        self._closed = False

    def trigger(self) -> None:
        with self._lock:
            if self._closed:
                return
            if self._timer is not None:
                self._timer.cancel()
            t = threading.Timer(self.delay_s, self._fire)
            t.daemon = True
            t.name = self._name
            self._timer = t
            t.start()

    def _fire(self) -> None:
        with self._lock:
            self._timer = None
        try:
            self._fn()
        except Exception:  # a failed callback must not kill later triggers
            log.exception("%s callback failed", self._name)

    def pending(self) -> bool:
        with self._lock:
            return self._timer is not None

    def close(self) -> None:
        with self._lock:
            self._closed = True
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None


class Watcher:
    """Owns the watchdog observer and the coalescing timer for one store."""

    def __init__(self, store: Any, publish: Callable[[], None],
                 watch_ms: int = DEFAULT_WATCH_MS) -> None:
        self.store = store
        self._publish = publish
        self._debounce = Debouncer(watch_ms / 1000.0, self._flush, name="map-watch")
        self._observer: Any = None
        self.running = False
        cfg = store.cfg
        self.dirs: List[str] = [d for d in [cfg.items_dir] + list(cfg.plan_dirs) if os.path.isdir(d)]
        self.root_files = [os.path.join(cfg.repo_root, n) for n in ROOT_FILES]

    # --- event intake -------------------------------------------------------
    def poke(self) -> None:
        """Called by the store after its own write (same window as the inotify event)."""
        self._debounce.trigger()

    def _relevant(self, path: str) -> bool:
        if not path:
            return False
        path = os.path.abspath(path)
        if os.sep + ".git" + os.sep in path or path.endswith(os.sep + ".git"):
            return False
        if path in self.root_files:
            return True
        parent = os.path.dirname(path)
        return parent in self.dirs

    def _on_event(self, event: Any) -> None:
        paths = [getattr(event, "src_path", ""), getattr(event, "dest_path", "")]
        if any(self._relevant(p) for p in paths if isinstance(p, str)):
            self._debounce.trigger()

    def _flush(self) -> None:
        self.store.invalidate(publish=False)
        self.store.index()  # rebuild now, so the refetch the event causes is served warm
        self._publish()

    # --- lifecycle ----------------------------------------------------------
    def start(self) -> None:
        from watchdog.events import FileSystemEventHandler
        from watchdog.observers import Observer

        watcher = self

        class _Handler(FileSystemEventHandler):
            def on_any_event(self, event: Any) -> None:  # noqa: D401
                if event.event_type in ("opened", "closed_no_write"):
                    return
                watcher._on_event(event)

        obs = Observer()
        handler = _Handler()
        for d in self.dirs:
            obs.schedule(handler, d, recursive=False)
        obs.schedule(handler, self.store.cfg.repo_root, recursive=False)
        obs.daemon = True
        obs.start()
        self._observer = obs
        self.running = True

    def stop(self) -> None:
        self.running = False
        self._debounce.close()
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None
