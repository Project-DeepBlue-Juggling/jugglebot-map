"""Server-sent events: one ``invalidate`` event per index change (``GET /events``).

Every connection opens with ``hello`` (data: the frontend ``build`` id, null
without a built frontend) and gets a ``ping`` event every ``HEARTBEAT_S``. Both
are named events, not comments, so the page sees them: ``hello`` on a reconnect
means it may have missed an ``invalidate`` (it refetches) or the app was
redeployed (a different build: it opens the new one), and a silent gap of three
heartbeats means the connection is dead (it reopens it).

Each connected client owns an asyncio queue. :meth:`Broker.publish` is safe to
call from any thread (the write path, later the P5 watcher): it hands the
event to each client's loop with ``call_soon_threadsafe``.
"""
from __future__ import annotations

import asyncio
import json
import threading
from typing import AsyncIterator, List, Optional, Tuple

HEARTBEAT_S = 15.0


class Broker:
    def __init__(self, build: Optional[str] = None) -> None:
        self.build = build
        self._lock = threading.Lock()
        self._clients: List[Tuple[asyncio.AbstractEventLoop, "asyncio.Queue[str]"]] = []

    @property
    def client_count(self) -> int:
        with self._lock:
            return len(self._clients)

    def publish(self, event: str = "invalidate") -> None:
        with self._lock:
            clients = list(self._clients)
        for loop, q in clients:
            try:
                loop.call_soon_threadsafe(q.put_nowait, event)
            except RuntimeError:  # loop closed: the client is gone
                pass

    async def stream(self) -> AsyncIterator[str]:
        """SSE text chunks for one client, until it disconnects."""
        loop = asyncio.get_running_loop()
        q: "asyncio.Queue[str]" = asyncio.Queue()
        entry = (loop, q)
        with self._lock:
            self._clients.append(entry)
        try:
            yield ": connected\n\n"
            yield "event: hello\ndata: %s\n\n" % json.dumps({"build": self.build})
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=HEARTBEAT_S)
                except asyncio.TimeoutError:
                    yield "event: ping\ndata: {}\n\n"
                    continue
                yield "event: %s\ndata: {}\n\n" % ev
        finally:
            with self._lock:
                if entry in self._clients:
                    self._clients.remove(entry)
