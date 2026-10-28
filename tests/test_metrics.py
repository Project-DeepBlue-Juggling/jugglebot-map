"""The six item-metric fields round-trip through every write path and are validated."""
from __future__ import annotations

import os

from tests.test_contract import API, pid, tasks, turl

METRICS = {"effort": "s", "hardware": "none", "owner": "decision", "radius": "local",
           "diagnosis": "confirmed", "area": "map-app"}


def _file(repo, name):
    with open(os.path.join(repo, "map", name), encoding="utf-8") as fh:
        return fh.read()


def test_unrated_items_carry_null_metrics(client):
    for t in tasks(client).values():
        for k in METRICS:
            assert t[k] is None, (t["slug"], k)


def test_create_with_metrics_orders_keys_after_priority(client, repo):
    body = dict(METRICS, title="Rated bug", kind="bug")
    r = client.post(turl(client), json=body)
    assert r.status_code in (200, 201), r.text
    for k, v in METRICS.items():
        assert r.json()[k] == v
    text = _file(repo, "bug-rated-bug.md")
    keys = [ln.split(":")[0] for ln in text.split("---")[1].strip().splitlines()
            if ln and not ln.startswith(("-", " "))]
    i = keys.index("priority")
    assert keys[i + 1:i + 7] == list(METRICS), keys


def test_update_and_status_change_never_drop_metrics(client, repo):
    t = client.post(turl(client), json=dict(METRICS, title="Keep me", kind="bug")).json()
    r = client.patch(turl(client, t["id"]), json={"title": "Keep me too"})
    assert r.status_code == 200, r.text
    r = client.patch(turl(client, t["id"]), json={"status": "backlog"})
    assert r.status_code == 200, r.text
    r = client.patch(turl(client, t["id"]), json={"effort": "xl"})
    got = r.json()
    assert got["effort"] == "xl"
    assert {k: got[k] for k in METRICS if k != "effort"} == \
        {k: v for k, v in METRICS.items() if k != "effort"}
    got = client.patch(turl(client, t["id"]), json={"effort": None}).json()
    assert got["effort"] is None
    assert "effort" not in _file(repo, "bug-keep-me.md")


def test_bad_values_are_rejected(client):
    r = client.post(turl(client), json={"title": "x", "kind": "idea", "effort": "huge"})
    assert r.status_code == 422
    r = client.post(turl(client), json={"title": "x", "kind": "idea", "diagnosis": "unknown"})
    assert r.status_code == 422
    t = tasks(client)["wobbly-leg"]
    assert client.patch(turl(client, t["id"]), json={"area": "nowhere"}).status_code == 422
    assert client.patch(turl(client, t["id"]), json={"hardware": 3}).status_code == 422
