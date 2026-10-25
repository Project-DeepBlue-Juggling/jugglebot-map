"""Item history endpoint, nightly status endpoint, CORS."""
from __future__ import annotations

import os
import subprocess
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.nightly import NightlyCache, read_status
from tests.conftest import make_repo
from tests.test_p5_writer_watcher import git, git_env  # noqa: F401




def _api(client) -> str:
    return "/api/v1/projects/" + client.get("/api/v1/projects").json()[0]["id"]


def _bug_id(client) -> str:
    return next(t["id"] for t in client.get(_api(client) + "/tasks").json() if t.get("slug") == "wobbly-leg")


@pytest.fixture
def hist_repo(tmp_path, git_env):  # noqa: F811
    repo = make_repo(str(tmp_path / "repo"))
    git(repo, "init", "--quiet")
    git(repo, "checkout", "--quiet", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "seed")
    item = os.path.join(repo, "map", "bug-wobbly-leg.md")
    with open(item, "a") as fh:
        fh.write("\nmore\n")
    os.makedirs(os.path.join(repo, "logbook"), exist_ok=True)
    with open(os.path.join(repo, "logbook", "some-slug.md"), "w") as fh:
        fh.write("---\nx: 1\n---\n# The fix entry\n")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "fix the leg\n\nbody\n\nLogbook-Entry: some-slug")
    return repo


def _client(repo):
    app = create_app(repo, dist_dir=os.path.join(repo, "no-dist"), git=False, watch=False)
    return TestClient(app)


def test_history_order_trailer_documents(hist_repo, monkeypatch):
    monkeypatch.delenv("MAP_WEB_BASE", raising=False)
    git(hist_repo, "remote", "add", "origin", "git@github.com:org/repo.git")
    with _client(hist_repo) as c:
        h = c.get(_api(c) + "/tasks/%s/history" % _bug_id(c)).json()
    assert [x["subject"] for x in h["commits"]] == ["fix the leg", "seed"]
    assert h["commits"][0]["logbook_entry"] == "some-slug"
    assert h["commits"][1]["logbook_entry"] is None
    assert h["head"] == h["commits"][0]["sha"]
    assert h["commits"][0]["date"].startswith("20")
    assert h["documents"] == [{"kind": "logbook", "path": "logbook/some-slug.md", "title": "The fix entry",
                               "exists": True,
                               "url": "https://github.com/org/repo/blob/main/logbook/some-slug.md"}]


def test_history_links_missing_and_web_base(hist_repo, monkeypatch):
    monkeypatch.setenv("MAP_WEB_BASE", "https://web.example/blob/main/")
    item = os.path.join(hist_repo, "map", "bug-wobbly-leg.md")
    text = open(item).read().replace("links: []", "links:\n- plans/active/nope.md\n- https://x.example/a.md\n- ../out.md\n- logbook/some-slug.md")
    open(item, "w").write(text)
    with _client(hist_repo) as c:
        docs = c.get(_api(c) + "/tasks/%s/history" % _bug_id(c)).json()["documents"]
    assert [d["path"] for d in docs] == ["logbook/some-slug.md", "plans/active/nope.md"]
    assert docs[1]["exists"] is False and docs[1]["kind"] == "plan"
    assert docs[1]["url"] == "https://web.example/blob/main/plans/active/nope.md"


def test_history_no_remote_null_url_and_cache_follows_head(hist_repo, monkeypatch):
    monkeypatch.delenv("MAP_WEB_BASE", raising=False)
    with _client(hist_repo) as c:
        tid = _bug_id(c)
        assert c.get(_api(c) + "/tasks/%s/history" % tid).json()["documents"][0]["url"] is None
        n = len(c.get(_api(c) + "/tasks/%s/history" % tid).json()["commits"])
        with open(os.path.join(hist_repo, "map", "bug-wobbly-leg.md"), "a") as fh:
            fh.write("again\n")
        git(hist_repo, "commit", "--quiet", "-am", "third")
        assert len(c.get(_api(c) + "/tasks/%s/history" % tid).json()["commits"]) == n + 1
        assert c.get(_api(c) + "/tasks/nope/history").status_code == 404


