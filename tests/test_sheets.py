"""Sitting sheets (IDEA-19): list, get, save a step, refusals; nothing is written on a 422."""
from __future__ import annotations

import os

import pytest
import yaml
from fastapi.testclient import TestClient

from server.app import create_app
from tests.conftest import make_repo
from tests.test_p5_writer_watcher import git, git_env  # noqa: F401
from tests.test_runbook import _item

NAME = "2026-11-10-robot"


def _step(n, kind, frm, to, serves, **extra):
    st = {"n": n, "kind": kind, "title": "Step %d title" % n, "from": frm, "to": to,
          "actions": [{"where": "Terminal 1", "text": "do it", "command": "ros2 param set /x y 1"}],
          "see": "a thing", "stop_if": "smoke", "serves": serves}
    st.update(extra)
    return st


SHEET = {"schema": 1, "date": "2026-11-10", "rig": "robot", "steps": [
    _step(1, "setup", [], ["launched"], [], new_launch=True),
    _step(2, "run", ["launched"], ["launched"],
          [{"item": "BUG-1", "do": [0, 1], "pass": True}]),
    _step(3, "restore", ["launched"], [], [{"item": "BUG-1", "do": []}]),
]}


@pytest.fixture
def rb_repo(tmp_path, git_env):  # noqa: F811
    repo = make_repo(str(tmp_path / "repo"))
    with open(os.path.join(repo, "map", "bug-lvl.md"), "w") as fh:
        fh.write(_item("Level one", "level", item_id="BUG-1"))
    os.makedirs(os.path.join(repo, "map", "sheets"))
    with open(os.path.join(repo, "map", "sheets", NAME + ".yaml"), "w") as fh:
        yaml.safe_dump(SHEET, fh, sort_keys=False)
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


def _res_path(repo):
    return os.path.join(repo, "map", "sheets", NAME + ".results.yaml")


def test_list_and_get(c):
    rows = c.get("/api/v1/sheets").json()["sheets"]
    assert [(r["name"], r["rig"], r["steps"], r["saved"]) for r in rows] == [(NAME, "robot", 3, 0)]
    data = c.get("/api/v1/sheets/" + NAME).json()
    assert data["name"] == NAME and data["results"] == {"schema": 1, "steps": {}, "verdicts": {}}
    assert isinstance(data["check_errors"], list)
    assert isinstance(data["state_help"], dict)
    s1, s2, s3 = data["steps"]
    assert s1["new_launch"] is True and s1["from_"] == [] and s1["optional"] is False
    sv = s2["serves"][0]
    assert sv["verdict"] is True and sv["pass_text"] == "it works" and sv["task_id"]
    assert sv["task_id"] != "BUG-1" and sv["kind"] == "bug"
    assert s3["serves"][0]["verdict"] is False


def test_404(c):
    assert c.get("/api/v1/sheets/2026-01-01-robot").status_code == 404
    assert c.get("/api/v1/sheets/not-a-name").status_code == 404


def test_save_status_step(c, rb_repo):
    r = c.post("/api/v1/sheets/%s/steps/1" % NAME,
               json={"status": "done", "comments": "ok", "date": "2026-11-10", "time": "10:05"})
    assert r.status_code == 200
    assert r.json()["steps"]["1"] == {"status": "done", "comments": "ok", "saved_at": "2026-11-10 10:05"}
    assert yaml.safe_load(open(_res_path(rb_repo)))["steps"][1]["status"] == "done"
    assert c.get("/api/v1/sheets").json()["sheets"][0]["saved"] == 1
    assert c.get("/api/v1/sheets/" + NAME).json()["results"]["steps"]["1"]["status"] == "done"


def test_save_verdict_step_writes_item(c, rb_repo):
    r = c.post("/api/v1/sheets/%s/steps/2" % NAME, json={
        "verdicts": {"BUG-1": {"verdict": "pass", "notes": "clean"}}, "comments": "fine",
        "date": "2026-11-10", "time": "10:30"})
    assert r.status_code == 200, r.text
    assert r.json()["verdicts"]["2"]["BUG-1"]["verdict"] == "pass"
    text = open(os.path.join(rb_repo, "map", "bug-lvl.md")).read()
    assert text.count("## Sitting result (2026-11-10") == 1
    assert "clean (sheet %s, step 2)" % NAME in text
    assert os.path.exists(_res_path(rb_repo))
    again = c.post("/api/v1/sheets/%s/steps/2" % NAME, json={
        "verdicts": {"BUG-1": {"verdict": "fail", "notes": ""}}, "date": "2026-11-10"})
    assert again.status_code == 200
    assert open(os.path.join(rb_repo, "map", "bug-lvl.md")).read().count("## Sitting result") == 2


def test_unchanged_verdict_resave_adds_no_item_result(c, rb_repo):
    body = {"verdicts": {"BUG-1": {"verdict": "pass", "notes": "clean"}}, "date": "2026-11-10", "time": "10:30"}
    assert c.post("/api/v1/sheets/%s/steps/2" % NAME, json=body).status_code == 200
    again = c.post("/api/v1/sheets/%s/steps/2" % NAME, json=dict(body, comments="comment added later"))
    assert again.status_code == 200
    assert again.json()["steps"]["2"]["comments"] == "comment added later"
    assert open(os.path.join(rb_repo, "map", "bug-lvl.md")).read().count("## Sitting result") == 1


