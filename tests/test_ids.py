"""Short Item IDs in the app (plan map-item-ids.md, P4): ``short_id`` on every Task,
``/tasks/{JB-n}`` resolution, server-side allocation, ``id`` immutability, the
history cache key, and the git writer's post-rebase repair of its own Items."""
from __future__ import annotations

import os
import subprocess

import pytest

from tests.conftest import make_repo
from tests.test_p5_writer_watcher import git, git_env, make_client, patch, remote_log, tasks, wait_for  # noqa: F401

API = "/api/v1"
IDS = {"pathway-alpha": "JB-1", "pathway-beta": "JB-2", "bug-wobbly-leg": "JB-3",
       "idea-shiny-thing": "JB-4", "ticket-alpha-question": "JB-5"}


def with_ids(repo: str) -> str:
    """Give the fixture Items JB-1..JB-5 (a one-line text edit, mapkit's own)."""
    from server.config import ensure_mapkit
    ensure_mapkit(repo)  # mapkit is imported from the checkout, as the server does
    from mapkit import ids
    from mapkit.items import load_item
    for st, sid in IDS.items():
        ids.set_id(load_item(os.path.join(repo, "map", st + ".md")), sid)
    return repo


@pytest.fixture
def c(tmp_path):
    repo = with_ids(make_repo(str(tmp_path / "repo")))
    app, client = make_client(repo, git=False, watch=False)
    with client:
        yield client


def url(c, ref):
    pid = c.get(API + "/projects").json()[0]["id"]
    return "%s/projects/%s/tasks/%s" % (API, pid, ref)


def test_every_task_carries_short_id(c):
    _, ts = tasks(c)
    assert ts["wobbly-leg"]["short_id"] == "JB-3"
    plans = [t for t in ts.values() if t["kind"] in ("plan", "phase")]
    assert plans and all(t["short_id"] is None for t in plans)


def test_get_resolves_an_id_in_every_read_form(c):
    _, ts = tasks(c)
    want = c.get(url(c, ts["wobbly-leg"]["id"])).json()
    for ref in ("JB-3", "jb-3", "jb3", "3"):
        r = c.get(url(c, ref))
        assert r.status_code == 200 and r.json() == want, ref
    assert c.get(url(c, "JB-99")).status_code == 404
    assert c.get(url(c, "not-a-thing")).status_code == 404


def test_writes_refuse_bare_digits_and_accept_the_prefixed_id(c):
    r = c.patch(url(c, "3"), json={"title": "Bare"})
    assert r.status_code == 422 and "JB-3" in r.json()["detail"]
    assert c.delete(url(c, "3")).status_code == 422
    r = c.patch(url(c, "jb-3"), json={"title": "By id"})
    assert r.status_code == 200 and r.json()["title"] == "By id" and r.json()["short_id"] == "JB-3"


def test_patch_carrying_a_different_id_is_422_and_the_same_one_is_fine(c):
    _, ts = tasks(c)
    t = ts["wobbly-leg"]
    for body in ({"short_id": "JB-9"}, {"id": "0" * 32}, {"short_id": None}):
        r = c.patch(url(c, t["id"]), json=dict(body, title="X"))
        assert r.status_code == 422, body
    r = c.patch(url(c, t["id"]), json={"short_id": "JB-3", "id": t["id"], "title": "Same"})
    assert r.status_code == 200
    with open(os.path.join(c.app.state.config.repo_root, "map", "bug-wobbly-leg.md")) as fh:
        assert fh.read().startswith("---\nid: JB-3\n")


def test_create_allocates_the_next_id_and_refuses_a_supplied_one(c):
    pid = c.get(API + "/projects").json()[0]["id"]
    r = c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": "New one"})
    assert r.status_code == 201 and r.json()["short_id"] == "JB-6"
    r = c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "idea", "title": "Next"})
    assert r.json()["short_id"] == "JB-7"
    r = c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": "Mine",
                                                          "short_id": "JB-100"})
    assert r.status_code == 422


