"""deploy/jetson/pull.sh restarts the server only when a pull changed mapkit/."""
import os
import subprocess
from pathlib import Path

PULL = Path(__file__).resolve().parent.parent / "deploy" / "jetson" / "pull.sh"


def git(cwd, *a):
    subprocess.run(["git", "-C", str(cwd), "-c", "user.name=t", "-c", "user.email=t@t", *a],
                   check=True, capture_output=True)


def commit(repo, rel, text):
    p = repo / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
    git(repo, "add", "-A")
    git(repo, "commit", "-m", "x")


def run(tmp_path, data):
    stub = tmp_path / "bin"
    stub.mkdir(exist_ok=True)
    log = tmp_path / "calls"
    s = stub / "systemctl"
    s.write_text('#!/bin/sh\necho "$@" >> "%s"\n' % log)
    s.chmod(0o755)
    env = dict(os.environ, PATH=f"{stub}:{os.environ['PATH']}", DATA_REPO=str(data), MAP_SERVICE="svc")
    r = subprocess.run(["bash", str(PULL)], env=env, capture_output=True, text=True)
    return r, (log.read_text() if log.exists() else "")


def make_repos(tmp_path):
    up = tmp_path / "up"
    up.mkdir()
    git(up, "init", "-q")
    git(up, "symbolic-ref", "HEAD", "refs/heads/main")
    commit(up, "mapkit/a.py", "1")
    commit(up, "map/x.md", "1")
    data = tmp_path / "data"
    subprocess.run(["git", "clone", "-q", str(up), str(data)], check=True)
    return up, data


def test_restart_on_mapkit_change(tmp_path):
    up, data = make_repos(tmp_path)
    commit(up, "mapkit/a.py", "2")
    r, calls = run(tmp_path, data)
    assert r.returncode == 0
    assert calls.strip() == "--user restart svc"


def test_no_restart_for_map_only_or_noop(tmp_path):
    up, data = make_repos(tmp_path)
    commit(up, "map/x.md", "2")
    r, calls = run(tmp_path, data)
    assert r.returncode == 0 and calls == ""
    r, calls = run(tmp_path, data)
    assert r.returncode == 0 and calls == ""
