"""The git writer's post-rebase short-ID repair, loading ``map/`` leniently.

``mapkit.ids.repair`` loads every Item strictly, so one malformed file anywhere
in ``map/`` (a hand push with a bad ``status``) would stop every app edit from
reaching ``main``. Here, as in ``Store._build``, a file that fails to load is
skipped, but its frontmatter ``id:`` line is still read as text and counted:
it can hold a collision, and an ID it holds is never handed out again. A
skipped file is never renumbered (the writer only rewrites Items it can load).

The rules are mapkit's (``repair``'s keeper choice, ``allocate``'s 1 + max
over the tree, the ref and ``origin/main``); only the load differs.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from mapkit import ids
from mapkit.items import ItemError, load_item, split_item_filename

_ID_LINE = re.compile(r"^id:[ \t]*(.*?)[ \t]*$")
_INF = float("inf")


@dataclass
class Unloadable:
    """A ``map/*.md`` file the loader refused; shaped enough for ``mapkit.ids``
    (``duplicates`` and ``allocate`` read ``kind``, ``slug`` and ``meta['id']``)."""
    path: str
    kind: str
    slug: str
    meta: Dict[str, Any] = field(default_factory=dict)


def raw_id(path: str) -> Optional[str]:
    """The ``id:`` value in the file's frontmatter, read as text; None if absent."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return None
    if not lines or lines[0].strip() != "---":
        return None
    for line in lines[1:]:
        if line.strip() == "---":
            break
        m = _ID_LINE.match(line)
        if m:
            return m.group(1).strip("'\"") or None
    return None


def unloadable(path: str) -> Unloadable:
    name = os.path.basename(path)
    try:
        kind, slug = split_item_filename(name)
    except ValueError:
        kind, slug = "?", name[:-3]
    sid = raw_id(path)
    return Unloadable(path=path, kind=kind, slug=slug, meta={"id": sid} if sid else {})


def load_lenient(map_dir: str) -> Tuple[List[Any], List[Unloadable]]:
    """(loaded Items, the files that failed to load), both sorted by file name."""
    items: List[Any] = []
    bad: List[Unloadable] = []
    if not os.path.isdir(map_dir):
        return items, bad
    for name in sorted(os.listdir(map_dir)):
        p = os.path.join(map_dir, name)
        if not (name.endswith(".md") and os.path.isfile(p)):
            continue
        try:
            items.append(load_item(p))
        except (ItemError, OSError, UnicodeDecodeError):
            bad.append(unloadable(p))
    return items, bad


def _order_key(repo_root: str, item: Any, order: Dict[str, int]) -> Tuple[str, float, str]:
    """mapkit's keeper order: (``created``, first-add position on the ref, stem)."""
    rel = os.path.relpath(item.path, repo_root).replace(os.sep, "/")
    return (str(item.meta.get("created") or "9999-99-99"), float(order.get(rel, _INF)),
            ids.stem(item))


def repair(repo_root: str, ref: str, own: Iterable[str]) -> List[Tuple[str, str, str]]:
    """Renumber each own Item whose ID another file also holds; ``(old, new, stem)`` rows.

    ``mapkit.ids.repair(..., own=own)`` with a lenient load: a group member
    outside ``own`` (an unloadable file included) is the keeper, and a group
    with no own member is left for the gate.
    """
    items, bad = load_lenient(os.path.join(repo_root, ids.MAP_DIR))
    pool = items + bad  # every ID in the tree counts, loadable or not
    own_set = set(own)
    on_ref = ids.ref_ids(repo_root, ref)
    order = ids.add_order(repo_root, ref)
    rows = []
    for sid, group in sorted(ids.duplicates(pool).items()):
        mine = [i for i in group if ids.stem(i) in own_set and not isinstance(i, Unloadable)]
        if not mine:
            continue
        others = [i for i in group if all(i is not m for m in mine)]
        holders = [i for i in (others or group) if on_ref.get(ids.stem(i)) == sid]
        keeper = min(holders or others or group, key=lambda i: _order_key(repo_root, i, order))
        for loser in mine:
            if loser is keeper:
                continue
            new = ids.allocate(repo_root, ref, pool)
            ids.set_id(loser, new)
            rows.append((sid, new, ids.stem(loser)))
    return rows
