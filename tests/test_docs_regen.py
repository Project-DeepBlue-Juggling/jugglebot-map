"""The writer regenerates the committed pages after its rebase (``docs/project-map.md``
went stale on ``main`` after every app edit until 2026-10-30, red-lighting the
Jugglebot docs currency test). Same throwaway checkout + bare remote harness as
``test_p5_writer_watcher``; the fixture gains a GLOSSARY.md and generated pages."""
from __future__ import annotations

import os
import subprocess

import pytest

from tests.conftest import make_repo
from tests.test_p5_writer_watcher import (_chmod_tree, git, git_env, make_client,  # noqa: F401
                                          not_mid_rebase, patch, read, remote_log, wait_for)

PAGE = "docs/project-map.md"


def _gen(repo):
    from server.config import ensure_mapkit
    ensure_mapkit(str(repo))
    from mapkit import gen_docs
    return gen_docs.write_docs(str(repo))


@pytest.fixture
def docs_repo(tmp_path, git_env):
    """(checkout on main with current pages, the bare remote, a second clone)."""
    bare = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--quiet", "--bare", str(bare)], check=True)
    git(bare, "symbolic-ref", "HEAD", "refs/heads/main")
    repo = make_repo(str(tmp_path / "repo"))
    with open(os.path.join(repo, "GLOSSARY.md"), "w", encoding="utf-8") as fh:
        fh.write("# G\n\n## Language\n\n### Robot\n\n**Hand**: The cup.\n")
    os.makedirs(os.path.join(repo, "docs"))
    assert _gen(repo)
    git(repo, "init", "--quiet")
    git(repo, "checkout", "--quiet", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "seed")
    git(repo, "remote", "add", "origin", str(bare))
    git(repo, "push", "--quiet", "-u", "origin", "main")
    other = tmp_path / "other"
    subprocess.run(["git", "clone", "--quiet", str(bare), str(other)], check=True)
    return repo, bare, other


def _current(clone_dir):
    from mapkit import gen_docs
    return gen_docs.write_docs(str(clone_dir), check=True) == []


def _fresh_clone(bare, dest):
    subprocess.run(["git", "clone", "--quiet", str(bare), str(dest)], check=True)
    return dest


def test_an_app_edit_lands_with_a_regenerated_page(docs_repo, tmp_path):
    repo, bare, _ = docs_repo
    before = read(repo, PAGE)
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    with c:
        w = app.state.writer
        patch(c, "wobbly-leg", {"title": "Leg renamed"})
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        assert w.successes == 1 and app.state.banner.get()["level"] is None
    log = remote_log(bare)
    assert [e.split("|")[3] for e in log] == [
        "map: regenerate project-map page", "map: Leg renamed", "seed"]
    assert log[0].split("|")[0] == "map-bot"
    assert git(bare, "show", "--name-only", "--format=", "main").split() == [PAGE]
    assert read(repo, PAGE) != before and "Leg renamed" in read(repo, PAGE)
    assert _current(_fresh_clone(bare, tmp_path / "check"))
    assert git(repo, "status", "--porcelain", "--", "map", "docs") == ""


def test_an_edit_that_leaves_the_page_unchanged_adds_no_regen_commit(docs_repo):
    repo, bare, _ = docs_repo
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    with c:
        w = app.state.writer
        patch(c, "wobbly-leg", {"description": "A body edit the page does not show."})
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        assert w.successes == 1
    subjects = [e.split("|")[3] for e in remote_log(bare)]
    assert "map: regenerate project-map page" not in subjects


def test_a_peer_page_after_a_rejected_push_merges_and_the_page_ends_current(docs_repo, tmp_path):
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        pytest.skip("root ignores the read-only remote")
    repo, bare, other = docs_repo
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    try:
        _chmod_tree(bare, writable=False)
        with c:
            w = app.state.writer
            patch(c, "wobbly-leg", {"title": "Local title"})
            assert wait_for(lambda: w.attempts >= 1 and w.idle())
            assert app.state.banner.get()["level"] == "error"
            # the rejected push left the edit AND its regen commit local
            assert git(repo, "log", "-1", "--format=%s").strip() == "map: regenerate project-map page"
            _chmod_tree(bare, writable=True)
            # a peer changes another Item and commits its own regenerated page
            path = os.path.join(str(other), "map", "idea-shiny-thing.md")
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text.replace("title: Shiny thing", "title: Peer title"))
            assert _gen(other)
            git(other, "commit", "--quiet", "-am", "peer edit + page")
            git(other, "push", "--quiet", "origin", "main")
            # the next edit's rebase replays our page commit over the peer's: no conflict
            patch(c, "wobbly-leg", {"title": "Local again"})
            assert wait_for(lambda: w.attempts >= 2 and w.idle())
            assert w.successes == 1, app.state.banner.get()
            assert app.state.banner.get()["level"] is None
            assert not_mid_rebase(repo)
    finally:
        _chmod_tree(bare, writable=True)
    check = _fresh_clone(bare, tmp_path / "check")
    assert _current(check)
    page = read(check, PAGE)
    assert "Local again" in page and "Peer title" in page
    assert "<<<<<<<" not in page


def test_start_restores_a_page_left_dirty_and_sets_the_union_attribute(docs_repo):
    repo, _, _ = docs_repo
    head = read(repo, PAGE)
    with open(os.path.join(repo, PAGE), "a", encoding="utf-8") as fh:
        fh.write("half-written\n")
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    with c:
        assert app.state.writer.enabled
        assert read(repo, PAGE) == head
        assert git(repo, "status", "--porcelain", "--", "map", "docs") == ""
        attrs = read(repo, ".git/info/attributes").splitlines()
        assert "docs/project-map.md merge=union" in attrs and "docs/glossary.md merge=union" in attrs


def test_a_failed_regeneration_restores_the_pages_and_banners(docs_repo, monkeypatch):
    repo, bare, _ = docs_repo
    app, c = make_client(repo, git=True, debounce_ms=200, watch_ms=50)
    with c:
        from mapkit import gen_docs

        def broken(root, check=False):
            with open(os.path.join(root, PAGE), "a", encoding="utf-8") as fh:
                fh.write("partial\n")
            raise OSError("disk full")

        monkeypatch.setattr(gen_docs, "write_docs", broken)
        w = app.state.writer
        patch(c, "wobbly-leg", {"title": "Edit before a failure"})
        assert wait_for(lambda: w.attempts >= 1 and w.idle())
        b = app.state.banner.get()
        assert b["level"] == "error" and "disk full" in b["message"]
        assert git(repo, "status", "--porcelain", "--", "docs") == ""  # page back at HEAD
        monkeypatch.undo()
        patch(c, "wobbly-leg", {"title": "Edit after"})
        assert wait_for(lambda: w.attempts >= 2 and w.idle())
        assert w.successes == 1 and app.state.banner.get()["level"] is None
    assert _current(_fresh_clone(bare, os.path.join(os.path.dirname(str(bare)), "check")))
