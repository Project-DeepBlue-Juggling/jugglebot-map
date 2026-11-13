"""Night Shift: the committed morning reports and the operator's open question tickets.

Reports live at ``docs/night-shift/<YYYY-MM-DD>.md`` in the data checkout. They are
small and rare, so they are read on request (no cache, no thread). That contrasts
with ``nightly.py``, whose cache exists because its directory is configured
separately and may sit on a slower disk path. Question tickets come from the
store's Index (``type: question``, ``status: open``); answering one goes through
``Store.update`` so every save path (token check, ``updated``, docs regen, git
writer) is shared with the drawer.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REPORT_DIR = os.path.join("docs", "night-shift")
_FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")


def _title(path: str, fallback: str) -> str:
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("# "):
                    return line[2:].strip()
    except OSError:
        pass
    return fallback


_ITEM_CELL_RE = re.compile(r"^(?:BUG|FEAT|IDEA|PWAY|TKT)-[1-9]\d*$")
_STATUS_RE = re.compile(r"The night did not finish: status (\S+?)[.:,;]?(?:\s|$)")
_COUNTS_CACHE: Dict[str, Any] = {}


def report_counts(path: str) -> Optional[Dict[str, Any]]:
    """``{merged, held, questions, status}`` for one report file, or None when unparsable.

    The counts are the Item rows of the three sections (mapkit's ``night_shift_report``
    row rules, one parser); ``none`` and ``none recorded`` lines are not rows. ``status`` is
    ``OK`` for a normal report and the runner's status word for a stub. Cached by mtime.
    """
    try:
        st = os.stat(path)
        key = (st.st_mtime_ns, st.st_size)
        hit = _COUNTS_CACHE.get(path)
        if hit is not None and hit[0] == key:
            return hit[1]
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        from mapkit import night_shift_report as nsr
        parsed = nsr.parse_report(text)

        def n(section: str) -> int:
            rows = nsr.item_rows(parsed.get(section, []))
            return sum(1 for r in rows if _ITEM_CELL_RE.match(nsr.cells(r)[0]))

        m = _STATUS_RE.search(text)
        out: Optional[Dict[str, Any]] = {
            "merged": n("Merged to main"), "held": n("Held"),
            "questions": n("Questions for the Operator"), "status": m.group(1) if m else "OK"}
    except (OSError, ImportError, ValueError, IndexError):
        return None
    _COUNTS_CACHE[path] = (key, out)
    return out


def list_reports(repo_root: str) -> List[Dict[str, Any]]:
    d = os.path.join(repo_root, REPORT_DIR)
    try:
        names = os.listdir(d)
    except OSError:
        return []
    out = []
    for n in sorted(names, reverse=True):
        m = _FILE_RE.match(n)
        if m:
            p = os.path.join(d, n)
            c = report_counts(p)
            out.append({"date": m.group(1), "path": REPORT_DIR.replace(os.sep, "/") + "/" + n,
                        "title": _title(p, "Night Shift " + m.group(1)),
                        "merged": c["merged"] if c else None, "held": c["held"] if c else None,
                        "questions": c["questions"] if c else None,
                        "status": c["status"] if c else None})
    return out


HISTORY_FILE = os.path.join("docs", "night-shift", "history.jsonl")
_RUN_KEYS = ("date", "status", "detail", "started", "finished", "duration_s", "cost_usd",
             "main_commits_n", "delta", "unchanged", "preflight", "result")


def list_runs(repo_root: str) -> List[Dict[str, Any]]:
    """The runner's ``docs/night-shift/history.jsonl`` rows, newest date first.

    Fields follow ``last_run.json``; a missing file is ``[]``, a malformed or non-object line is
    skipped, and every row keeps only the keys it has (the reader tolerates absent ones).
    A row carries ``date`` as a string or it is dropped.
    """
    try:
        with open(os.path.join(repo_root, HISTORY_FILE), encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return []
    rows: List[Dict[str, Any]] = []
    for line in lines:
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if not isinstance(obj, dict) or not isinstance(obj.get("date"), str):
            continue
        rows.append({k: obj[k] for k in _RUN_KEYS if k in obj})
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows


def read_report(repo_root: str, date: str) -> Optional[str]:
    """The report's Markdown, or None. Any ``date`` that is not ``YYYY-MM-DD`` is refused (ValueError)."""
    if not DATE_RE.match(date or ""):
        raise ValueError("bad date")
    try:
        with open(os.path.join(repo_root, REPORT_DIR, date + ".md"), encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return None


def _by_id(ix: Any, cell: str) -> List[Any]:
    """Item nodes whose canonical ID (``BUG-3``, per kind) is ``cell``; a
    report cell that is not a canonical ID (``none``, a stem) names nothing."""
    from mapkit import ids
    return ix.by_short.get(cell, []) if ids.canonical_ref(cell) else []


_QUESTIONS_HEAD = "## Questions for the Operator"
_RULE_CELL_RE = re.compile(r"^:?-{3,}:?$")
ANSWER_HEADER = "Your answer"
_HELD_HEAD = "## Held"
RESPOND_HEADER = "Respond in"


def _cells(row: str) -> List[str]:
    s = row.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def _is_rule(row: str) -> bool:
    cs = _cells(row)
    return row.strip().startswith("|") and bool(cs) and all(_RULE_CELL_RE.match(c) for c in cs)


def answer_text(body: str) -> str:
    """The ``## Answer`` section of a ticket body as one line (blank lines dropped), or ``""``.

    Same section rule as ``mapkit.items.has_answer``: from the ``## Answer`` heading to the
    next ``## `` heading."""
    out: List[str] = []
    in_answer = False
    for line in body.splitlines():
        if line.rstrip() == "## Answer":
            in_answer = True
        elif line.startswith("## "):
            in_answer = False
        elif in_answer and line.strip():
            out.append(line.strip())
    return " ".join(out)


def _answer_cell(ix: Any, repo_root: str, ticket: str) -> str:
    hits = _by_id(ix, ticket)
    if len(hits) != 1:
        return "_ticket not found_"
    t = ix.task(hits[0], repo_root)
    text = answer_text(t["description"])
    if text:
        return text.replace("|", "\\|")
    if t["status"] == "dropped":
        return "_dropped_"
    return "_not answered yet_"


def _annotate_table(lines: List[str], heading: str, key_col: Any, ix: Any, repo_root: str) -> None:
    """Add the "Your answer" column to the GFM table under ``heading``, in place.

    ``key_col`` is the column index (int) or the header text (str) whose cell names the
    ticket; a header without that text, or a table that already has the column, is left alone.
    A ``none`` key cell (a Held row with no ticket) gets an empty answer cell."""
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == heading)
    except StopIteration:
        return
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    rule = next((i for i in range(start + 1, end) if _is_rule(lines[i])), None)
    if rule is None or rule - 1 <= start or not lines[rule - 1].strip().startswith("|"):
        return
    head = _cells(lines[rule - 1])
    if ANSWER_HEADER in head:
        return
    if isinstance(key_col, str):
        if key_col not in head:
            return
        key_col = head.index(key_col)

    def append(row: str, cell: str, sep: str = " ") -> str:
        row = row.rstrip()
        return (row if row.endswith("|") else row + " |") + sep + cell + sep + "|"

    lines[rule - 1] = append(lines[rule - 1], ANSWER_HEADER)
    lines[rule] = append(lines[rule], "---", sep="")
    i = rule + 1
    while i < end and lines[i].strip().startswith("|"):
        cs = _cells(lines[i])
        key = cs[key_col] if key_col < len(cs) else "none"
        lines[i] = append(lines[i], "" if key == "none" else _answer_cell(ix, repo_root, key))
        i += 1


