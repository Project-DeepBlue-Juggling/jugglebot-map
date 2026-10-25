"""File-backed store: the map items, plans and plan steps of one checkout as Tasks.

Resource mapping (decision #25):

* every ``map/<kind>-<slug>.md`` item is an editable Task, id ``item_uuid(slug)``;
* every plan is a read-only Task of kind ``plan``, id ``item_uuid(<filename>)``,
  parent its pathway item;
* every ``steps:`` entry of a plan is a read-only Task of kind ``phase``, id
  ``item_uuid("<filename>#<norm step id>")``, parent the plan, description
  the matching heading's first paragraph.

Dependencies come from each item's (and plan's) ``blocked_by`` list, whose
entries are an item filename stem (``ticket-foo``; a bare slug is accepted on
read) or a plan filename. Every write goes straight to the item file through
``mapkit.items.write_item`` after the new content has been validated by
``mapkit.items.load_item``, bumps ``updated`` and publishes one ``invalidate``.

Parse errors (the minimum, see README): an unparsable file is skipped and
listed by :meth:`Store.health`; everything else keeps being served.

The index is rebuilt from disk whenever the (path, mtime, size) signature of
the watched directories changes, so a hand edit is live on the next request
even before the P5 watcher exists.
"""
from __future__ import annotations

import datetime as dt
import os
import re
import shutil
import tempfile
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from mapkit import ids
from mapkit.items import (INBOX_KINDS, KINDS, Item, ItemError, item_uuid,
                          load_item, write_item)
from mapkit.plans import Plan, PlanError, load_plan

from server.config import MapConfig

T0 = "2026-10-23T00:00:00Z"
READ_ONLY_KINDS = ("plan", "phase")
PROJECT_KINDS = ["pathway", "plan", "phase", "idea", "feature", "bug", "ticket"]
LIVE_BOARDS = ("active", "parked")
DEFAULT_STATUS = {"pathway": "active", "idea": "inbox", "feature": "inbox",
                  "bug": "inbox", "ticket": "open"}
TOKEN_KEY = "if_unchanged_since"


def uid(key: str) -> str:
    return item_uuid(key)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def _to_iso(value: Any) -> Optional[str]:
    """A date/datetime/str -> ``YYYY-MM-DDTHH:MM:SSZ`` (UTC); None stays None."""
    if value in (None, ""):
        return None
    if isinstance(value, dt.datetime):
        d = value
    elif isinstance(value, dt.date):
        d = dt.datetime(value.year, value.month, value.day)
    else:
        s = str(value).strip().replace(" ", "T")
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            d = dt.datetime.fromisoformat(s)
        except ValueError:
            try:
                d = dt.datetime.combine(dt.date.fromisoformat(s[:10]), dt.time())
            except ValueError:
                return str(value)
    if d.tzinfo is not None:
        d = d.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return d.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def _date_str(value: Any) -> Optional[str]:
    if value in (None, ""):
        return None
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()[:10]
    return str(value)


def slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-") or "item"
    return s[:60].rstrip("-")


# ------------------------------------------------------------------ users ---

USERS = [
    {"id": uid("user:harrison"), "email": "harrison@jugglebot.local", "display_name": "Harrison",
     "color": "#2563eb", "dark_mode": "system", "created_at": T0},
    {"id": uid("user:claude"), "email": "claude@jugglebot.local", "display_name": "Claude",
     "color": "#d97706", "dark_mode": "system", "created_at": T0},
]
USER_BY_ID = {u["id"]: u for u in USERS}
USER_BY_NAME = {u["email"].split("@")[0]: u for u in USERS}
OWNER = USERS[0]["id"]
PROJECT_ID = uid("project:jugglebot")
PROJECT = {"id": PROJECT_ID, "name": "Jugglebot", "stages": list(PROJECT_KINDS),
           "due_date_warning_days": 7,
           "created_at": T0, "created_by": OWNER}
MEMBERSHIPS = [{"user_id": u["id"], "project_id": PROJECT_ID, "role": "admin",
                "created_at": T0, "created_by": OWNER} for u in USERS]


