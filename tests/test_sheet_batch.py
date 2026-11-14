"""A Sitting sheet's results are committed in batches (C9): one commit per Sitting stretch, not per step.

Flush triggers pinned here: a saved step that completes a Launch group, ``POST /close`` (End
Sitting), 20 minutes idle (shrunk), any other API flush (and then under its own subject, apart from
the Item's), and process restart. Every commit lands on the remote, which is what the push is for.
"""
from __future__ import annotations

import os

import yaml

from tests.test_p5_writer_watcher import (git, git_env, make_client, patch, read,  # noqa: F401
                                          remote_log, remote_repo, wait_for)
from tests.test_runbook import _item
from tests.test_sheets import NAME, _step

SHEET = {"schema": 1, "date": "2026-11-10", "rig": "robot", "steps": [
    _step(1, "setup", [], ["launched"], [], new_launch=True),
    _step(2, "run", ["launched"], ["launched"], [{"item": "BUG-1", "do": [0, 1], "pass": True}]),
    _step(3, "restore", ["launched"], [], [{"item": "BUG-1", "do": []}]),
    _step(4, "setup", [], ["launched"], [], new_launch=True),
    _step(5, "restore", ["launched"], [], []),
]}
API = "/api/v1"


def _seed(repo):
    with open(os.path.join(repo, "map", "bug-lvl.md"), "w") as fh:
        fh.write(_item("Level one", "level", item_id="BUG-1"))
    os.makedirs(os.path.join(repo, "map", "sheets"), exist_ok=True)
    with open(os.path.join(repo, "map", "sheets", NAME + ".yaml"), "w") as fh:
        yaml.safe_dump(SHEET, fh, sort_keys=False)
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "seed sheet")
    git(repo, "push", "--quiet", "origin", "main")


def _save(c, n, **body):
    body.setdefault("status", "done")
    r = c.post("%s/sheets/%s/steps/%d" % (API, NAME, n), json=dict(body, date="2026-11-10"))
    assert r.status_code == 200, r.text


def _subjects(bare):
    return [e.split("|")[3] for e in remote_log(bare)]


def test_saves_inside_the_window_give_one_commit_and_a_group_end_flushes(remote_repo):
    repo, bare, _ = remote_repo
    _seed(repo)
    base = len(_subjects(bare))
    app, c = make_client(repo, git=True, debounce_ms=100, watch_ms=50, batch_ms=60_000)
    with c:
        w = app.state.writer
        _save(c, 1)                                   # opens launch group 1
        _save(c, 2, verdicts={"BUG-1": {"notes": "clean"}})
        assert w.attempts == 0 and len(_subjects(bare)) == base  # nothing committed mid-group
        assert git(repo, "status", "--porcelain").strip()        # the results file waits on disk
        _save(c, 3)                                   # the last step of group 1
        assert wait_for(lambda: w.successes >= 1 and w.idle())
    subs = _subjects(bare)
    assert subs[0] == "map: Sitting sheet %s steps 1-3" % NAME and len(subs) == base + 1
    assert "## Sitting result" not in read(repo, "map/bug-lvl.md")  # no per-step Item write


def test_idle_timer_flushes(remote_repo):
    repo, bare, _ = remote_repo
    _seed(repo)
    app, c = make_client(repo, git=True, debounce_ms=100, watch_ms=50, batch_ms=400)
    with c:
        _save(c, 1)
        _save(c, 2)
        assert wait_for(lambda: app.state.writer.successes >= 1 and app.state.writer.idle())
    assert _subjects(bare)[0] == "map: Sitting sheet %s steps 1-2" % NAME


def test_close_flushes_and_answers_after_the_push(remote_repo):
    repo, bare, _ = remote_repo
    _seed(repo)
    app, c = make_client(repo, git=True, debounce_ms=100, watch_ms=50, batch_ms=60_000)
    with c:
        _save(c, 1)
        r = c.post("%s/sheets/%s/close" % (API, NAME))
        assert r.status_code == 200 and r.json()["flushed"] is True
        assert _subjects(bare)[0] == "map: Sitting sheet %s step 1" % NAME  # already on the remote
        assert c.post("%s/sheets/2026-01-01-robot/close" % API).status_code == 404


def test_another_write_flushes_the_batch_under_its_own_subject(remote_repo):
    repo, bare, _ = remote_repo
    _seed(repo)
    base = len(_subjects(bare))
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50, batch_ms=60_000)
    with c:
        w = app.state.writer
        _save(c, 1)
        patch(c, "wobbly-leg", {"title": "Leg one"})
        assert wait_for(lambda: w.successes >= 1 and w.idle())
    subs = _subjects(bare)
    assert subs[:2] == ["map: Leg one", "map: Sitting sheet %s step 1" % NAME]  # two commits, not one mixed
    assert len(subs) == base + 2
    changed = git(bare, "show", "--name-only", "--format=", "main~1").split()
    assert changed == ["map/sheets/%s.results.yaml" % NAME]


def test_restart_commits_a_left_results_file(remote_repo):
    repo, bare, _ = remote_repo
    _seed(repo)
    with open(os.path.join(repo, "map", "sheets", NAME + ".results.yaml"), "w") as fh:
        yaml.safe_dump({"schema": 2, "steps": {1: {"status": "done"}}, "verdicts": {}}, fh)
    app, c = make_client(repo, git=True, debounce_ms=100, watch_ms=50, batch_ms=60_000)
    with c:
        assert wait_for(lambda: app.state.writer.successes >= 1 and app.state.writer.idle())
    assert _subjects(bare)[0] == "map: Sitting sheet %s" % NAME
    assert git(repo, "status", "--porcelain").strip() == ""


def test_shutdown_flushes_the_batch(remote_repo):
    repo, bare, _ = remote_repo
    _seed(repo)
    app, c = make_client(repo, git=True, debounce_ms=100, watch_ms=50, batch_ms=60_000)
    with c:
        _save(c, 1)
    assert _subjects(bare)[0] == "map: Sitting sheet %s step 1" % NAME


def test_a_dirty_results_file_does_not_stop_a_fast_forward(remote_repo):
    """What the auto-pull does underneath a batch: ``pull --ff-only`` with the results file dirty."""
    repo, bare, other = remote_repo
    _seed(repo)
    git(other, "pull", "--quiet")
    with open(os.path.join(other, "map", "bug-lvl.md"), "a") as fh:
        fh.write("\nedited elsewhere\n")
    git(other, "add", "-A")
    git(other, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "elsewhere")
    git(other, "push", "--quiet", "origin", "main")
    app, c = make_client(repo, git=True, debounce_ms=100, watch_ms=50, batch_ms=60_000)
    with c:
        _save(c, 1)
        git(repo, "pull", "--quiet", "--ff-only")
        assert "edited elsewhere" in read(repo, "map/bug-lvl.md")
        assert c.post("%s/sheets/%s/close" % (API, NAME)).json()["flushed"] is True
    assert _subjects(bare)[0] == "map: Sitting sheet %s step 1" % NAME