def annotate_answers(text: str, ix: Any, repo_root: str) -> str:
    """The report with a "Your answer" column on its Questions and Held tables.

    The committed report is the night's snapshot; the answer lives on the question ticket
    (``## Answer``, written by the app's answer box). This joins them when the report is
    served, so each table shows each answer as it stands now. ``## Questions for the
    Operator`` is keyed on its first cell (the ticket); ``## Held`` on its ``Respond in``
    cell (a short ID, `JB-m` or `BUG-m`, or ``none``; a Held table without that column, as in older reports, is left
    alone). Only a GFM table (a header row followed by a ``|---|`` rule) is annotated; a
    report without one, or one that already has the column, is returned unchanged.
    """
    lines = text.split("\n")
    _annotate_table(lines, _QUESTIONS_HEAD, 0, ix, repo_root)
    _annotate_table(lines, _HELD_HEAD, RESPOND_HEADER, ix, repo_root)
    return "\n".join(lines)


def open_questions(ix: Any, repo_root: str) -> List[Dict[str, Any]]:
    """Every open ``type: question`` ticket, oldest first, with its parent Item."""
    out = []
    for node in ix.nodes.values():
        t = ix.task(node, repo_root)
        if node.kind != "ticket" or t["ticket_type"] != "question" or t["status"] != "open":
            continue
        parent = ix.parent_of(node)
        p = ix.task(parent, repo_root) if parent is not None else None
        out.append({"id": t["id"], "short_id": t["short_id"], "title": t["title"],
                    "body": t["description"],
                    "parent_id": p["id"] if p else None,
                    "parent_short_id": p["short_id"] if p else None,
                    "parent_kind": p["kind"] if p else None,
                    "parent_ticket_type": p["ticket_type"] if p else None,
                    "parent_title": p["title"] if p else None,
                    "created_at": t["created_at"], "updated_at": t["updated_at"]})
    out.sort(key=lambda q: (q["created_at"], q["id"]))
    return out