def test_history_by_id_shares_the_uuid_cache_entry(c):
    _, ts = tasks(c)
    uuid = ts["wobbly-leg"]["id"]
    a = c.get(url(c, "JB-3") + "/history")
    b = c.get(url(c, uuid) + "/history")
    assert a.status_code == b.status_code == 200 and a.json() == b.json()
    assert set(c.app.state.history._cache) == {uuid}


def test_a_duplicated_id_is_a_health_error_and_a_409(c):
    from mapkit import ids
    from mapkit.items import load_item
    repo = c.app.state.config.repo_root
    ids.set_id(load_item(os.path.join(repo, "map", "idea-shiny-thing.md")), "JB-3")
    h = c.get(API + "/health").json()
    assert h["status"] == "degraded"
    assert sum("JB-3 also on" in e["message"] for e in h["errors"]) == 2
    assert c.get(url(c, "JB-3")).status_code == 409


# ------------------------------------------------------------ git writer ---

@pytest.fixture
def id_remote(tmp_path, git_env):
    """(checkout on main with JB-1..JB-5 committed and pushed, bare remote, other clone)."""
    bare = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--quiet", "--bare", str(bare)], check=True)
    git(bare, "symbolic-ref", "HEAD", "refs/heads/main")
    repo = with_ids(make_repo(str(tmp_path / "repo")))
    git(repo, "init", "--quiet")
    git(repo, "checkout", "--quiet", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "seed")
    git(repo, "remote", "add", "origin", str(bare))
    git(repo, "push", "--quiet", "-u", "origin", "main")
    other = tmp_path / "other"
    subprocess.run(["git", "clone", "--quiet", str(bare), str(other)], check=True)
    return repo, bare, other


def push_items_from(other, specs):
    """Another writer files Items carrying the given IDs and pushes."""
    from mapkit.items import write_item
    for slug, sid in specs:
        write_item(str(other / "map" / ("bug-%s.md" % slug)),
                   {"id": sid, "kind": "bug", "title": "Other " + slug, "status": "inbox",
                    "created": "2026-10-26", "updated": "2026-10-26T00:00:00Z",
                    "filed_by": "claude"}, "x\n")
    git(other, "pull", "--quiet", "--rebase")
    git(other, "add", "-A")
    git(other, "commit", "--quiet", "-m", "map: file two")
    git(other, "push", "--quiet", "origin", "main")


def remote_ids(bare):
    out = git(bare, "grep", "-h", "^id: JB-", "main", "--", "map/")
    return sorted(l.split()[1] for l in out.splitlines())


def test_two_own_unpushed_items_colliding_after_the_rebase_are_both_renumbered(id_remote):
    repo, bare, other = id_remote
    app, c = make_client(repo, git=True, debounce_ms=1500, watch_ms=50)
    with c:
        w = app.state.writer
        pid = c.get(API + "/projects").json()[0]["id"]
        mine = [c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": t}).json()
                for t in ("App one", "App two")]
        assert [m["short_id"] for m in mine] == ["JB-6", "JB-7"]
        push_items_from(other, [("phone-a", "JB-6"), ("phone-b", "JB-7")])  # before our flush
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        assert w.successes == 1, w.last_error
        assert remote_ids(bare) == sorted("JB-%d" % n for n in range(1, 10))
        _, ts = tasks(c)  # the index was refreshed: the tiles show the new IDs
        assert {ts["app-one"]["short_id"], ts["app-two"]["short_id"]} == {"JB-8", "JB-9"}
        assert ts["phone-a"]["short_id"] == "JB-6" and ts["phone-b"]["short_id"] == "JB-7"
    subjects = [e.split("|")[3] for e in remote_log(bare)]
    assert subjects[0].startswith("map: renumber JB-6 -> JB-8 bug-app-one")
    assert subjects[1] == "map: App one; App two"  # app subjects carry no ID


def _chmod_tree(root, writable):
    for d, _dirs, files in os.walk(str(root)):
        for name in [d] + [os.path.join(d, f) for f in files]:
            mode = os.stat(name).st_mode
            os.chmod(name, (mode | 0o222) if writable else (mode & ~0o222))


