"""The Pi's write path: debounced ``map-bot`` commit, ``pull --rebase``, push to ``main``.

Decision #31. ``debounce_ms`` after the LAST edit made through the API the
writer runs, in order::

    git add -A -- map
    git commit -m "map: <titles>" -- map            (as map-bot, no trailer)
    git pull --rebase origin main
      on failure: git rebase --abort                 (only when a rebase is in progress)
    (renumber own Items whose short ID the rebase brought in)
    mapkit.gen_docs.write_docs; git commit -m "map: regenerate project-map page" -- docs/...
    git push origin HEAD:refs/heads/main

Safety rules, each pinned by a test:

* a local edit is never discarded: nothing here resets, checks out or cleans,
  except the generated pages (:data:`DOCS_PAGES`), which are restored to HEAD
  when their regeneration could not be committed and at start (a dirty page
  would block every later ``pull --rebase``, which runs ``--no-autostash``);
  a failed rebase is aborted, which restores the pre-pull HEAD (the local
  commit) and its working tree;
* the repo is never left mid-rebase;
* a failure sets the banner (operation + git stderr tail); the next success
  clears it; the next edit retries (the local commit stays ahead of
  ``origin/main`` and is pushed then);
* only ``main`` is written: on another branch the writer refuses to start and
  the server serves read-only under a warning banner;
* a ``map/`` file left dirty by a process that died inside the debounce is
  committed at start (an untracked one counts as an unpushed new Item);
* any failure in the flush, the short-ID renumber included, sets the banner.

The generated pages (``docs/project-map.md``, ``docs/glossary.md``) are
regenerated AFTER the rebase and committed on top as their own ``map-bot``
commit, so an app edit never leaves ``main`` with a stale page (the docs
currency test went red after every app edit until 2026-10-30) and the page
reflects every Item the rebase brought in. Only a commit left by a rejected
push can meet a peer's page in the next rebase; ``.git/info/attributes``
(set at start, local to this clone) merges the pages with git's ``union``
driver so that never conflicts, and the fresh regeneration replaces the
merged text. A checkout without ``docs/project-map.md`` is not regenerated.
The store's lock is held from ``add`` through the regeneration (the rebase
rewrites working-tree files, so an API write must not interleave); it is
released for the push, which does not touch the tree.
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import subprocess
import threading
from collections import OrderedDict
from typing import Any, Callable, Dict, List, Optional

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
#: The pages ``mapkit.gen_docs.write_docs`` renders from ``map/``, repo-relative.
DOCS_PAGES = ("docs/project-map.md", "docs/glossary.md")
REGEN_SUBJECT = "map: regenerate project-map page"


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
                 debounce_ms: int = DEFAULT_DEBOUNCE_MS, lock: Optional[Any] = None,
                 on_repair: Optional[Callable[[], None]] = None) -> None:
        self.repo_root = repo_root
        self._on_repair = on_repair  # the store's invalidate: renumbered / now-pushed tiles refetch
        # Stems of the Items this clone created and has not pushed: their short ID is
        # provisional (a rebase may renumber it), so the UI shows it as "unsent".
        self._unpushed: "set[str]" = set()
        self._sending: "set[str]" = set()
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
        self._union_merge_pages()
        self._restore_pages()  # a previous process died between regenerating and committing
        self.enabled = True
        left = self._uncommitted()  # a previous process died inside the debounce
        with self._plock:
            self._unpushed = set(self._own_unpushed())  # left by a previous process
            for rel, (title, added) in left.items():
                if added:
                    self._unpushed.add(os.path.basename(rel)[:-3])
                self._pending.setdefault(rel, title)
        if left:
            log.warning("jugglebot-map: committing %d map file(s) left uncommitted: %s",
                        len(left), ", ".join(sorted(left)))
            self._debounce.trigger()
        return True

    def _uncommitted(self) -> "OrderedDict[str, Any]":
        """``{rel path: (title, untracked)}`` for every dirty ``map/*.md`` file.

        Only this writer edits its clone, so a dirty file is an API edit whose
        commit never ran. An untracked one is a new Item: its short ID is
        provisional until the push, like any other created Item.
        """
        from mapkit.items import ItemError, load_item  # local: see _repair_ids
        p = self._git("status", "--porcelain", "-z", "--untracked-files=all", "--",
                      self.items_rel, check=False)
        out: "OrderedDict[str, Any]" = OrderedDict()
        if p.returncode != 0:
            return out
        entries = p.stdout.split("\0")
        i = 0
        while i < len(entries):
            e = entries[i]
            i += 1
            if len(e) < 4:
                continue
            code, rel = e[:2], e[3:]
            if code[0] in "RC":
                i += 1  # a rename carries its source path as the next entry
            if not rel.endswith(".md"):
                continue
            path = os.path.join(self.repo_root, rel)
            title = rel
            try:
                title = load_item(path).meta.get("title") or rel
            except (ItemError, OSError, UnicodeDecodeError):
                pass  # deleted, or not loadable: the path names it
            out[rel] = (title, code == "??")
        return out

    def stop(self) -> None:
        self._debounce.close()

    # --- intake ---------------------------------------------------------------
    def record(self, path: str, title: str, created: bool = False) -> None:
        """An API edit touched ``path`` (absolute); commit it ``debounce_ms`` after the last one.

        ``created``: the edit filed a new Item, which stays "unsent" until a push lands."""
        if not self.enabled:
            return
        rel = os.path.relpath(path, self.repo_root).replace(os.sep, "/")
        with self._plock:
            if created:
                self._unpushed.add(os.path.basename(rel)[:-3])
            self._pending.pop(rel, None)
            self._pending[rel] = title or rel
        self._debounce.trigger()

    def unpushed(self) -> "frozenset[str]":
        """Stems of own Items not yet on ``origin/main`` (see :meth:`record`)."""
        with self._plock:
            return frozenset(self._unpushed)

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
                        self._sending = set(self._unpushed)
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
                    self._repair_ids()
                    self._regen_docs()
                self._git("push", REMOTE, "HEAD:refs/heads/" + BRANCH, op="git push")
            except GitError as exc:
                self._fail(str(exc))
                return False
            except Exception as exc:  # the renumber parses Items: anything else must banner too
                log.exception("jugglebot-map: flush failed")
                self._fail("%s: %s" % (type(exc).__name__, exc))
                return False
            self._ok()
            return True

    def _fail(self, why: str) -> None:
        self.last_error = why
        log.error("jugglebot-map: %s", why)
        self.banner.set("error", "map edit saved locally but not pushed: %s" % why)

    def _ok(self) -> None:
        with self._plock:
            # Only what this flush committed is on origin/main now; an Item filed
            # while the push ran stays unsent until the next flush.
            had = bool(self._unpushed & self._sending)
            self._unpushed -= self._sending
        if had and self._on_repair is not None:
            self._on_repair()  # tiles drop their "unsent" marker
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

    def _own_unpushed(self) -> List[str]:
        """Stems of the Items this clone added in commits not yet on ``origin/main``.

        After a stuck banner several app creations can be pending; every one of
        them is ours, and no other writer's file is ever in this list.
        """
        p = self._git("diff", "--name-only", "--diff-filter=A", "%s/%s...HEAD" % (REMOTE, BRANCH),
                      "--", self.items_rel, check=False)
        out = []
        for line in p.stdout.splitlines():
            name = os.path.basename(line.strip())
            if name.endswith(".md"):
                out.append(name[:-3])
        return out

    def _repair_ids(self) -> None:
        """After the rebase, before the push (store lock held): renumber every own
        unpushed Item whose short ID a rebase brought in on another Item.

        ``mapkit.ids.repair`` allocates the replacements one after another against
        the merged tree and ``origin/main``, and with ``own`` never touches another
        writer's file. The renumber is its own ``map: renumber`` commit (the one
        subject ``mapkit ids --check`` accepts for an ID change); our earlier
        ``map: <title>`` subjects carry no ID, so nothing in history goes stale.
        """
        from server import idrepair  # local: mapkit is importable only after config.setup()
        own = self._own_unpushed()
        if not own:
            return
        # Lenient: one malformed Item elsewhere in map/ must not stop the push.
        rows = idrepair.repair(self.repo_root, "%s/%s" % (REMOTE, BRANCH), own=own)
        if not rows:
            return
        self._git("add", "-A", "--", self.items_rel, op="git add")
        msg = subject(["renumber %s -> %s %s" % (old, new, st) for old, new, st in rows])
        self._git("commit", "--quiet", "-m", msg, "--", self.items_rel, op="git commit", bot=True)
        log.warning("jugglebot-map: renumbered after rebase: %s",
                    ", ".join("%s %s -> %s" % (st, old, new) for old, new, st in rows))
        if self._on_repair is not None:
            self._on_repair()

    def _has_pages(self) -> bool:
        return os.path.isfile(os.path.join(self.repo_root, DOCS_PAGES[0]))

    def _regen_docs(self) -> None:
        """After the rebase and the renumber, before the push (store lock held):
        regenerate the pages and commit any that changed as ``map-bot``. On any
        failure the pages go back to HEAD before the error propagates."""
        if not self._has_pages():
            return
        from mapkit import gen_docs  # local: mapkit is importable only after config.setup()
        try:
            changed = gen_docs.write_docs(self.repo_root)
            if not changed:
                return
            rels = [os.path.relpath(p, self.repo_root).replace(os.sep, "/") for p in changed]
            self._git("add", "--", *rels, op="git add")
            self._git("commit", "--quiet", "-m", REGEN_SUBJECT, "--", *rels,
                      op="git commit", bot=True)
        except BaseException:
            self._restore_pages()
            raise

    def _restore_pages(self) -> None:
        """Put dirty generated pages back to HEAD (derivable; never an Item)."""
        if not self._has_pages():
            return
        p = self._git("status", "--porcelain", "--", *DOCS_PAGES, check=False)
        dirty = [l[3:] for l in p.stdout.splitlines() if len(l) > 3 and l[:2] != "??"]
        if dirty:
            self._git("reset", "--quiet", "--", *dirty, check=False)
            self._git("checkout", "--", *dirty, check=False)
            log.warning("jugglebot-map: restored generated page(s) to HEAD: %s", ", ".join(dirty))

    def _union_merge_pages(self) -> None:
        """Clone-local ``merge=union`` for the generated pages (see the module doc)."""
        p = self._git("rev-parse", "--git-path", "info/attributes", check=False)
        rel = p.stdout.strip()
        if p.returncode != 0 or not rel:
            return
        path = rel if os.path.isabs(rel) else os.path.join(self.repo_root, rel)
        want = ["%s merge=union" % page for page in DOCS_PAGES]
        try:
            with open(path, encoding="utf-8") as fh:
                have = fh.read().splitlines()
        except OSError:
            have = []
        missing = [w for w in want if w not in have]
        if missing:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "a", encoding="utf-8") as fh:
                fh.write("".join(m + "\n" for m in missing))

    def _pull(self) -> None:
        p = self._git("pull", "--rebase", "--no-autostash", REMOTE, BRANCH, check=False, bot=True)
        if p.returncode != 0:
            if self._rebase_in_progress():
                self._git("rebase", "--abort", check=False)
            raise GitError("git pull --rebase", p)