_RESULT_RE = re.compile(r"^##\s+Sitting result \((\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?\)\s*$")


def parse_results(body: str) -> List[Dict[str, Any]]:
    """Every ``## Sitting result (<date>[ HH:MM])`` section in ``body``: ``{date, time, verdict, notes}``, file order.

    The checkout's ``mapkit.sitting.parse_sitting_results`` when it has one; else a local
    parser (an old checkout), where ``time`` is None for the date-only heading.
    """
    from mapkit import sitting
    fn = getattr(sitting, "parse_sitting_results", None)
    if fn is not None:
        return [{"date": r["date"], "time": r.get("time"), "verdict": r["verdict"],
                 "notes": r["notes"]} for r in fn(body)]
    out: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    for line in body.splitlines():
        m = _RESULT_RE.match(line)
        if m:
            cur = {"date": m.group(1), "time": m.group(2), "verdict": "", "notes": ""}
            out.append(cur)
        elif line.startswith("## "):
            cur = None
        elif cur is not None:
            if line.startswith("- verdict:"):
                cur["verdict"] = line[len("- verdict:"):].strip()
            elif line.startswith("- notes:"):
                cur["notes"] = line[len("- notes:"):].strip()
    return out


RIGS = ("robot", "bench-leg", "bench-hand")  # rig display order; mapkit.sitting.HARDWARE when it has it
RIG_LABELS = {"robot": "Robot", "bench-leg": "Bench leg", "bench-hand": "Bench hand"}


def _rig_constants() -> Any:
    """``(HARDWARE, RIG_LABELS)`` from the checkout's mapkit when it carries them, else the literals."""
    from mapkit import sitting
    hw = tuple(getattr(sitting, "HARDWARE", ()))
    return (hw if "bench-hand" in hw else RIGS), dict(getattr(sitting, "RIG_LABELS", RIG_LABELS))


