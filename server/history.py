"""Item history: the commits that touched an item file and the documents they name.

Read-only and computed from the server's own clone with ``git log --follow``;
the result is cached per (task id, HEAD), so a pull or a map-bot commit (HEAD
moves) invalidates it without any hook into the watcher. Every git call is a
list-argv ``subprocess`` with a timeout; the only string that reaches git as a
path is the node's own file, never a request value.
"""
from __future__ import annotations

import os
import re
import subprocess
import threading
from typing import Any, Dict, List, Optional, Tuple

GIT_TIMEOUT_S = 10
ENV_WEB_BASE = "MAP_WEB_BASE"
_SEP = "\x1f"
_REC = "\x1e"
_FMT = _SEP.join(["%H", "%h", "%aI", "%s", "%(trailers:key=Logbook-Entry,valueonly,separator=%x2c)"]) + _REC
_SLUG = re.compile(r"^[A-Za-z0-9._-]+$")


def _git(repo: str, *args: str) -> Optional[str]:
    try:
        p = subprocess.run(["git", "-C", repo] + list(args), capture_output=True, text=True,
                           timeout=GIT_TIMEOUT_S)
    except (OSError, subprocess.SubprocessError):
        return None
    return p.stdout if p.returncode == 0 else None


def head_sha(repo: str) -> str:
    out = _git(repo, "rev-parse", "HEAD")
    return out.strip() if out else ""


def web_base(repo: str) -> Optional[str]:
    """Prefix a repo-relative path is appended to: ``MAP_WEB_BASE``, else the origin's GitHub blob URL."""
    env = (os.environ.get(ENV_WEB_BASE) or "").strip()
    if env:
        return env.rstrip("/")
    out = _git(repo, "remote", "get-url", "origin")
    url = (out or "").strip()
    if not url:
        return None
    m = re.match(r"^(?:https?://(?:[^@/]+@)?|ssh://git@|git@)([^/:]+)[:/](.+?)(?:\.git)?/?$", url)
    if not m:
        return None
    return "https://%s/%s/blob/main" % (m.group(1), m.group(2))


def _title(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("# "):
                    return line[2:].strip()
    except OSError:
        pass
    return os.path.basename(path)


def _kind(rel: str) -> str:
    if rel.startswith("logbook/"):
        return "logbook"
    if rel.startswith("plans/"):
        return "plan"
    return "other"


def _safe_rel(link: str) -> Optional[str]:
    """A link as a repo-relative .md path, or None (URLs, absolute and ``..`` paths are not)."""
    if "://" in link or link.startswith(("/", "~")) or not link.endswith(".md"):
        return None
    rel = os.path.normpath(link).replace(os.sep, "/")
    return None if rel.startswith("..") else rel


class HistoryCache:
    def __init__(self, repo_root: str) -> None:
        self.repo_root = repo_root
        self._lock = threading.Lock()
        self._cache: Dict[str, Tuple[str, Dict[str, Any]]] = {}

    def get(self, task_id: str, item_path: str, links: List[str]) -> Dict[str, Any]:
        head = head_sha(self.repo_root)
        key = task_id
        with self._lock:
            hit = self._cache.get(key)
            if hit is not None and hit[0] == head and head:
                return hit[1]
        value = self._compute(head, item_path, links)
        with self._lock:
            self._cache[key] = (head, value)
        return value

    def _compute(self, head: str, item_path: str, links: List[str]) -> Dict[str, Any]:
        rel = os.path.relpath(item_path, self.repo_root).replace(os.sep, "/")
        commits: List[Dict[str, Any]] = []
        out = _git(self.repo_root, "log", "--follow", "--format=" + _FMT, "--", rel) if head else None
        for rec in (out or "").split(_REC):
            rec = rec.strip("\n")
            if not rec:
                continue
            parts = rec.split(_SEP)
            if len(parts) < 5:
                continue
            entry = parts[4].split(",")[0].strip() or None
            commits.append({"sha": parts[0], "short": parts[1], "date": parts[2],
                            "subject": parts[3], "logbook_entry": entry})
        paths: List[str] = []
        for c in commits:  # newest first, so the freshest entry leads
            e = c["logbook_entry"]
            if e and _SLUG.match(e):
                p = "logbook/%s.md" % (e[:-3] if e.endswith(".md") else e)
                if p not in paths:
                    paths.append(p)
        for link in links:
            p = _safe_rel(str(link))
            if p and p not in paths:
                paths.append(p)
        base = web_base(self.repo_root)
        docs = []
        for p in paths:
            full = os.path.join(self.repo_root, p)
            exists = os.path.isfile(full)
            docs.append({"kind": _kind(p), "path": p, "title": _title(full) if exists else os.path.basename(p),
                         "exists": exists, "url": "%s/%s" % (base, p) if base else None})
        return {"head": head, "commits": commits, "documents": docs}
