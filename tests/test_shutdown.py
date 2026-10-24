"""SIGTERM with a browser holding /events open exits within the grace period.

Before the fix uvicorn waited on the open stream until systemd's 90 s SIGKILL,
so every deploy took the map offline for 90 s (Pi redeploy, 2026-10-24).
"""
from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time

from tests.conftest import FORK
from server.cli import SHUTDOWN_GRACE_S


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_sigterm_with_an_open_event_stream_exits_promptly(repo):
    port = _free_port()
    proc = subprocess.Popen(
        [sys.executable, "-m", "server.cli", "--repo", repo, "--port", str(port),
         "--no-open", "--no-git"],
        cwd=FORK, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sock = None
    try:
        deadline = time.monotonic() + 20
        while sock is None:
            try:
                sock = socket.create_connection(("127.0.0.1", port), timeout=1)
            except OSError:
                assert time.monotonic() < deadline, "server never listened"
                time.sleep(0.1)
        sock.sendall(b"GET /api/v1/events HTTP/1.1\r\nHost: x\r\n\r\n")
        sock.settimeout(10)
        assert b": connected" in sock.recv(4096) or b": connected" in sock.recv(4096)
        t0 = time.monotonic()
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=SHUTDOWN_GRACE_S + 10)
        assert time.monotonic() - t0 < SHUTDOWN_GRACE_S + 5
    finally:
        if sock is not None:
            sock.close()
        if proc.poll() is None:
            proc.kill()
            proc.wait()