def runbook(ix: Any, repo_root: str) -> Dict[str, Any]:
    """The Next Sitting Runbook for the API: ``mapkit.sitting.collect`` plus store ids.

    Parsing lives in the checkout's mapkit (one parser); this only attaches the
    store's node ids (``task_id``, the app's ``?item=`` key) and each Item's
    recorded results. Read on request like the reports.
    """
    from mapkit import sitting

    data = sitting.collect(repo_root)
    rig_order, rig_labels = _rig_constants()

    def info(ref: str) -> Dict[str, Any]:
        node = ix.resolve(ref) if ref else None
        if node is None and ref:
            # mapkit names an Item by its ID (BUG-n, per kind) when it has one; resolve() takes stems only
            hits = _by_id(ix, ref)
            node = hits[0] if len(hits) == 1 else None
        if node is None:
            return {"task_id": None, "short_id": None, "title": None, "body": "",
                    "kind": None, "ticket_type": None}
        t = ix.task(node, repo_root)
        return {"task_id": t["id"], "short_id": t["short_id"], "title": t["title"],
                "body": t["description"], "kind": t["kind"], "ticket_type": t["ticket_type"]}

    def hw_of(ref: str) -> str:
        node = ix.resolve(ref) if ref else None
        if node is None and ref:
            hits = _by_id(ix, ref)
            node = hits[0] if len(hits) == 1 else None
        item = getattr(node, "item", None)
        return (item.meta.get("hardware") if item is not None else None) or "robot"

    blocks = []
    for block in data["blocks"]:
        rows = []
        for r in block:
            it = info(r.stem)
            pw = info(r.pathway)
            results = parse_results(it["body"])
            s = r.spec
            rows.append({"hardware": getattr(r, "hardware", None) or hw_of(r.stem),
                         "task_id": it["task_id"] or r.stem, "short_id": it["short_id"] or r.item_id,
                         "title": r.title, "kind": it["kind"], "ticket_type": it["ticket_type"],
                         "pathway_short_id": pw["short_id"],
                         "pathway_title": pw["title"], "priority": r.priority,
                         "setup": list(s.setup), "why": s.why, "do": list(s.do), "pass": s.pass_,
                         "record": s.record, "minutes": s.minutes, "branch": s.branch,
                         "score": r.score, "has_result": bool(results), "results": results})
        blocks.append({"hardware": rows[0]["hardware"], "setup": list(block[0].spec.setup),
                       "rows": rows})
    blocks.sort(key=lambda b: rig_order.index(b["hardware"]) if b["hardware"] in rig_order
                else len(rig_order))  # stable: mapkit's score order holds within a rig
    rigs = []
    for hw in rig_order:
        mine = [b for b in blocks if b["hardware"] == hw]
        if mine:
            rigs.append({"hardware": hw, "label": rig_labels.get(hw, hw), "blocks": len(mine),
                         "minutes": sum(r["minutes"] for b in mine for r in b["rows"])})
    needs = []
    for entry in data["needs_section"]:
        item_id, title, errors = entry[:3]
        it = info(item_id)
        needs.append({"hardware": entry[3] if len(entry) > 3 else hw_of(item_id),
                      "task_id": it["task_id"] or item_id, "short_id": it["short_id"] or item_id,
                      "title": title, "kind": it["kind"], "ticket_type": it["ticket_type"],
                      "errors": list(errors)})
    questions = []
    for qid, title, parent in data["questions"]:
        q = info(qid)
        p = info(parent)
        questions.append({"task_id": q["task_id"] or qid, "short_id": q["short_id"] or qid,
                          "title": title, "kind": q["kind"] or "ticket",
                          "ticket_type": q["ticket_type"] or "question",
                          "parent_task_id": p["task_id"], "parent_kind": p["kind"],
                          "parent_ticket_type": p["ticket_type"],
                          "parent_short_id": p["short_id"] or parent})
    return {"rigs": rigs, "blocks": blocks, "needs_section": needs, "questions": questions,
            "page": sitting.render_runbook(repo_root)}
