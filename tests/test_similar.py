"""Duplicate / near-duplicate titles on create (``mapkit.similar`` through ``Store.create``).

A duplicate of an open Item is a 409 ``code: duplicate`` that ``allow_similar`` cannot
override (a retry after a client timeout must be answered, not filed again; the
2026-10-30 Robot-tab retries filed JB-103 four times). A near title is a 409
``code: similar`` listing the matches until the client resends with ``allow_similar``.
"""
from __future__ import annotations

import os

import pytest

from tests.conftest import make_repo
from tests.test_ids import with_ids
from tests.test_p5_writer_watcher import make_client

API = "/api/v1"


@pytest.fixture
def c(tmp_path):
    repo = with_ids(make_repo(str(tmp_path / "repo")))
    app, client = make_client(repo, git=False, watch=False)
    with client:
        yield client


def turl(c):
    pid = c.get(API + "/projects").json()[0]["id"]
    return "%s/projects/%s/tasks" % (API, pid)


def n_items(c):
    return len(os.listdir(os.path.join(c.app.state.config.repo_root, "map")))


@pytest.mark.parametrize("title", ["Wobbly leg", "  wobbly LEG!  ", "Wobbly-leg"])
def test_duplicate_of_an_open_item_is_refused_even_with_allow_similar(c, title):
    before = n_items(c)
    for extra in ({}, {"allow_similar": True}):
        r = c.post(turl(c), json=dict({"kind": "bug", "title": title}, **extra))
        assert r.status_code == 409, extra
        body = r.json()
        assert body["code"] == "duplicate" and body["similar"] == []
        assert body["detail"] == "Already filed as JB-3: Wobbly leg"
        d = body["duplicate"]
        assert (d["short_id"], d["stem"], d["status"], d["exact"]) == (
            "JB-3", "bug-wobbly-leg", "inbox", True)
        assert c.get("%s/%s" % (turl(c), d["id"])).json()["short_id"] == "JB-3"
    assert n_items(c) == before


def test_similar_is_refused_until_allowed(c):
    before = n_items(c)
    r = c.post(turl(c), json={"kind": "idea", "title": "Wobbly legs"})
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "similar" and body["duplicate"] is None
    assert [m["short_id"] for m in body["similar"]] == ["JB-3"]
    assert body["similar"][0]["exact"] is False and body["similar"][0]["score"] >= 0.8
    assert "JB-3 (inbox) Wobbly leg" in body["detail"]
    assert n_items(c) == before
    r = c.post(turl(c), json={"kind": "idea", "title": "Wobbly legs", "allow_similar": True})
    assert r.status_code == 201 and r.json()["title"] == "Wobbly legs"
    assert n_items(c) == before + 1
    # allow_similar is an instruction, not a field: it is not written to the Item
    path = os.path.join(c.app.state.config.repo_root, r.json()["source_path"])
    with open(path) as fh:
        assert "allow_similar" not in fh.read()


def test_only_a_literal_true_allows(c):
    r = c.post(turl(c), json={"kind": "idea", "title": "Wobbly legs", "allow_similar": "yes"})
    assert r.status_code == 409 and r.json()["code"] == "similar"


def test_unrelated_title_files_normally(c):
    r = c.post(turl(c), json={"kind": "bug", "title": "Cone margin too tight"})
    assert r.status_code == 201


def test_the_same_title_as_a_closed_item_is_only_similar(c):
    r = c.patch("%s/JB-3" % turl(c), json={"status": "complete"})
    assert r.status_code == 200
    r = c.post(turl(c), json={"kind": "bug", "title": "Wobbly leg"})
    assert r.status_code == 409 and r.json()["code"] == "similar"
    assert r.json()["similar"][0]["exact"] is True
    r = c.post(turl(c), json={"kind": "bug", "title": "Wobbly leg", "allow_similar": True})
    assert r.status_code == 201