def test_a_rejected_push_then_the_next_flush_repairs_and_pushes(id_remote):
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        pytest.skip("root ignores the read-only remote")
    repo, bare, other = id_remote
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    try:
        with c:
            w = app.state.writer
            pid = c.get(API + "/projects").json()[0]["id"]
            _chmod_tree(bare, writable=False)
            c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": "Stuck one"})
            assert wait_for(lambda: w.attempts >= 1 and w.idle())
            assert app.state.banner.get()["level"] == "error"
            _chmod_tree(bare, writable=True)
            push_items_from(other, [("phone-c", "JB-6")])
            c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "idea", "title": "Later"})
            assert wait_for(lambda: w.attempts >= 2 and w.idle())
            assert w.successes == 1, w.last_error
            assert remote_ids(bare) == sorted("JB-%d" % n for n in range(1, 9))
            _, ts = tasks(c)
            assert ts["phone-c"]["short_id"] == "JB-6"
            assert {ts["stuck-one"]["short_id"], ts["later"]["short_id"]} == {"JB-7", "JB-8"}
    finally:
        _chmod_tree(bare, writable=True)


def test_a_new_item_is_unpushed_until_its_push_lands(id_remote):
    repo, bare, _ = id_remote
    app, c = make_client(repo, git=True, debounce_ms=800, watch_ms=50)
    with c:
        w = app.state.writer
        pid = c.get(API + "/projects").json()[0]["id"]
        made = c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": "Fresh"})
        assert made.json()["unpushed"] is True and made.json()["short_id"] == "JB-6"
        _, ts = tasks(c)
        assert ts["fresh"]["unpushed"] is True
        assert ts["wobbly-leg"]["unpushed"] is False  # edits of pushed Items never are
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        assert w.successes == 1, w.last_error
        _, ts = tasks(c)
        assert ts["fresh"]["unpushed"] is False
    assert "JB-6" in remote_ids(bare)


def test_unpushed_survives_a_restart_from_the_git_state(id_remote):
    repo, _, _ = id_remote
    from mapkit.items import write_item
    write_item(os.path.join(repo, "map", "bug-left-over.md"),
               {"id": "JB-6", "kind": "bug", "title": "Left over", "status": "inbox",
                "created": "2026-10-26", "updated": "2026-10-26T00:00:00Z", "filed_by": "harrison"},
               "x\n")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "map: Left over")  # committed by a previous run, never pushed
    app, c = make_client(repo, git=True, debounce_ms=60000, watch=False)
    with c:
        _, ts = tasks(c)
        assert ts["left-over"]["unpushed"] is True and ts["wobbly-leg"]["unpushed"] is False


# ----------------------------------- a malformed Item never silences the writer ---

BAD = ("---\nid: %s\nkind: bug\ntitle: Hand pushed\nstatus: bogus\ncreated: 2026-10-26\n"
       "updated: 2026-10-26T00:00:00Z\nfiled_by: harrison\n---\n\nx\n")


def push_malformed_from(other, slug, sid):
    """A hand push of an Item the loader refuses (``status: bogus``)."""
    with open(str(other / "map" / ("bug-%s.md" % slug)), "w", encoding="utf-8") as fh:
        fh.write(BAD % sid)
    git(other, "pull", "--quiet", "--rebase")
    git(other, "add", "-A")
    git(other, "commit", "--quiet", "-m", "map: hand push")
    git(other, "push", "--quiet", "origin", "main")


def test_a_malformed_item_elsewhere_does_not_stop_the_renumber_or_the_push(id_remote):
    repo, bare, other = id_remote
    app, c = make_client(repo, git=True, debounce_ms=1500, watch_ms=50)
    with c:
        w = app.state.writer
        pid = c.get(API + "/projects").json()[0]["id"]
        made = c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": "Mine"})
        assert made.json()["short_id"] == "JB-6"
        push_items_from(other, [("phone-d", "JB-6")])  # collides with ours
        push_malformed_from(other, "broken", "JB-40")  # unloadable, and holds the highest ID
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        assert w.successes == 1, w.last_error
        assert app.state.banner.get()["level"] is None
        _, ts = tasks(c)
        assert ts["mine"]["short_id"] == "JB-41"  # past the unloadable file's JB-40
        assert ts["mine"]["unpushed"] is False
    assert remote_ids(bare) == sorted(["JB-%d" % n for n in range(1, 7)] + ["JB-40", "JB-41"])


