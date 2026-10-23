"""P5 server side: the debounced map-bot commit-and-push, its failure modes (rebase
conflict, push failure), the branch rule, the one-``invalidate``-per-burst watcher
and ``--no-git``. Every git test runs a throwaway checkout against a throwaway BARE
remote in tmp_path, with HOME and the identity variables pinned so a missing (or
present) global git identity cannot change the result."""
from __future__ import annotations

import os
import socket
import stat
import subprocess
import threading
import time

import pytest

from tests.conftest import make_repo

API = "/api/v1"


# ------------------------------------------------------------- helpers ---

@pytest.fixture
def git_env(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    monkeypatch.delenv("GIT_DIR", raising=False)
    for who in ("AUTHOR", "COMMITTER"):
        monkeypatch.setenv("GIT_%s_NAME" % who, "Tester")
        monkeypatch.setenv("GIT_%s_EMAIL" % who, "tester@example.invalid")
    return home


def git(cwd, *args) -> str:
    p = subprocess.run(["git", "-C", str(cwd)] + list(args), capture_output=True, text=True)
    assert p.returncode == 0, "git %s: %s" % (" ".join(args), p.stderr)
    return p.stdout


@pytest.fixture
def remote_repo(tmp_path, git_env):
    """(checkout on main tracking origin/main, the bare remote, a second clone)."""
    bare = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--quiet", "--bare", str(bare)], check=True)
    git(bare, "symbolic-ref", "HEAD", "refs/heads/main")
    repo = make_repo(str(tmp_path / "repo"))
    git(repo, "init", "--quiet")
    git(repo, "checkout", "--quiet", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "seed")
    git(repo, "remote", "add", "origin", str(bare))
    git(repo, "push", "--quiet", "-u", "origin", "main")
    other = tmp_path / "other"
    subprocess.run(["git", "clone", "--quiet", str(bare), str(other)], check=True)
    return repo, bare, other


def wait_for(pred, timeout=15.0, step=0.05):
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(step)
    return False


def make_client(repo, **kw):
    from fastapi.testclient import TestClient

    from server.app import create_app
    app = create_app(repo, dist_dir=os.path.join(repo, "no-dist"), **kw)
    return app, TestClient(app)


def tasks(c):
    pid = c.get(API + "/projects").json()[0]["id"]
    return pid, {t["slug"]: t for t in c.get("%s/projects/%s/tasks" % (API, pid)).json()}


def patch(c, slug, body):
    pid, ts = tasks(c)
    r = c.patch("%s/projects/%s/tasks/%s" % (API, pid, ts[slug]["id"]), json=body)
    assert r.status_code == 200, r.text
    return r


def remote_log(bare):
    out = git(bare, "log", "--format=%an|%ae|%cn|%s|%b%x00", "main")
    return [e.strip() for e in out.split("\x00") if e.strip()]


def read(repo, rel):
    with open(os.path.join(repo, rel), encoding="utf-8") as fh:
        return fh.read()


def not_mid_rebase(repo):
    gd = os.path.join(repo, ".git")
    st = git(repo, "status", "--porcelain=v1")
    return (not os.path.exists(os.path.join(gd, "rebase-merge"))
            and not os.path.exists(os.path.join(gd, "rebase-apply"))
            and not any(line[:2] in ("UU", "AA", "DU", "UD") for line in st.splitlines()))


# -------------------------------------------------------------- writer ---

def test_debounce_coalesces_three_edits_into_one_bot_commit(remote_repo):
    repo, bare, _ = remote_repo
    app, c = make_client(repo, git=True, debounce_ms=600, watch_ms=50)
    with c:
        w = app.state.writer
        assert w is not None and w.enabled
        patch(c, "wobbly-leg", {"title": "Leg one"})
        patch(c, "shiny-thing", {"title": "Shiny two"})
        patch(c, "wobbly-leg", {"title": "Leg three"})
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        time.sleep(0.8)  # a second (wrong) flush would land inside this
        assert w.attempts == 1 and w.successes == 1
    log = remote_log(bare)
    assert len(log) == 2  # seed + exactly one bot commit
    an, ae, cn, subj, body = log[0].split("|", 4)
    assert (an, ae, cn) == ("map-bot", "map-bot@jugglebot.local", "map-bot")
    assert subj == "map: Shiny two; Leg three"  # one title per file, the latest, in edit order
    assert "Logbook-Entry" not in body and body == ""
    changed = git(bare, "show", "--name-only", "--format=", "main").split()
    assert sorted(changed) == ["map/bug-wobbly-leg.md", "map/idea-shiny-thing.md"]
    assert app.state.banner.get()["level"] is None


def test_subject_truncates_to_72():
    from server.gitwriter import subject
    s = subject(["a" * 40, "b" * 40])
    assert len(s) == 72 and s.endswith("...") and s.startswith("map: aaaa")
    assert subject(["Short"]) == "map: Short"


def test_rebase_conflict_keeps_the_edit_aborts_cleanly_and_retries(remote_repo):
    repo, bare, other = remote_repo
    path = os.path.join(str(other), "map", "bug-wobbly-leg.md")
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text.replace("title: Wobbly leg", "title: Remote title"))
    git(other, "commit", "--quiet", "-am", "remote edit")
    git(other, "push", "--quiet", "origin", "main")
    remote_head = git(bare, "rev-parse", "main").strip()

    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    with c:
        w = app.state.writer
        patch(c, "wobbly-leg", {"title": "Local title"})
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        b = app.state.banner.get()
        assert b["level"] == "error" and "git pull --rebase" in b["message"] and b["since"]
        assert c.get(API + "/health").json()["banner"] == b
        assert "title: Local title" in read(repo, "map/bug-wobbly-leg.md")  # edit on disk
        assert not_mid_rebase(repo)
        assert git(repo, "log", "-1", "--format=%an|%s").strip() == "map-bot|map: Local title"
        assert git(bare, "rev-parse", "main").strip() == remote_head  # nothing pushed

        patch(c, "shiny-thing", {"title": "Next edit"})  # the next edit retries
        assert wait_for(lambda: w.attempts >= 2 and w.idle())
        assert w.successes == 0 and app.state.banner.get()["level"] == "error"
        assert not_mid_rebase(repo)
        subjects = git(repo, "log", "-2", "--format=%s").split("\n")[:2]
        assert subjects == ["map: Next edit", "map: Local title"]  # both local commits kept
        assert "title: Local title" in read(repo, "map/bug-wobbly-leg.md")