def user_id_for(name: Any) -> Optional[str]:
    u = USER_BY_NAME.get(str(name or "").strip().lower())
    return u["id"] if u else None


class ApiError(Exception):
    """An HTTP error with a JSON payload (``{"detail": ...}`` plus extras)."""

    def __init__(self, status: int, payload: Any) -> None:
        super().__init__(payload)
        self.status = status
        self.payload = payload if isinstance(payload, dict) else {"detail": payload}


# ------------------------------------------------------------------ index ---

@dataclass
class Node:
    """One Task's backing record."""
    id: str
    kind: str
    ref: str                 # item stem, plan filename, or "<plan filename>#<norm id>"
    path: str
    item: Optional[Item] = None
    plan: Optional[Plan] = None
    step_index: int = 0


@dataclass
class Index:
    items: Dict[str, Item] = field(default_factory=dict)        # stem -> Item
    by_slug: Dict[str, Item] = field(default_factory=dict)
    plans: Dict[str, Plan] = field(default_factory=dict)        # filename -> Plan
    nodes: Dict[str, Node] = field(default_factory=dict)        # task id -> Node
    by_ref: Dict[str, Node] = field(default_factory=dict)
    by_short: Dict[int, List[Node]] = field(default_factory=dict)  # JB-<n> number -> Item nodes
    unpushed: frozenset = frozenset()  # stems the git writer has not pushed (refreshed per read)
    errors: List[Dict[str, str]] = field(default_factory=list)

    # --- resolution -----------------------------------------------------
    def resolve(self, ref: Any) -> Optional[Node]:
        """A blocked_by / parent / pathway value -> its node (stem, filename or bare slug)."""
        if ref in (None, ""):
            return None
        r = str(ref).strip()
        if r.startswith("plans/"):
            r = os.path.basename(r)
        node = self.by_ref.get(r)
        if node is not None:
            return node
        item = self.by_slug.get(r)
        if item is not None:
            return self.by_ref.get(stem(item))
        return None

    def parent_of(self, node: Node) -> Optional[Node]:
        if node.item is not None:
            meta = node.item.meta
            p = self.resolve(meta.get("parent"))
            if p is None and node.kind in INBOX_KINDS:
                p = self.resolve(meta.get("pathway"))
            return p
        if node.kind == "plan":
            return self.resolve(node.plan.meta.get("pathway"))
        if node.kind == "phase":
            return self.by_ref.get(node.plan.filename)
        return None

    def pathway_of(self, node: Node) -> Optional[Node]:
        seen = set()
        cur = self.parent_of(node)
        while cur is not None and cur.id not in seen:
            if cur.kind == "pathway":
                return cur
            seen.add(cur.id)
            cur = self.parent_of(cur)
        return None

    def ancestors(self, node: Node) -> List[Node]:
        out, seen = [], {node.id}
        cur = self.parent_of(node)
        while cur is not None and cur.id not in seen:
            out.append(cur)
            seen.add(cur.id)
            cur = self.parent_of(cur)
        return out

    def children(self, node: Node) -> List[Node]:
        return [n for n in self.nodes.values() if _pid(self.parent_of(n)) == node.id]

    def blocked_by_refs(self, node: Node) -> List[Any]:
        if node.item is not None:
            return list(node.item.meta.get("blocked_by") or [])
        if node.kind == "plan":
            return list(node.plan.meta.get("blocked_by") or [])
        return []

    def blockers(self, node: Node) -> List[Node]:
        out: List[Node] = []
        for r in self.blocked_by_refs(node):
            b = self.resolve(r)
            if b is not None and b.id != node.id and b not in out:
                out.append(b)
        return out

    def edges(self) -> List[Dict[str, Any]]:
        out = []
        for n in self.nodes.values():
            for b in self.blockers(n):
                out.append({"id": uid("dep:%s->%s" % (b.ref, n.ref)), "blocker_id": b.id,
                            "blocked_id": n.id, "created_at": T0, "created_by": OWNER})
        return out

    def reaches(self, start: Node, target: Node) -> bool:
        """Does following blocked_by edges from ``start`` reach ``target``?"""
        stack, seen = [start], set()
        while stack:
            n = stack.pop()
            if n.id == target.id:
                return True
            if n.id in seen:
                continue
            seen.add(n.id)
            stack.extend(self.blockers(n))
        return False

    # --- task rendering ---------------------------------------------------
    def task(self, node: Node, repo_root: str) -> Dict[str, Any]:
        parent = self.parent_of(node)
        pathway = self.pathway_of(node) if node.kind != "pathway" else None
        base = {
            "id": node.id, "project_id": PROJECT_ID, "parent_id": _pid(parent),
            "assignee_ids": [], "priority": None, "is_section": False, "color": None,
            "canvas_x": 0.0, "canvas_y": 0.0, "canvas_collapsed": False,
            "work_days": None, "start_date": None, "due_date": None, "reviewer_id": None,
            "effective_start_date": None, "created_by": OWNER, "updated_by": OWNER,
            "destination": "", "branch": None, "links": [], "filed_by": None,
            "promoted_to": None, "rank": None, "ticket_type": None,
            "source_path": os.path.relpath(node.path, repo_root).replace(os.sep, "/"),
            "editable": node.kind not in READ_ONLY_KINDS, "pathway_id": _pid(pathway),
            "kind": node.kind, "short_id": None, "unpushed": False,
        }
        if node.item is not None:
            base.update(self._item_fields(node))
        elif node.kind == "plan":
            base.update(self._plan_fields(node))
        else:
            base.update(self._phase_fields(node))
        base["completion_criteria"] = base["destination"]
        return base

    def _item_fields(self, node: Node) -> Dict[str, Any]:
        item = node.item
        m = item.meta
        canvas = m.get("canvas") if isinstance(m.get("canvas"), dict) else {}
        owners = [user_id_for(o) for o in (m.get("owners") or [])]
        owners = sorted({o for o in owners if o}, key=lambda u: USER_BY_ID[u]["display_name"])
        rank = m.get("rank")
        rank = float(rank) if isinstance(rank, (int, float)) and not isinstance(rank, bool) else None
        created = _to_iso(m.get("created")) or T0
        wd = m.get("work_days")
        return {
            "title": str(m.get("title") or item.slug), "description": item.body.strip(),
            "assignee_ids": owners, "status": str(m.get("status")),
            "priority": m.get("priority"), "is_section": bool(m.get("section", False)),
            "backlog_rank": rank if rank is not None else 0.0, "color": m.get("color"),
            "canvas_x": float(canvas.get("x", 0) or 0), "canvas_y": float(canvas.get("y", 0) or 0),
            "canvas_collapsed": bool(canvas.get("collapsed", False)),
            "work_days": int(wd) if isinstance(wd, (int, float)) and not isinstance(wd, bool) else None,
            "start_date": _date_str(m.get("start_date")), "due_date": _date_str(m.get("due_date")),
            "effective_start_date": _date_str(m.get("start_date")),
            "created_at": created, "created_by": user_id_for(m.get("filed_by")) or OWNER,
            "updated_at": _to_iso(m.get("updated")) or created,
            "slug": item.slug, "destination": str(m.get("destination") or ""),
            "branch": m.get("branch"), "links": [str(x) for x in (m.get("links") or [])],
            "filed_by": m.get("filed_by"), "promoted_to": m.get("promoted_to"),
            "rank": rank, "ticket_type": m.get("type") if item.kind == "ticket" else None,
            "short_id": item.short_id, "unpushed": node.ref in self.unpushed,
        }

    def _plan_fields(self, node: Node) -> Dict[str, Any]:
        p = node.plan
        m = p.meta
        created = _to_iso(m.get("created")) or T0
        owner = user_id_for(m.get("owner"))
        return {
            "title": str(m.get("title") or p.slug), "description": str(m.get("scope") or "").strip(),
            "assignee_ids": [owner] if owner else [], "status": str(m.get("status") or p.board),
            "backlog_rank": float(sorted(self.plans).index(p.filename)),
            "created_at": created, "updated_at": _to_iso(m.get("last_updated")) or created,
            "slug": p.slug, "rank": None,
        }

    def _phase_fields(self, node: Node) -> Dict[str, Any]:
        p = node.plan
        step = p.steps[node.step_index]
        summary = ""
        for h in p.headings:
            if h.norm_id == step.norm_id:
                summary = h.summary
                break
        created = _to_iso(p.meta.get("created")) or T0
        return {
            "title": step.title or step.id, "description": summary,
            "status": step.status or "not_started", "backlog_rank": float(node.step_index),
            "created_at": created,
            "updated_at": _to_iso(step.date) or _to_iso(p.meta.get("last_updated")) or created,
            "slug": "%s#%s" % (p.filename, step.norm_id), "rank": float(node.step_index),
        }