def test_an_unloadable_file_holding_our_id_still_forces_the_renumber(id_remote):
    repo, bare, other = id_remote
    app, c = make_client(repo, git=True, debounce_ms=1500, watch_ms=50)
    with c:
        w = app.state.writer
        pid = c.get(API + "/projects").json()[0]["id"]
        c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": "Mine too"})
        push_malformed_from(other, "broken", "JB-6")  # the same ID, in a file nobody can load
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        assert w.successes == 1, w.last_error
        _, ts = tasks(c)
        assert ts["mine-too"]["short_id"] == "JB-7"
        # A file the index skips still counts for the next allocation.
        nxt = c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "idea", "title": "After"})
        assert nxt.json()["short_id"] == "JB-8"
    assert remote_ids(bare).count("JB-6") == 1


def test_any_failure_in_the_renumber_sets_the_banner(id_remote, monkeypatch):
    from server import idrepair
    repo, bare, _ = id_remote

    def boom(*a, **k):
        raise ValueError("unexpected")

    monkeypatch.setattr(idrepair, "repair", boom)
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    with c:
        w = app.state.writer
        pid = c.get(API + "/projects").json()[0]["id"]
        c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": "Held"})
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        assert w.successes == 0
        b = app.state.banner.get()
        assert b["level"] == "error" and "not pushed: ValueError: unexpected" in b["message"]
        assert tasks(c)[1]["held"]["unpushed"] is True  # still provisional
        w.enabled = False  # keep the shutdown flush off the remote
    assert "JB-6" not in remote_ids(bare)


# --------------------------------------- a death inside the debounce window ---

def test_a_file_left_uncommitted_by_a_dead_process_is_committed_at_restart(id_remote):
    repo, bare, _ = id_remote
    app, c = make_client(repo, git=True, debounce_ms=60000, watch=False)
    with c:
        pid = c.get(API + "/projects").json()[0]["id"]
        c.post("%s/projects/%s/tasks" % (API, pid), json={"kind": "bug", "title": "Orphan"})
        patch(c, "wobbly-leg", {"title": "Wobbly leg, edited"})
        app.state.writer.enabled = False  # the process dies: no shutdown flush
    assert git(repo, "status", "--porcelain", "--", "map").strip()  # untracked + modified
    app, c = make_client(repo, git=True, debounce_ms=1500, watch=False)
    with c:
        w = app.state.writer
        _, ts = tasks(c)
        assert ts["orphan"]["unpushed"] is True  # provisional, not shown as settled
        assert ts["wobbly-leg"]["unpushed"] is False  # an edit of a pushed Item
        assert wait_for(lambda: w.attempts >= 1 and w.idle())  # no API edit needed
        assert w.successes == 1, w.last_error
        _, ts = tasks(c)
        assert ts["orphan"]["unpushed"] is False
    assert git(repo, "status", "--porcelain", "--", "map").strip() == ""
    assert "JB-6" in remote_ids(bare)
    assert "Wobbly leg, edited" in git(bare, "show", "main:map/bug-wobbly-leg.md")


def test_create_with_null_priority_keeps_the_default(c):
    """The new-item modal lets Priority go unselected and sends null; mapkit requires a
    priority on every item, so the server keeps its default instead of writing null."""
    pid = c.get(API + "/projects").json()[0]["id"]
    r = c.post("%s/projects/%s/tasks" % (API, pid),
               json={"kind": "idea", "title": "null priority", "priority": None})
    assert r.status_code == 201, r.text
    assert r.json()["priority"] == "medium"
