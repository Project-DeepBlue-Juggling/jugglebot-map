"""The Pi's write path: debounced ``map-bot`` commit, ``pull --rebase``, push to ``main``.

Decision #31. ``debounce_ms`` after the LAST edit made through the API the
writer runs, in order::

    git add -A -- map
    git commit -m "map: <titles>" -- map            (as map-bot, no trailer)
    git pull --rebase origin main
      on failure: git rebase --abort                 (only when a rebase is in progress)
    git push origin HEAD:refs/heads/main

Safety rules, each pinned by a test:

* a local edit is never discarded: nothing here resets, checks out or cleans;
  a failed rebase is aborted, which restores the pre-pull HEAD (the local
  commit) and its working tree;
* the repo is never left mid-rebase;
* a failure sets the banner (operation + git stderr tail); the next success
  clears it; the next edit retries (the local commit stays ahead of
  ``origin/main`` and is pushed then);
* only ``main`` is written: on another branch the writer refuses to start and
  the server serves read-only under a warning banner.

The commit does NOT run the generator (#32): only ``map/`` is staged. The
store's lock is held from ``add`` through ``pull --rebase`` (the rebase rewrites
working-tree files, so an API write must not interleave); it is released for
the push, which does not touch the tree.
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import subprocess
import threading
from collections import OrderedDict
from typing import Any, Dict, List, Optional

from server.watcher import Debouncer

log = logging.getLogger("jugglebot_map")

BOT_NAME = "map-bot"
BOT_EMAIL = "map-bot@jugglebot.local"
BRANCH = "main"
REMOTE = "origin"
DEFAULT_DEBOUNCE_MS = 5000
SUBJECT_MAX = 72
GIT_TIMEOUT_S = 60.0
STDERR_TAIL = 400


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class Banner:
    """The one operator-visible failure line; thread-safe."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: Dict[str, Any] = {"level": None, "message": "", "since": None}

    def set(self, level: str, message: str) -> None:
        with self._lock:
            if self._state["level"] == level and self._state["message"] == message:
                return  # keep the original `since` for a repeating failure
            self._state = {"level": level, "message": message, "since": _now()}

    def clear(self) -> None:
        with self._lock:
            self._state = {"level": None, "message": "", "since": None}

    def get(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._state)


class GitError(RuntimeError):
    def __init__(self, op: str, proc: "subprocess.CompletedProcess[str]") -> None:
        tail = ((proc.stderr or "") + (proc.stdout or "")).strip()[-STDERR_TAIL:]
        super().__init__("%s failed (exit %s): %s" % (op, proc.returncode, tail))
        self.op = op


def subject(titles: List[str]) -> str:
    """``map: <titles joined by '; '>``, at most 72 characters, ``...`` when cut."""
    s = "map: " + "; ".join(titles)
    if len(s) > SUBJECT_MAX:
        s = s[:SUBJECT_MAX - 3].rstrip() + "..."
    return s


def has_origin(repo_root: str) -> bool:
    """True when ``repo_root`` is a git checkout with an ``origin`` remote."""
    if not os.path.exists(os.path.join(repo_root, ".git")):
        return False
    try:
        p = subprocess.run(["git", "-C", repo_root, "config", "--get", "remote.%s.url" % REMOTE],
                           capture_output=True, text=True, timeout=GIT_TIMEOUT_S)
    except (OSError, subprocess.SubprocessError):
        return False
    return p.returncode == 0 and bool(p.stdout.strip())


