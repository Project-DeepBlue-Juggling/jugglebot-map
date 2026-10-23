"""Server-sent events: one ``invalidate`` event per index change (``GET /events``).

Each connected client owns an asyncio queue. :meth:`Broker.publish` is safe to
call from any thread (the write path, later the P5 watcher): it hands the
event to each client's loop with ``call_soon_threadsafe``.
"""
from __future__ import annotations

import asyncio
import threading
from typing import AsyncIterator, List, Tuple

HEARTBEAT_S = 15.0


class Broker:
    def __init__(self) -> None:
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
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=HEARTBEAT_S)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield "event: %s\ndata: {}\n\n" % ev
        finally:
            with self._lock:
                if entry in self._clients:
                    self._clients.remove(entry)
