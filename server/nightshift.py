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


def list_reports(repo_root: str) -> List[Dict[str, str]]:
    d = os.path.join(repo_root, REPORT_DIR)
    try:
        names = os.listdir(d)
    except OSError:
        return []
    out = []
    for n in sorted(names, reverse=True):
        m = _FILE_RE.match(n)
        if m:
            out.append({"date": m.group(1), "path": REPORT_DIR.replace(os.sep, "/") + "/" + n,
                        "title": _title(os.path.join(d, n), "Night Shift " + m.group(1))})
    return out


def read_report(repo_root: str, date: str) -> Optional[str]:
    """The report's Markdown, or None. Any ``date`` that is not ``YYYY-MM-DD`` is refused (ValueError)."""
    if not DATE_RE.match(date or ""):
        raise ValueError("bad date")
    try:
        with open(os.path.join(repo_root, REPORT_DIR, date + ".md"), encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return None


_QUESTIONS_HEAD = "## Questions for the Operator"
_JB_RE = re.compile(r"^JB-(\d+)$")
_RULE_CELL_RE = re.compile(r"^:?-{3,}:?$")
ANSWER_HEADER = "Your answer"


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
    m = _JB_RE.match(ticket)
    hits = ix.by_short.get(int(m.group(1)), []) if m else []
    if len(hits) != 1:
        return "_ticket not found_"
    t = ix.task(hits[0], repo_root)
    text = answer_text(t["description"])
    if text:
        return text.replace("|", "\\|")
    if t["status"] == "dropped":
        return "_dropped_"
    return "_not answered yet_"


def annotate_answers(text: str, ix: Any, repo_root: str) -> str:
    """The report with a "Your answer" column on its ``## Questions for the Operator`` table.

    The committed report is the night's snapshot; the answer lives on the question ticket
    (``## Answer``, written by the app's answer box). This joins them when the report is
    served, so the table shows each answer as it stands now. Only a GFM table (a header row
    followed by a ``|---|`` rule) is annotated; a report without one, or one that already
    has the column, is returned unchanged.
    """
    lines = text.split("\n")
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == _QUESTIONS_HEAD)
    except StopIteration:
        return text
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    rule = next((i for i in range(start + 1, end - 0) if _is_rule(lines[i])), None)
    if rule is None or rule - 1 <= start or not lines[rule - 1].strip().startswith("|"):
        return text
    if ANSWER_HEADER in _cells(lines[rule - 1]):
        return text
    def append(row: str, cell: str, sep: str = " ") -> str:
        row = row.rstrip()
        return (row if row.endswith("|") else row + " |") + sep + cell + sep + "|"

    lines[rule - 1] = append(lines[rule - 1], ANSWER_HEADER)
    lines[rule] = append(lines[rule], "---", sep="")
    i = rule + 1
    while i < end and lines[i].strip().startswith("|"):
        lines[i] = append(lines[i], _answer_cell(ix, repo_root, _cells(lines[i])[0]))
        i += 1
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
                    "parent_title": p["title"] if p else None,
                    "created_at": t["created_at"], "updated_at": t["updated_at"]})
    out.sort(key=lambda q: (q["created_at"], q["id"]))
    return out


_RESULT_RE = re.compile(r"^##\s+Sitting result \((\d{4}-\d{2}-\d{2})\)\s*$")


def parse_results(body: str) -> List[Dict[str, str]]:
    """Every ``## Sitting result (<date>)`` section in ``body``: ``{date, verdict, notes}``, file order."""
    out: List[Dict[str, str]] = []
    cur: Optional[Dict[str, str]] = None
    for line in body.splitlines():
        m = _RESULT_RE.match(line)
        if m:
            cur = {"date": m.group(1), "verdict": "", "notes": ""}
            out.append(cur)
        elif line.startswith("## "):
            cur = None
        elif cur is not None:
            if line.startswith("- verdict:"):
                cur["verdict"] = line[len("- verdict:"):].strip()
            elif line.startswith("- notes:"):
                cur["notes"] = line[len("- notes:"):].strip()
    return out


def runbook(ix: Any, repo_root: str) -> Dict[str, Any]:
    """The Next Sitting Runbook for the API: ``mapkit.sitting.collect`` plus store ids.

    Parsing lives in the checkout's mapkit (one parser); this only attaches the
    store's node ids (``task_id``, the app's ``?item=`` key) and each Item's
    recorded results. Read on request like the reports.
    """
    from mapkit import sitting

    data = sitting.collect(repo_root)

    def info(ref: str) -> Dict[str, Any]:
        node = ix.resolve(ref) if ref else None
        if node is None:
            return {"task_id": None, "short_id": None, "title": None, "body": ""}
        t = ix.task(node, repo_root)
        return {"task_id": t["id"], "short_id": t["short_id"], "title": t["title"],
                "body": t["description"]}

    blocks = []
    for block in data["blocks"]:
        rows = []
        for r in block:
            it = info(r.stem)
            pw = info(r.pathway)
            results = parse_results(it["body"])
            s = r.spec
            rows.append({"task_id": it["task_id"] or r.stem, "short_id": it["short_id"] or r.item_id,
                         "title": r.title, "pathway_short_id": pw["short_id"],
                         "pathway_title": pw["title"], "priority": r.priority,
                         "setup": list(s.setup), "why": s.why, "do": list(s.do), "pass": s.pass_,
                         "record": s.record, "minutes": s.minutes, "branch": s.branch,
                         "score": r.score, "has_result": bool(results), "results": results})
        blocks.append({"setup": list(block[0].spec.setup), "rows": rows})
    needs = []
    for item_id, title, errors in data["needs_section"]:
        it = info(item_id)
        needs.append({"task_id": it["task_id"] or item_id, "short_id": it["short_id"] or item_id,
                      "title": title, "errors": list(errors)})
    questions = []
    for qid, title, parent in data["questions"]:
        q = info(qid)
        p = info(parent)
        questions.append({"task_id": q["task_id"] or qid, "short_id": q["short_id"] or qid,
                          "title": title, "parent_task_id": p["task_id"],
                          "parent_short_id": p["short_id"] or parent})
    return {"blocks": blocks, "needs_section": needs, "questions": questions,
            "page": sitting.render_runbook(repo_root)}