def _pid(node: Optional[Node]) -> Optional[str]:
    return node.id if node is not None else None


def stem(item: Item) -> str:
    return "%s-%s" % (item.kind, item.slug)


# ------------------------------------------------------------------ store ---

class Store:
    """The checkout's map as Tasks; thread-safe; rebuilds lazily on disk change."""

    def __init__(self, cfg: MapConfig, on_change: Optional[Callable[[], None]] = None) -> None:
        self.cfg = cfg
        self.repo_root = cfg.repo_root
        self._on_change = on_change
        # P5 hooks, wired by create_app: the watcher coalesces our own writes with the
        # inotify events they cause; the git writer commits them; the banner rides /health.
        self.watcher: Any = None
        self.writer: Any = None
        self.banner: Any = None
        self.read_only: Optional[str] = None
        self._lock = threading.RLock()
        self._sig: Optional[Tuple] = None
        self._ix: Optional[Index] = None

    # --- loading ------------------------------------------------------------
    def _signature(self) -> Tuple:
        sig = []
        for d in [self.cfg.items_dir] + list(self.cfg.plan_dirs):
            if not os.path.isdir(d):
                continue
            for name in sorted(os.listdir(d)):
                if name.endswith(".md"):
                    try:
                        st = os.stat(os.path.join(d, name))
                    except OSError:
                        continue
                    sig.append((d, name, st.st_mtime_ns, st.st_size))
        return tuple(sig)

    def index(self) -> Index:
        with self._lock:
            sig = self._signature()
            if self._ix is None or sig != self._sig:
                self._ix = self._build()
                self._sig = sig
            self._ix.unpushed = self.writer.unpushed() if self.writer is not None else frozenset()
            return self._ix

    def invalidate(self, publish: bool = True) -> None:
        """Drop the cached index and (by default) tell every SSE client to refetch."""
        with self._lock:
            self._ix = None
        if publish and self._on_change is not None:
            self._on_change()

    def _err(self, ix: Index, path: str, message: str) -> None:
        rel = os.path.relpath(path, self.repo_root).replace(os.sep, "/")
        if message.startswith(path + ": "):
            message = message[len(path) + 2:]
        ix.errors.append({"path": rel, "message": message})

    def _add(self, ix: Index, node: Node) -> None:
        if node.id in ix.nodes:
            self._err(ix, node.path, "id collision with %s (same slug); file skipped"
                      % ix.nodes[node.id].ref)
            return
        ix.nodes[node.id] = node
        ix.by_ref[node.ref] = node

    def _build(self) -> Index:
        ix = Index()
        d = self.cfg.items_dir
        if os.path.isdir(d):
            for name in sorted(os.listdir(d)):
                path = os.path.join(d, name)
                if not (name.endswith(".md") and os.path.isfile(path)):
                    continue
                try:
                    item = load_item(path)
                except (ItemError, OSError, UnicodeDecodeError) as exc:
                    self._err(ix, path, str(exc))
                    continue
                before = len(ix.nodes)
                self._add(ix, Node(id=item.uuid, kind=item.kind, ref=stem(item), path=path, item=item))
                if len(ix.nodes) > before:
                    ix.items[stem(item)] = item
                    ix.by_slug.setdefault(item.slug, item)
                    n = ids.canonical(item.meta.get("id"))
                    if n is not None:
                        ix.by_short.setdefault(n, []).append(ix.nodes[item.uuid])
        for pd in self.cfg.plan_dirs:
            if not os.path.isdir(pd):
                continue
            board = os.path.basename(pd)
            for name in sorted(os.listdir(pd)):
                path = os.path.join(pd, name)
                if not name.endswith(".md") or name == "INDEX.md" or not os.path.isfile(path):
                    continue
                try:
                    plan = load_plan(path, board=board)
                except (PlanError, OSError, UnicodeDecodeError) as exc:
                    self._err(ix, path, str(exc))
                    continue
                if plan.filename in ix.plans:
                    self._err(ix, path, "plan filename also on another board; file skipped")
                    continue
                ix.plans[plan.filename] = plan
                self._add(ix, Node(id=uid(plan.filename), kind="plan", ref=plan.filename,
                                   path=path, plan=plan))
                for i, step in enumerate(plan.steps):
                    ref = "%s#%s" % (plan.filename, step.norm_id)
                    self._add(ix, Node(id=uid(ref), kind="phase", ref=ref, path=path,
                                       plan=plan, step_index=i))
        for n, nodes in sorted(ix.by_short.items()):
            if len(nodes) > 1:  # the gitwriter repairs its own; anything else is for mapkit ids --repair
                for node in nodes:
                    self._err(ix, node.path, "id %s also on %s (python -m mapkit ids --repair)" % (
                        ids.format_id(n), ", ".join(x.ref for x in nodes if x is not node)))
        return ix

    # --- reads --------------------------------------------------------------
    def health(self) -> Dict[str, Any]:
        ix = self.index()
        banner = self.banner.get() if self.banner is not None else \
            {"level": None, "message": "", "since": None}
        return {"status": "degraded" if ix.errors else "ok", "errors": list(ix.errors),
                "banner": banner}

    def tasks(self) -> List[Dict[str, Any]]:
        ix = self.index()
        return [ix.task(n, self.repo_root) for n in ix.nodes.values()]

    def _node(self, ix: Index, task_id: str, write: bool = False) -> Node:
        """A task uuid, or an Item's short ID (``JB-12``, ``jb12``; bare ``12`` on reads only).

        Always returns the node, whose ``id`` is the canonical uuid. Bare digits
        on a write are refused, matching mapkit: a one-digit typo in one global
        sequence lands on another real Item.
        """
        node = ix.nodes.get(task_id)
        if node is not None:
            return node
        n = ids.parse(task_id, allow_bare=True)
        if n is None:
            raise ApiError(404, {"detail": "task not found"})
        if write and ids.parse(task_id) is None:
            raise ApiError(422, {"detail": "a write names an Item by uuid or %s, not bare %r"
                                           % (ids.format_id(n), task_id)})
        hits = ix.by_short.get(n, [])
        if len(hits) > 1:
            raise ApiError(409, {"detail": "%s names %d Items" % (ids.format_id(n), len(hits)),
                                 "children": self._summ(ix, hits), "blocking": [], "blocked_by": []})
        if not hits:
            raise ApiError(404, {"detail": "task not found"})
        return hits[0]

    def task(self, task_id: str) -> Dict[str, Any]:
        ix = self.index()
        return ix.task(self._node(ix, task_id), self.repo_root)

    def task_detail(self, task_id: str) -> Dict[str, Any]:
        ix = self.index()
        node = self._node(ix, task_id)
        e = ix.edges()
        return dict(ix.task(node, self.repo_root),
                    blocking=[x for x in e if x["blocker_id"] == node.id],
                    blocked_by=[x for x in e if x["blocked_id"] == node.id])

    def dependencies(self) -> List[Dict[str, Any]]:
        return self.index().edges()

    # --- write helpers ------------------------------------------------------
    def _summ(self, ix: Index, nodes: List[Node]) -> List[Dict[str, str]]:
        return [{"id": n.id, "title": ix.task(n, self.repo_root)["title"]} for n in nodes]

    def _check_token(self, ix: Index, node: Node, token: Any) -> None:
        if token in (None, ""):
            return
        current = ix.task(node, self.repo_root)
        if _to_iso(token) != current["updated_at"]:
            raise ApiError(409, {"detail": "Task was modified", "current": current})

    def _write(self, path: str, meta: Dict[str, Any], body: str) -> None:
        """Validate with mapkit's loader first, then write through; 422 on a schema error."""
        tmpdir = tempfile.mkdtemp(prefix="jbmap-")
        try:
            probe = os.path.join(tmpdir, os.path.basename(path))
            write_item(probe, meta, body)
            try:
                load_item(probe)
            except ItemError as exc:
                msg = str(exc)
                if msg.startswith(probe + ": "):
                    msg = msg[len(probe) + 2:]
                raise ApiError(422, {"detail": msg})
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
        write_item(path, meta, body)

    def _writable(self) -> None:
        if self.read_only:
            raise ApiError(403, {"detail": self.read_only})

    def _commit(self, path: str, title: str, created: bool = False) -> None:
        """After a write: one coalesced ``invalidate`` and a debounced git commit."""
        with self._lock:
            self._ix = None
        if self.watcher is not None and self.watcher.running:
            self.watcher.poke()
        elif self._on_change is not None:
            self._on_change()
        if self.writer is not None:
            self.writer.record(path, title, created=created)

    # --- tasks: create / update / delete -----------------------------------
    def create(self, body: Dict[str, Any], user: str = "harrison") -> Dict[str, Any]:
        with self._lock:
            self._writable()
            ix = self.index()
            kind = body.get("kind") or body.get("stage") or "idea"
            if kind in READ_ONLY_KINDS:
                raise ApiError(405, {"detail": "%ss are read-only in the app: edit the plan file" % kind})
            if kind not in KINDS:
                raise ApiError(422, {"detail": "kind %r not in %s" % (kind, list(KINDS))})
            base = slugify(body.get("slug") or body.get("title") or "item")
            slug, n = base, 2
            while slug in ix.by_slug or uid(slug) in ix.nodes or \
                    os.path.exists(os.path.join(self.cfg.items_dir, "%s-%s.md" % (kind, slug))):
                slug, n = "%s-%d" % (base, n), n + 1
            if body.get("id") not in (None, "") or body.get("short_id") not in (None, ""):
                raise ApiError(422, {"detail": "the short ID is allocated by the server"})
            meta: Dict[str, Any] = {
                "id": self._next_id(ix),
                "kind": kind, "title": body.get("title") or slug,
                "status": body.get("status") or DEFAULT_STATUS[kind],
                "created": dt.date.today().isoformat(), "updated": now_iso(),
                "owners": [], "priority": "medium", "blocked_by": [], "links": [],
            }
            if kind in INBOX_KINDS:
                meta["filed_by"] = body.get("filed_by") or user
            if kind == "ticket":
                ranks = [i.meta.get("rank") for i in ix.items.values() if i.kind == "ticket"]
                ranks = [r for r in ranks if isinstance(r, int) and not isinstance(r, bool)]
                meta["rank"] = max(ranks + [0]) + 1
            new_body = ""
            meta, new_body = self._apply(ix, None, kind, meta, new_body, body)
            path = os.path.join(self.cfg.items_dir, "%s-%s.md" % (kind, slug))
            self._write(path, meta, new_body)
            self._commit(path, meta["title"], created=True)
            return self.task(uid(slug))

    def update(self, task_id: str, body: Dict[str, Any], token: Any = None) -> Dict[str, Any]:
        with self._lock:
            self._writable()
            ix = self.index()
            node = self._node(ix, task_id, write=True)
            self._refuse_id_change(node, body)
            body_token = body.pop(TOKEN_KEY, None)
            if token in (None, ""):
                token = body_token
            if node.item is None:
                current = ix.task(node, self.repo_root)
                changed = sorted(k for k, v in body.items()
                                 if k not in current or current[k] != v)
                if changed:
                    raise ApiError(405, {"detail": "%ss are read-only in the app (fields %s): "
                                                   "edit the plan file" % (node.kind, ", ".join(changed))})
                return current
            self._check_token(ix, node, token)
            item = node.item
            new_status = body.get("status")
            if item.kind == "pathway" and new_status in ("complete", "dropped") \
                    and new_status != item.status:
                live = [ix.by_ref[p.filename] for p in ix.plans.values()
                        if p.board in LIVE_BOARDS and p.meta.get("pathway") == item.slug]
                if live:
                    raise ApiError(409, {"detail": "Pathway still has live plans",
                                         "children": self._summ(ix, live),
                                         "blocking": [], "blocked_by": []})
            if body.get("parent_id"):
                new_parent = ix.nodes.get(body["parent_id"])
                if new_parent is None:
                    raise ApiError(404, {"detail": "parent task not found"})
                if new_parent.id == node.id or node in ix.ancestors(new_parent):
                    via = ix.task(new_parent, self.repo_root)
                    raise ApiError(409, {"detail": "Reparenting would close a cycle",
                                         "would_close_via": {"id": via["id"], "title": via["title"]}})
            meta, new_body = self._apply(ix, node, item.kind, dict(item.meta), item.body, body)
            meta["updated"] = now_iso()
            self._write(node.path, meta, new_body)
            self._commit(node.path, meta.get("title") or item.slug)
            return self.task(task_id)

    def delete(self, task_id: str, token: Any = None) -> None:
        with self._lock:
            self._writable()
            ix = self.index()
            node = self._node(ix, task_id, write=True)
            if node.item is None:
                raise ApiError(405, {"detail": "%ss are read-only in the app: edit the plan file" % node.kind})
            self._check_token(ix, node, token)
            kids = ix.children(node)
            blocking = [n for n in ix.nodes.values() if node in ix.blockers(n)]
            blocked_by = ix.blockers(node)
            if kids or blocking or blocked_by:
                raise ApiError(409, {"detail": "Task has children or dependencies",
                                     "children": self._summ(ix, kids),
                                     "blocking": self._summ(ix, blocking),
                                     "blocked_by": self._summ(ix, blocked_by)})
            os.remove(node.path)
            self._commit(node.path, node.item.meta.get("title") or node.item.slug)

    def _next_id(self, ix: Index) -> str:
        """The next ``JB-<n>``: 1 + max over the index and, with a git writer,
        ``origin/main`` (``mapkit.ids.allocate``). Under ``--no-git`` nothing
        shells out. A collision with an Item filed elsewhere since the last pull
        is repaired by the git writer after its rebase."""
        if self.writer is None:
            return ids.format_id(max(ix.by_short or [0]) + 1)
        return ids.allocate(self.repo_root, items=list(ix.items.values()))

    @staticmethod
    def _refuse_id_change(node: Node, body: Dict[str, Any]) -> None:
        """``id`` (the task uuid) and ``short_id`` are immutable: echoing them back
        unchanged is allowed, a different value is a 422."""
        current = node.item.short_id if node.item is not None else None
        changed = [k for k, v in (("id", node.id), ("short_id", current))
                   if k in body and body[k] != v]
        if changed:
            raise ApiError(422, {"detail": "%s cannot change (renumbering is "
                                           "python -m mapkit ids --repair)" % " and ".join(changed)})

    def _apply(self, ix: Index, node: Optional[Node], kind: str, meta: Dict[str, Any],
               body_text: str, b: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
        """A TaskCreateBody / TaskUpdateBody onto item frontmatter + body (not written)."""
        new_kind = b.get("kind", b.get("stage"))
        if new_kind is not None and new_kind != kind:
            raise ApiError(422, {"detail": "kind is the filename prefix and cannot change "
                                           "(promote with status 'promoted' + promoted_to)"})
        if "title" in b:
            meta["title"] = b["title"]
        if "description" in b:
            body_text = (b["description"] or "").strip() + "\n"
        for key in ("destination", "completion_criteria"):
            if key in b:
                meta["destination"] = b[key] or ""
        if "assignee_ids" in b:
            meta["owners"] = [USER_BY_ID[u]["email"].split("@")[0]
                              for u in (b["assignee_ids"] or []) if u in USER_BY_ID]
        for src, dst in (("status", "status"), ("priority", "priority"), ("color", "color"),
                         ("is_section", "section"), ("branch", "branch"), ("filed_by", "filed_by"),
                         ("ticket_type", "type"), ("links", "links")):
            if src in b:
                meta[dst] = b[src]
        if "promoted_to" in b:
            if kind not in INBOX_KINDS:
                raise ApiError(422, {"detail": "promoted_to is only for idea, feature and bug items"})
            meta["promoted_to"] = b["promoted_to"]
        for src in ("rank", "backlog_rank"):
            if src in b and b[src] is not None:
                r = b[src]
                meta["rank"] = int(round(r)) if kind == "ticket" else r
        if any(k in b for k in ("canvas_x", "canvas_y", "canvas_collapsed")):
            c = dict(meta.get("canvas") or {})
            if "canvas_x" in b:
                c["x"] = round(float(b["canvas_x"]), 1)
            if "canvas_y" in b:
                c["y"] = round(float(b["canvas_y"]), 1)
            if "canvas_collapsed" in b:
                c["collapsed"] = bool(b["canvas_collapsed"])
            meta["canvas"] = c
        for k in ("work_days", "start_date", "due_date"):
            if k in b:
                meta[k] = b[k]
        if "parent_id" in b:
            # The schema (#25) and mapkit.derive.attached use ``parent:`` for every kind;
            # an older ``pathway:`` key on an inbox item is dropped on rewrite (the read
            # path in Index.parent_of keeps the fallback for one release).
            meta.pop("parent", None)
            if kind in INBOX_KINDS:
                meta.pop("pathway", None)
            target = ix.nodes.get(b["parent_id"]) if b["parent_id"] else None
            if b["parent_id"] and target is None:
                raise ApiError(404, {"detail": "parent task not found"})
            if target is not None:
                if target.item is None:
                    raise ApiError(422, {"detail": "a map item's parent must be a map item, not a %s"
                                                   % target.kind})
                meta["parent"] = target.item.slug
        return meta, body_text

    # --- dependencies -------------------------------------------------------
    def add_dependency(self, blocker_id: Any, blocked_id: Any) -> Dict[str, Any]:
        with self._lock:
            self._writable()
            ix = self.index()
            blocker, blocked = ix.nodes.get(blocker_id), ix.nodes.get(blocked_id)
            if blocker is None or blocked is None:
                raise ApiError(404, {"detail": "task not found"})
            if blocked.item is None:
                raise ApiError(405, {"detail": "%ss are read-only in the app: add blocked_by "
                                               "in the plan file" % blocked.kind})
            if blocker.kind == "phase":
                raise ApiError(405, {"detail": "a phase cannot be a blocker; use its plan"})
            if blocker.id == blocked.id or ix.reaches(blocker, blocked):
                raise ApiError(409, {"detail": "Dependency would create a cycle"})
            if blocker not in ix.blockers(blocked):
                meta = dict(blocked.item.meta)
                meta["blocked_by"] = list(meta.get("blocked_by") or []) + [blocker.ref]
                meta["updated"] = now_iso()
                self._write(blocked.path, meta, blocked.item.body)
                self._commit(blocked.path, meta.get("title") or blocked.item.slug)
            dep_id = uid("dep:%s->%s" % (blocker.ref, blocked.ref))
            for e in self.index().edges():
                if e["id"] == dep_id:
                    return e
            raise ApiError(500, {"detail": "dependency written but not found on re-read"})

    def delete_dependency(self, dep_id: str) -> None:
        with self._lock:
            self._writable()
            ix = self.index()
            edge = next((e for e in ix.edges() if e["id"] == dep_id), None)
            if edge is None:
                raise ApiError(404, {"detail": "dependency not found"})
            blocked, blocker = ix.nodes[edge["blocked_id"]], ix.nodes[edge["blocker_id"]]
            if blocked.item is None:
                raise ApiError(405, {"detail": "%ss are read-only in the app: edit blocked_by "
                                               "in the plan file" % blocked.kind})
            meta = dict(blocked.item.meta)
            meta["blocked_by"] = [r for r in (meta.get("blocked_by") or [])
                                  if ix.resolve(r) is not blocker]
            meta["updated"] = now_iso()
            self._write(blocked.path, meta, blocked.item.body)
            self._commit(blocked.path, meta.get("title") or blocked.item.slug)