def _chmod_tree(root, writable):
    for d, dirs, files in os.walk(str(root)):
        for n in files:
            os.chmod(os.path.join(d, n), 0o644 if writable else 0o444)
        os.chmod(d, 0o755 if writable else 0o555)


def test_push_failure_sets_banner_and_next_edit_succeeds(remote_repo):
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        pytest.skip("root ignores the read-only remote")
    repo, bare, _ = remote_repo
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    try:
        _chmod_tree(bare, writable=False)
        with c:
            w = app.state.writer
            patch(c, "wobbly-leg", {"title": "Unpushed"})
            assert wait_for(lambda: w.attempts >= 1 and w.idle())
            b = app.state.banner.get()
            assert b["level"] == "error" and "git push" in b["message"]
            assert len(remote_log(bare)) == 1
            _chmod_tree(bare, writable=True)
            patch(c, "shiny-thing", {"title": "Pushed now"})
            assert wait_for(lambda: w.attempts >= 2 and w.idle())
            assert w.successes == 1
            assert app.state.banner.get() == {"level": None, "message": "", "since": None}
    finally:
        _chmod_tree(bare, writable=True)
    subjects = [e.split("|")[3] for e in remote_log(bare)]
    assert subjects == ["map: Pushed now", "map: Unpushed", "seed"]