class GitWriter:
    def __init__(self, repo_root: str, banner: Banner, items_rel: str = "map",
                 debounce_ms: int = DEFAULT_DEBOUNCE_MS, lock: Optional[Any] = None) -> None:
        self.repo_root = repo_root
        self.banner = banner
        self.items_rel = items_rel
        self._store_lock = lock if lock is not None else threading.RLock()
        self._pending: "OrderedDict[str, str]" = OrderedDict()  # rel path -> title
        self._plock = threading.Lock()
        self._flock = threading.Lock()  # one flush at a time
        self._debounce = Debouncer(debounce_ms / 1000.0, self.flush, name="map-git")
        self.enabled = False
        self.attempts = 0
        self.successes = 0
        self.last_error: Optional[str] = None

    # --- git ------------------------------------------------------------------
    def _git(self, *args: str, check: bool = True, op: Optional[str] = None,
             bot: bool = False) -> "subprocess.CompletedProcess[str]":
        cmd = ["git", "-C", self.repo_root]
        if bot:
            cmd += ["-c", "user.name=" + BOT_NAME, "-c", "user.email=" + BOT_EMAIL,
                    "-c", "commit.gpgsign=false"]
        env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_EDITOR="true")
        if bot:
            env.update(GIT_AUTHOR_NAME=BOT_NAME, GIT_AUTHOR_EMAIL=BOT_EMAIL,
                       GIT_COMMITTER_NAME=BOT_NAME, GIT_COMMITTER_EMAIL=BOT_EMAIL)
        try:
            p = subprocess.run(cmd + list(args), capture_output=True, text=True,
                               timeout=GIT_TIMEOUT_S, env=env)
        except subprocess.TimeoutExpired as exc:
            p = subprocess.CompletedProcess(exc.cmd, -1, "", "timed out after %.0f s" % GIT_TIMEOUT_S)
        if check and p.returncode != 0:
            raise GitError(op or "git " + args[0], p)
        return p

    def _rebase_in_progress(self) -> bool:
        p = self._git("rev-parse", "--git-dir", check=False)
        gd = p.stdout.strip()
        if not gd:
            return False
        gd = gd if os.path.isabs(gd) else os.path.join(self.repo_root, gd)
        return any(os.path.exists(os.path.join(gd, d)) for d in ("rebase-merge", "rebase-apply"))

    # --- lifecycle ------------------------------------------------------------
    def start(self) -> bool:
        """Check the branch; enable the writer only on ``main``."""
        p = self._git("rev-parse", "--abbrev-ref", "HEAD", check=False)
        branch = p.stdout.strip()
        if p.returncode != 0 or branch != BRANCH:
            msg = ("checkout is on %r, not %r: the git writer is off and the map is read-only"
                   % (branch or "?", BRANCH))
            log.error("jugglebot-map: %s", msg)
            self.banner.set("warning", msg)
            self.enabled = False
            return False
        if self._rebase_in_progress():
            # A previous process died mid-rebase: abort it so the tree is the local commit again.
            self._git("rebase", "--abort", check=False)
        self.enabled = True
        return True

    def stop(self) -> None:
        self._debounce.close()

    # --- intake ---------------------------------------------------------------
    def record(self, path: str, title: str) -> None:
        """An API edit touched ``path`` (absolute); commit it ``debounce_ms`` after the last one."""
        if not self.enabled:
            return
        rel = os.path.relpath(path, self.repo_root).replace(os.sep, "/")
        with self._plock:
            self._pending.pop(rel, None)
            self._pending[rel] = title or rel
        self._debounce.trigger()

    def idle(self) -> bool:
        with self._plock:
            empty = not self._pending
        return empty and not self._debounce.pending() and not self._flock.locked()

    # --- the flush ------------------------------------------------------------
    def flush(self) -> bool:
        """Commit, rebase and push; True on success. Never raises."""
        if not self.enabled:
            return False
        with self._flock:
            self.attempts += 1
            try:
                with self._store_lock:
                    with self._plock:
                        titles = list(OrderedDict.fromkeys(self._pending.values()))
                        self._pending.clear()
                    try:
                        self._commit(titles)
                    except GitError:
                        with self._plock:  # keep the titles for the retry's message
                            for t in titles:
                                self._pending.setdefault("retry:" + t, t)
                        raise
                    if not self._ahead():
                        self._ok()
                        return True
                    self._pull()
                self._git("push", REMOTE, "HEAD:refs/heads/" + BRANCH, op="git push")
            except GitError as exc:
                self.last_error = str(exc)
                log.error("jugglebot-map: %s", exc)
                self.banner.set("error", "map edit saved locally but not pushed: %s" % exc)
                return False
            self._ok()
            return True

    def _ok(self) -> None:
        self.successes += 1
        self.last_error = None
        self.banner.clear()

    def _commit(self, titles: List[str]) -> None:
        self._git("add", "-A", "--", self.items_rel, op="git add")
        staged = self._git("diff", "--cached", "--quiet", "--", self.items_rel, check=False)
        if staged.returncode == 0:
            return  # nothing new (a retry whose commit is already made)
        msg = subject(titles or ["edits"])
        self._git("commit", "--quiet", "-m", msg, "--", self.items_rel, op="git commit", bot=True)

    def _ahead(self) -> bool:
        p = self._git("rev-list", "--count", "%s/%s..HEAD" % (REMOTE, BRANCH), check=False)
        if p.returncode != 0:
            return True  # no remote-tracking ref yet: let the pull/push decide
        return p.stdout.strip() != "0"

    def _pull(self) -> None:
        p = self._git("pull", "--rebase", "--no-autostash", REMOTE, BRANCH, check=False, bot=True)
        if p.returncode != 0:
            if self._rebase_in_progress():
                self._git("rebase", "--abort", check=False)
            raise GitError("git pull --rebase", p)