def test_history_untracked_is_empty(repo):
    with _client(repo) as c:  # fixture repo is not a git checkout
        h = c.get(_api(c) + "/tasks/%s/history" % _bug_id(c))
    assert h.status_code == 200
    assert h.json()["commits"] == [] and h.json()["documents"] == []


# --- nightly -------------------------------------------------------------------

def _status(tmp_path, line):
    (tmp_path / "status").write_text(line + "\n")
    return str(tmp_path)


def _iso(days_ago):
    return (date.today() - timedelta(days=days_ago)).isoformat()


@pytest.mark.parametrize("line,state", [
    ("GREEN 1200 passed %s", "GREEN"), ("RED 3 failed %s", "RED"), ("DEFERRED robot live %s", "DEFERRED")])
def test_nightly_states(tmp_path, line, state):
    d = _status(tmp_path, line % _iso(0))
    r = read_status(d)
    assert r["state"] == state and r["configured"] is True and r["age_days"] == 0
    assert r["date"] == _iso(0) and r["line"] == line % _iso(0)


def test_nightly_stale_never_unset(tmp_path):
    r = read_status(_status(tmp_path, "GREEN 1 passed %s" % _iso(5)))
    assert r["state"] == "STALE" and r["age_days"] == 5
    empty = tmp_path / "empty"
    empty.mkdir()
    assert read_status(str(empty)) == {"state": "NEVER", "line": None, "date": None, "age_days": None,
                                       "configured": True}
    assert read_status(None)["configured"] is False and read_status(None)["state"] == "NEVER"


def test_nightly_route_cached_and_latest(tmp_path, repo, monkeypatch):
    d = _status(tmp_path, "RED 2 failed %s" % datetime.now().date().isoformat())
    (tmp_path / "latest.md").write_text("# nightly\n")
    monkeypatch.setenv("MAP_NIGHTLY_DIR", d)
    app = create_app(repo, dist_dir=os.path.join(repo, "no-dist"), git=False, watch=False)
    with TestClient(app) as c:
        assert c.get("/api/v1/nightly").json()["state"] == "RED"
        (tmp_path / "status").write_text("GREEN 1 passed %s\n" % _iso(0))
        assert c.get("/api/v1/nightly").json()["state"] == "RED"  # served from cache, no disk read
        app.state.nightly.refresh()
        assert c.get("/api/v1/nightly").json()["state"] == "GREEN"
        r = c.get("/api/v1/nightly/latest")
        assert r.headers["content-type"].startswith("text/markdown") and r.text == "# nightly\n"
        os.remove(tmp_path / "latest.md")
        app.state.nightly.refresh()
        assert c.get("/api/v1/nightly/latest").status_code == 404


def test_nightly_unset_route(repo, monkeypatch):
    monkeypatch.delenv("MAP_NIGHTLY_DIR", raising=False)
    app = create_app(repo, dist_dir=os.path.join(repo, "no-dist"), git=False, watch=False)
    with TestClient(app) as c:
        assert c.get("/api/v1/nightly").json()["configured"] is False


# --- CORS ----------------------------------------------------------------------

def test_cors(repo, monkeypatch):
    hdr = {"Origin": "http://localhost:8081", "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "content-type,x-dev-user"}
    monkeypatch.delenv("MAP_CORS_ORIGINS", raising=False)
    with TestClient(create_app(repo, dist_dir="x", git=False, watch=False)) as c:
        assert "access-control-allow-origin" not in c.options(_api(c) + "/tasks", headers=hdr).headers
    monkeypatch.setenv("MAP_CORS_ORIGINS", "http://localhost:8081, http://jetson.local:8081")
    with TestClient(create_app(repo, dist_dir="x", git=False, watch=False)) as c:
        r = c.options(_api(c) + "/tasks", headers=hdr)
        assert r.headers["access-control-allow-origin"] == "http://localhost:8081"
        g = c.get(_api(c) + "/tasks", headers={"Origin": "http://jetson.local:8081"})
        assert g.headers["access-control-allow-origin"] == "http://jetson.local:8081"