def test_writer_refuses_off_main_and_serves_read_only(remote_repo):
    repo, _, _ = remote_repo
    git(repo, "checkout", "--quiet", "-b", "feature-x")
    app, c = make_client(repo, git=None, watch=False)  # origin exists -> git defaults on
    with c:
        assert app.state.writer is not None and not app.state.writer.enabled
        h = c.get(API + "/health").json()
        assert h["banner"]["level"] == "warning" and "feature-x" in h["banner"]["message"]
        pid, ts = tasks(c)
        r = c.patch("%s/projects/%s/tasks/%s" % (API, pid, ts["wobbly-leg"]["id"]),
                    json={"title": "Nope"})
        assert r.status_code == 403
    assert "title: Wobbly leg" in read(repo, "map/bug-wobbly-leg.md")


def test_no_git_never_shells_out(repo, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("subprocess called under --no-git: %r" % (a,))
    monkeypatch.setattr(subprocess, "run", boom)
    monkeypatch.setattr(subprocess, "Popen", boom)
    os.makedirs(os.path.join(repo, ".git"))  # even a checkout-looking dir must not be probed
    app, c = make_client(repo, git=False, debounce_ms=50, watch_ms=50)
    with c:
        assert app.state.writer is None
        patch(c, "wobbly-leg", {"title": "Local only"})
        time.sleep(0.3)
    assert "title: Local only" in read(repo, "map/bug-wobbly-leg.md")


def test_cli_no_git_flag_reaches_create_app(repo, monkeypatch):
    import server.app as app_mod
    import uvicorn

    from server.cli import main
    seen = {}
    real = app_mod.create_app

    def spy(cfg, **kw):
        seen.update(kw)
        return real(cfg, **kw)
    monkeypatch.setattr(app_mod, "create_app", spy)
    monkeypatch.setattr(uvicorn, "run", lambda *a, **k: None)
    assert main(["--repo", repo, "--no-open", "--no-git", "--debounce-ms", "70",
                 "--watch-ms", "30"]) == 0
    assert seen == {"git": False, "debounce_ms": 70, "watch_ms": 30}


# ------------------------------------------------------------- watcher ---

def test_watcher_one_invalidate_per_burst(repo):
    import httpx
    import uvicorn

    from server.app import create_app
    app = create_app(repo, dist_dir=os.path.join(repo, "no-dist"), git=False, watch_ms=300)
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    events = []
    stop = threading.Event()

    def listen():
        try:
            with httpx.Client(timeout=httpx.Timeout(5.0, read=30.0)) as c:
                with c.stream("GET", "http://127.0.0.1:%d%s/events" % (port, API)) as resp:
                    for line in resp.iter_lines():
                        if stop.is_set():
                            return
                        if line.startswith("event:"):
                            events.append((time.time(), line))
        except Exception:
            pass

    def append(rel, text):
        with open(os.path.join(repo, rel), "a", encoding="utf-8") as fh:
            fh.write(text)

    try:
        assert wait_for(lambda: server.started, timeout=10)
        lt = threading.Thread(target=listen, daemon=True)
        lt.start()
        assert wait_for(lambda: app.state.broker.client_count == 1, timeout=10)
        assert wait_for(lambda: app.state.watcher.running, timeout=5)
        append("map/bug-wobbly-leg.md", "\nMore.\n")
        append("map/idea-shiny-thing.md", "\nMore.\n")
        append("GLOSSARY.md", "# Glossary\n")
        append("plans/active/alpha-plan.md", "\n")
        time.sleep(1.2)
        assert [e[1] for e in events] == ["event: invalidate"]
        append("map/bug-wobbly-leg.md", "\nLater.\n")
        time.sleep(1.0)
        assert [e[1] for e in events] == ["event: invalidate"] * 2
        # an untracked location never fires
        os.makedirs(os.path.join(repo, "elsewhere"), exist_ok=True)
        append("elsewhere/x.md", "x")
        time.sleep(0.8)
        assert len(events) == 2
        # the change is served: the appended body is in the rebuilt index
        r = httpx.get("http://127.0.0.1:%d%s/projects" % (port, API))
        pid = r.json()[0]["id"]
        ts = httpx.get("http://127.0.0.1:%d%s/projects/%s/tasks" % (port, API, pid)).json()
        assert "Later." in next(t for t in ts if t["slug"] == "wobbly-leg")["description"]
    finally:
        stop.set()
        server.should_exit = True
        th.join(timeout=5)