def test_impossible_date_is_a_refusal_and_writes_nothing(c, rb_repo):
    r = c.post("/api/v1/sheets/%s/steps/2" % NAME, json={
        "verdicts": {"BUG-1": {"verdict": "pass", "notes": ""}}, "date": "2026-13-45"})
    assert r.status_code == 422
    assert not os.path.exists(_res_path(rb_repo))
    assert "## Sitting result" not in open(os.path.join(rb_repo, "map", "bug-lvl.md")).read()


@pytest.mark.parametrize("n,body", [
    (1, {"verdicts": {"BUG-1": {"verdict": "pass", "notes": ""}}}),   # a verdict on a step with none
    (2, {"status": "done"}),                                         # a status on a verdict step
    (2, {"verdicts": {"BUG-9": {"verdict": "pass", "notes": ""}}}),  # an unknown Item
    (2, {"verdicts": {"BUG-1": {"verdict": "great", "notes": ""}}}),
    (1, {"status": "maybe"}),
    (9, {"status": "done"}),                                         # no such step
])
def test_refusals_write_nothing(c, rb_repo, n, body):
    before = open(os.path.join(rb_repo, "map", "bug-lvl.md")).read()
    r = c.post("/api/v1/sheets/%s/steps/%d" % (NAME, n), json=dict(body, date="2026-11-10"))
    assert r.status_code == 422, r.text
    assert open(os.path.join(rb_repo, "map", "bug-lvl.md")).read() == before
    assert not os.path.exists(_res_path(rb_repo))


def test_bad_date_422_and_unknown_sheet_404(c):
    assert c.post("/api/v1/sheets/%s/steps/1" % NAME, json={"status": "done"}).status_code == 422
    assert c.post("/api/v1/sheets/2026-01-01-robot/steps/1",
                  json={"status": "done", "date": "2026-11-10"}).status_code == 404


def test_writer_commits_a_dirty_results_file(rb_repo):
    """A results file left dirty by a process that died inside the debounce is committed at start."""
    from server.gitwriter import Banner, GitWriter
    with open(_res_path(rb_repo), "w") as fh:
        yaml.safe_dump({"schema": 1, "steps": {1: {"status": "done"}}, "verdicts": {}}, fh)
    w = GitWriter(rb_repo, Banner(), debounce_ms=10_000)
    left = w._uncommitted()
    assert list(left) == ["map/sheets/%s.results.yaml" % NAME]
    assert left["map/sheets/%s.results.yaml" % NAME] == ("Sitting sheet %s.results" % NAME, False)
    w._commit(["Sitting sheet x"])
    assert git(rb_repo, "status", "--porcelain").strip() == ""


def test_payload_cache_hits_then_results_write_invalidates(c, rb_repo, monkeypatch):
    from mapkit import sheet as sheetlib
    name = c.get("/api/v1/sheets").json()["sheets"][0]["name"]
    calls = []
    real = sheetlib.enrich
    monkeypatch.setattr(sheetlib, "enrich", lambda *a, **k: calls.append(1) or real(*a, **k))
    first = c.get("/api/v1/sheets/%s" % name).json()
    assert c.get("/api/v1/sheets/%s" % name).json() == first
    assert len(calls) == 1  # the second GET was served from the cache
    # a results write by anything (here: straight to the file) must not leave a stale answer
    p = _res_path(rb_repo)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write("schema: 1\nsteps:\n  1: {status: done, comments: x, saved_at: '2026-11-10 10:00'}\nverdicts: {}\n")
    after = c.get("/api/v1/sheets/%s" % name).json()
    assert len(calls) == 2
    assert after["results"]["steps"]["1"]["status"] == "done"


def test_payload_cache_invalidated_by_item_edit_save_and_sheet_edit(c, rb_repo, monkeypatch):
    from mapkit import sheet as sheetlib
    calls = []
    real = sheetlib.enrich
    monkeypatch.setattr(sheetlib, "enrich", lambda *a, **k: calls.append(1) or real(*a, **k))
    url = "/api/v1/sheets/%s" % NAME
    first = c.get(url).json()
    assert first["steps"][1]["serves"][0]["title"] == "Level one"
    c.get(url)
    assert len(calls) == 1
    # an Item edited in place (new commit pulled into the clone) changes what the sheet shows
    p = os.path.join(rb_repo, "map", "bug-lvl.md")
    with open(p, encoding="utf-8") as fh:
        text = fh.read()
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(text.replace("Level one", "Level uno"))
    assert c.get(url).json()["steps"][1]["serves"][0]["title"] == "Level uno"
    assert len(calls) == 2
    # a save through the API invalidates too
    r = c.post(url + "/steps/1", json={"status": "done", "date": "2026-11-10", "time": "10:00"})
    assert r.status_code == 200
    assert c.get(url).json()["results"]["steps"]["1"]["status"] == "done"
    assert len(calls) == 3
    # the sheet file itself (stat changes) and the parse cache the save path uses
    sp = os.path.join(rb_repo, "map", "sheets", NAME + ".yaml")
    with open(sp, encoding="utf-8") as fh:
        body = fh.read()
    with open(sp, "w", encoding="utf-8") as fh:
        fh.write(body.replace("Step 3 title", "Step three"))
    assert c.get(url).json()["steps"][2]["title"] == "Step three"
    r = c.post(url + "/steps/3", json={"status": "done", "date": "2026-11-10", "time": "10:01"})
    assert r.status_code == 200
