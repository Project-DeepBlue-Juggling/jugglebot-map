"""T-U8: Night Shift reports, open question tickets, the answer write, the badge summary."""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from tests.conftest import make_repo
from tests.test_p5_writer_watcher import git, git_env  # noqa: F401

QUESTION = """---
kind: ticket
title: Which leg first?
type: question
parent: bug-wobbly-leg
blocked_by: []
owners:
- claude
rank: 1
status: open
links: []
created: '2026-10-30'
updated: '2026-10-30T10:00:00Z'
priority: medium
---

## Question

Should the night shift fix leg 3 first?
"""


@pytest.fixture
def ns_repo(tmp_path, git_env):  # noqa: F811
    repo = make_repo(str(tmp_path / "repo"))
    os.makedirs(os.path.join(repo, "docs", "night-shift"))
    for d, t in (("2026-10-30", "Night Shift 2026-10-30"), ("2026-10-31", "Night Shift 2026-10-31")):
        with open(os.path.join(repo, "docs", "night-shift", d + ".md"), "w") as fh:
            fh.write("# %s\n\n## Summary\n\nJB-12 done.\n" % t)
    with open(os.path.join(repo, "docs", "night-shift", "notes.md"), "w") as fh:
        fh.write("# not a report\n")
    with open(os.path.join(repo, "map", "ticket-wobbly-question.md"), "w") as fh:
        fh.write(QUESTION)
    git(repo, "init", "--quiet")
    git(repo, "checkout", "--quiet", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "seed")
    return repo


@pytest.fixture
def c(ns_repo):
    app = create_app(ns_repo, dist_dir=os.path.join(ns_repo, "no-dist"), git=False, watch=False)
    with TestClient(app) as client:
        yield client


NS = "/api/v1/night-shift"


def _tasks(c):
    p = c.get("/api/v1/projects").json()[0]["id"]
    return {t["slug"]: t for t in c.get("/api/v1/projects/%s/tasks" % p).json() if t.get("slug")}


def test_reports_newest_first_and_body(c):
    reps = c.get(NS + "/reports").json()
    assert [r["date"] for r in reps] == ["2026-10-31", "2026-10-30"]
    assert reps[0] == {"date": "2026-10-31", "path": "docs/night-shift/2026-10-31.md",
                       "title": "Night Shift 2026-10-31"}
    r = c.get(NS + "/reports/2026-10-30")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    assert r.text.startswith("# Night Shift 2026-10-30")


def test_report_404_and_400(c):
    assert c.get(NS + "/reports/2026-01-01").status_code == 404
    assert c.get(NS + "/reports/notes").status_code == 400
    assert c.get(NS + "/reports/..%2F..%2Fmap%2Fbug-wobbly-leg").status_code in (400, 404)
    assert c.get(NS + "/reports/2026-10-3x").status_code == 400


def test_no_reports_dir(repo):
    app = create_app(repo, dist_dir=os.path.join(repo, "no-dist"), git=False, watch=False)
    with TestClient(app) as c:
        assert c.get(NS + "/reports").json() == []
        assert c.get(NS + "/summary").json() == {"latest_date": None, "open_questions": 0}


def test_questions_only_open_question_type(c):
    qs = c.get(NS + "/questions").json()
    assert len(qs) == 1  # the fixture's alpha ticket is type grilling
    q = qs[0]
    bug = _tasks(c)["wobbly-leg"]
    assert q["title"] == "Which leg first?" and "leg 3" in q["body"]
    assert q["parent_id"] == bug["id"] and q["parent_short_id"] == bug["short_id"]
    assert q["parent_title"] == "Wobbly leg"
    assert set(q) == {"id", "short_id", "title", "body", "parent_id", "parent_short_id",
                      "parent_title", "created_at", "updated_at"}


def test_answer_appends_once_completes_and_hides(c, ns_repo):
    qid = c.get(NS + "/questions").json()[0]["id"]
    assert c.get(NS + "/summary").json() == {"latest_date": "2026-10-31", "open_questions": 1}
    r = c.post("%s/questions/%s/answer" % (NS, qid), json={"answer": "Leg 3 first."})
    assert r.status_code == 200 and r.json()["status"] == "complete"
    text = open(os.path.join(ns_repo, "map", "ticket-wobbly-question.md")).read()
    assert text.count("## Answer") == 1 and "Leg 3 first." in text
    assert "Should the night shift fix leg 3 first?" in text
    assert "status: complete" in text
    again = c.post("%s/questions/%s/answer" % (NS, qid), json={"answer": "No, leg 4."})
    assert again.status_code == 409
    assert open(os.path.join(ns_repo, "map", "ticket-wobbly-question.md")).read().count("## Answer") == 1
    assert c.get(NS + "/questions").json() == []
    assert c.get(NS + "/summary").json() == {"latest_date": "2026-10-31", "open_questions": 0}


def test_answer_refusals(c):
    qid = c.get(NS + "/questions").json()[0]["id"]
    assert c.post("%s/questions/%s/answer" % (NS, qid), json={"answer": "  "}).status_code == 422
    assert c.post("%s/questions/%s/answer" % (NS, _tasks(c)["wobbly-leg"]["id"]),
                  json={"answer": "x"}).status_code == 422
    stale = c.post("%s/questions/%s/answer" % (NS, qid),
                   json={"answer": "x", "if_unchanged_since": "2020-01-01T00:00:00Z"})
    assert stale.status_code == 409 and "current" in stale.json()
