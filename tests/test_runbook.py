"""Next Sitting Runbook: blocks from mapkit.sitting.collect, result writes, refusals."""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from tests.conftest import make_repo
from tests.test_p5_writer_watcher import git, git_env  # noqa: F401


def _item(title, setup, hw="robot", minutes=10, branch=None, section=True, priority="high"):
    head = ("---\nkind: bug\ntitle: %s\nstatus: backlog\ncreated: '2026-10-05'\n"
            "updated: '2026-10-05T10:00:00Z'\nowners: []\npriority: %s\nhardware: %s\n"
            "parent: pathway-alpha\nblocked_by: []\nlinks: []\n---\n\nBody.\n" % (title, priority, hw))
    if not section:
        return head
    sec = ("\n## Sitting\n\n- setup: %s\n- why: because\n- do:\n  - step one\n  - step two\n"
           "- pass: it works\n- record: the number\n- minutes: %d\n" % (setup, minutes))
    if branch:
        sec += "- branch: `night-shift/x`\n"
    return head + sec


@pytest.fixture
def rb_repo(tmp_path, git_env):  # noqa: F811
    repo = make_repo(str(tmp_path / "repo"))
    for slug, text in (("lvl", _item("Level one", "level")),
                       ("arm", _item("Armed one", "level, armed", minutes=20)),
                       ("brn", _item("Branchy", "level", minutes=5, branch=True)),
                       ("nosec", _item("No section", "level", section=False))):
        with open(os.path.join(repo, "map", "bug-%s.md" % slug), "w") as fh:
            fh.write(text)
    git(repo, "init", "--quiet")
    git(repo, "checkout", "--quiet", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "seed")
    return repo


@pytest.fixture
def c(rb_repo):
    app = create_app(rb_repo, dist_dir=os.path.join(rb_repo, "no-dist"), git=False, watch=False)
    with TestClient(app) as client:
        yield client


def _rows(data):
    return [r for b in data["blocks"] for r in b["rows"]]


def test_blocks_match_collect(c, rb_repo):
    from mapkit import sitting
    want = sitting.collect(rb_repo)
    data = c.get("/api/v1/runbook").json()
    assert [[r["short_id"] for r in b["rows"]] for b in data["blocks"]] == \
        [[r.item_id for r in b] for b in want["blocks"]]
    assert [b["setup"] for b in data["blocks"]] == [list(b[0].spec.setup) for b in want["blocks"]]
    assert len(_rows(data)) == 3 and len(data["blocks"]) == 2
    row = _rows(data)[0]
    assert row["pathway_title"] == "Alpha pathway"
    assert row["do"] == ["step one", "step two"] and row["pass"] == "it works"
    assert row["has_result"] is False and row["results"] == []
    assert any(r["branch"] == "night-shift/x" for r in _rows(data))
    assert data["page"].startswith("# Next Sitting Runbook")


def test_needs_section(c):
    data = c.get("/api/v1/runbook").json()
    assert [n["title"] for n in data["needs_section"]] == ["No section"]
    assert data["needs_section"][0]["errors"] == ["no ## Sitting section"]


def test_result_appends_each_call_and_flips_has_result(c, rb_repo):
    row = next(r for r in _rows(c.get("/api/v1/runbook").json()) if r["title"] == "Level one")
    url = "/api/v1/runbook/%s/result" % row["task_id"]
    r = c.post(url, json={"date": "2026-10-31", "verdict": "pass", "notes": "10:42  fine"})
    assert r.status_code == 200
    path = os.path.join(rb_repo, "map", "bug-lvl.md")
    text = open(path).read()
    assert text.count("## Sitting result (2026-10-31)") == 1
    assert "- verdict: pass" in text and "- notes: 10:42 fine" in text
    assert "## Sitting\n" in text  # original section kept
    again = next(r for r in _rows(c.get("/api/v1/runbook").json()) if r["title"] == "Level one")
    assert again["has_result"] is True
    assert again["results"] == [{"date": "2026-10-31", "verdict": "pass", "notes": "10:42 fine"}]
    assert c.post(url, json={"date": "2026-10-31", "verdict": "fail", "notes": "again"}).status_code == 200
    assert open(path).read().count("## Sitting result (2026-10-31)") == 2


def test_result_refusals(c):
    row = _rows(c.get("/api/v1/runbook").json())[0]
    url = "/api/v1/runbook/%s/result" % row["task_id"]
    assert c.post(url, json={"date": "2026-10-31", "verdict": "maybe", "notes": ""}).status_code == 422
    assert c.post(url, json={"date": "today", "verdict": "pass", "notes": ""}).status_code == 422
    other = c.get("/api/v1/projects").json()[0]["id"]
    tasks = c.get("/api/v1/projects/%s/tasks" % other).json()
    non_hw = next(t for t in tasks if t.get("kind") == "idea")
    assert c.post("/api/v1/runbook/%s/result" % non_hw["id"],
                  json={"date": "2026-10-31", "verdict": "pass", "notes": ""}).status_code == 422
