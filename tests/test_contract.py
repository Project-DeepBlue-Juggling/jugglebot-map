"""Contract suite: response shapes vs the models and the prototype, write-through,
the conflict token, the three 409 shapes, the pathway-close conflict,
id stability, startup refusal, the parse-error minimum and the SSE invalidate."""
from __future__ import annotations

import os
import socket
import threading
import time

import pytest

from server.models import (Dependency, Health, Membership, Project, Task, TaskDetail,
                           User)

API = "/api/v1"
PROTOTYPE_TASK_FIELDS = {
    "id", "project_id", "parent_id", "title", "description", "completion_criteria",
    "assignee_ids", "kind", "status", "priority", "is_section", "backlog_rank", "color",
    "canvas_x", "canvas_y", "canvas_collapsed", "work_days", "start_date", "due_date",
    "reviewer_id", "effective_start_date", "created_at", "created_by", "updated_at",
    "updated_by",
}
MAP_TASK_FIELDS = {
    "slug", "destination", "branch", "links", "filed_by", "promoted_to", "rank",
    "ticket_type", "source_path", "editable", "pathway_id", "short_id", "unpushed",
}


def pid(client) -> str:
    return client.get(API + "/projects").json()[0]["id"]


def tasks(client):
    return {t["slug"]: t for t in client.get("%s/projects/%s/tasks" % (API, pid(client))).json()}


def turl(client, tid=None) -> str:
    base = "%s/projects/%s/tasks" % (API, pid(client))
    return base if tid is None else "%s/%s" % (base, tid)


def durl(client, did=None) -> str:
    base = "%s/projects/%s/dependencies" % (API, pid(client))
    return base if did is None else "%s/%s" % (base, did)


def read(repo, rel) -> str:
    with open(os.path.join(repo, rel), encoding="utf-8") as fh:
        return fh.read()


# --------------------------------------------------------------- reads ---

def test_every_get_parses_against_the_models(client):
    p = pid(client)
    for u in client.get(API + "/users").json():
        User.model_validate(u)
    User.model_validate(client.get(API + "/users/me").json())
    Project.model_validate(client.get("%s/projects/%s" % (API, p)).json())
    for m in client.get("%s/projects/%s/memberships" % (API, p)).json():
        Membership.model_validate(m)
    ts = client.get(turl(client)).json()
    assert ts
    for t in ts:
        Task.model_validate(t)
        TaskDetail.model_validate(client.get(turl(client, t["id"])).json())
    for d in client.get(durl(client)).json():
        Dependency.model_validate(d)
    Health.model_validate(client.get(API + "/health").json())


def test_full_object_field_set(client):
    expected = PROTOTYPE_TASK_FIELDS | MAP_TASK_FIELDS
    for t in tasks(client).values():
        assert set(t) == expected, set(t) ^ expected
    t = next(iter(tasks(client).values()))
    detail = client.get(turl(client, t["id"])).json()
    assert set(detail) == expected | {"blocking", "blocked_by"}
    assert "stage" not in t


def test_resource_mapping(client):
    ts = tasks(client)
    kinds = {t["kind"] for t in ts.values()}
    assert kinds == {"pathway", "plan", "phase", "idea", "bug", "ticket"}
    alpha, plan = ts["alpha"], ts["alpha-plan"]
    p1, p2 = ts["alpha-plan.md#P1"], ts["alpha-plan.md#P2"]
    assert plan["parent_id"] == alpha["id"] and plan["pathway_id"] == alpha["id"]
    assert p1["parent_id"] == plan["id"] and p1["pathway_id"] == alpha["id"]
    assert (p1["title"], p1["status"]) == ("First thing", "complete")
    assert p1["description"] == "The first paragraph of phase one."
    assert p2["status"] == "not_started"
    assert not plan["editable"] and not p1["editable"] and alpha["editable"]
    assert ts["alpha-question"]["parent_id"] == alpha["id"]
    assert ts["alpha-question"]["ticket_type"] == "grilling"
    assert ts["shiny-thing"]["parent_id"] == alpha["id"]  # inbox item via pathway:
    assert ts["wobbly-leg"]["parent_id"] is None
    assert alpha["completion_criteria"] == alpha["destination"] != ""
    assert ts["shiny-thing"]["source_path"] == "map/idea-shiny-thing.md"
    assert plan["source_path"] == "plans/active/alpha-plan.md"
    deps = client.get(durl(client)).json()
    assert [(d["blocker_id"], d["blocked_id"]) for d in deps] == \
        [(ts["alpha-question"]["id"], ts["wobbly-leg"]["id"])]


def test_quiet_stubs(client):
    p = pid(client)
    assert client.get(API + "/users/me/tasks").json() == []
    assert client.get(API + "/users/me/notifications").json() == []
    assert client.get(API + "/users/me/notifications/unread_count").json() == {"count": 0}
    assert client.get(API + "/users/me/notifications/stream").status_code == 404
    r = client.post("%s/projects/%s/undo" % (API, p))
    assert (r.status_code, r.json()) == (404, {"detail": "Nothing to undo"})
    tid = next(iter(tasks(client).values()))["id"]
    assert client.get("%s/comments" % turl(client, tid)).json() == []
    assert client.get("/users").status_code == 200  # bare path too


def test_ids_stable_across_two_app_instances(tmp_path):
    from fastapi.testclient import TestClient

    from server.app import create_app
    from tests.conftest import make_repo
    ids = []
    for name in ("a", "b"):
        r = make_repo(str(tmp_path / name))
        with TestClient(create_app(r, dist_dir=str(tmp_path / "nodist"))) as c:
            ids.append(sorted((t["slug"], t["id"]) for t in tasks(c).values())
                       + [("project", pid(c))])
    assert ids[0] == ids[1]
    from mapkit.items import item_uuid
    assert dict(ids[0])["alpha"] == item_uuid("alpha")
    assert dict(ids[0])["alpha-plan.md#P1"] == item_uuid("alpha-plan.md#P1")


# -------------------------------------------------------------- writes ---

def test_post_writes_the_file_then_get_shows_it(client, repo):
    r = client.post(turl(client), json={"title": "New idea here", "kind": "idea",
                                        "description": "Body text."})
    assert r.status_code == 201, r.text
    t = r.json()
    Task.model_validate(t)
    text = read(repo, "map/idea-new-idea-here.md")
    assert "title: New idea here" in text and "Body text." in text
    assert "status: inbox" in text
    assert tasks(client)["new-idea-here"]["id"] == t["id"]


def test_post_refuses_plan_kinds_and_schema_errors(client):
    for kind in ("plan", "phase"):
        r = client.post(turl(client), json={"title": "x", "kind": kind})
        assert r.status_code == 405 and "read-only" in r.json()["detail"]
    r = client.post(turl(client), json={"title": "A ticket", "kind": "ticket"})
    assert r.status_code == 422 and "parent" in r.json()["detail"]


def test_patch_bumps_updated_and_token_conflict(client, repo):
    t = tasks(client)["wobbly-leg"]
    old = t["updated_at"]
    assert old == "2026-10-05T10:00:00Z"
    r = client.patch(turl(client, t["id"]), json={"title": "Wobblier leg",
                                                  "if_unchanged_since": old})
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["title"] == "Wobblier leg" and new["updated_at"] != old
    assert "title: Wobblier leg" in read(repo, "map/bug-wobbly-leg.md")
    # the stale token now conflicts, and the payload carries the current task
    r = client.patch(turl(client, t["id"]), json={"title": "Lost write", "if_unchanged_since": old})
    assert r.status_code == 409
    body = r.json()
    assert set(body) == {"detail", "current"} and body["detail"] == "Task was modified"
    Task.model_validate(body["current"])
    assert body["current"]["title"] == "Wobblier leg"
    # token as a query parameter is honoured too
    r = client.patch(turl(client, t["id"]) + "?if_unchanged_since=" + old, json={"title": "x"})
    assert r.status_code == 409
    r = client.delete(turl(client, t["id"]), params={"if_unchanged_since": old})
    assert r.status_code == 409 and r.json()["detail"] == "Task was modified"


def test_patch_plans_and_phases_are_read_only(client):
    ts = tasks(client)
    for slug in ("alpha-plan", "alpha-plan.md#P1"):
        r = client.patch(turl(client, ts[slug]["id"]), json={"title": "renamed"})
        assert r.status_code == 405
        assert client.patch(turl(client, ts[slug]["id"]), json={}).status_code == 200
        assert client.delete(turl(client, ts[slug]["id"])).status_code == 405


def test_reparent_writes_parent_never_pathway(client, repo):
    """#25: every kind's parent is ``parent:``; a stale ``pathway:`` key is dropped on rewrite."""
    ts = tasks(client)
    assert "pathway: alpha" in read(repo, "map/idea-shiny-thing.md")  # legacy key, still read
    assert ts["shiny-thing"]["parent_id"] == ts["alpha"]["id"]
    r = client.patch(turl(client, ts["wobbly-leg"]["id"]), json={"parent_id": ts["alpha"]["id"]})
    assert r.status_code == 200 and r.json()["parent_id"] == ts["alpha"]["id"]
    text = read(repo, "map/bug-wobbly-leg.md")
    assert "\nparent: alpha\n" in text and "pathway:" not in text
    r = client.patch(turl(client, ts["shiny-thing"]["id"]), json={"parent_id": ts["beta"]["id"]})
    assert r.status_code == 200
    text = read(repo, "map/idea-shiny-thing.md")
    assert "\nparent: beta\n" in text and "pathway:" not in text


def test_reparent_cycle_409(client):
    ts = tasks(client)
    r = client.patch(turl(client, ts["alpha"]["id"]), json={"parent_id": ts["alpha-question"]["id"]})
    assert r.status_code == 409
    assert r.json() == {"detail": "Reparenting would close a cycle",
                        "would_close_via": {"id": ts["alpha-question"]["id"],
                                            "title": "Alpha question"}}


def test_dependency_cycle_409_and_write_through(client, repo):
    ts = tasks(client)
    bug, ticket, idea = ts["wobbly-leg"], ts["alpha-question"], ts["shiny-thing"]
    r = client.post(durl(client), json={"blocker_id": bug["id"], "blocked_id": ticket["id"]})
    assert (r.status_code, r.json()) == (409, {"detail": "Dependency would create a cycle"})
    r = client.post(durl(client), json={"blocker_id": idea["id"], "blocked_id": bug["id"]})
    assert r.status_code == 201, r.text
    dep = r.json()
    Dependency.model_validate(dep)
    assert "- idea-shiny-thing" in read(repo, "map/bug-wobbly-leg.md")
    r = client.post(durl(client), json={"blocker_id": idea["id"], "blocked_id": ts["alpha-plan"]["id"]})
    assert r.status_code == 405
    assert client.delete(durl(client, dep["id"])).status_code == 204
    assert "idea-shiny-thing" not in read(repo, "map/bug-wobbly-leg.md")


def test_delete_conflict_409_and_delete(client, repo):
    ts = tasks(client)
    r = client.delete(turl(client, ts["alpha-question"]["id"]))
    assert r.status_code == 409
    assert r.json() == {"detail": "Task has children or dependencies", "children": [],
                        "blocking": [{"id": ts["wobbly-leg"]["id"], "title": "Wobbly leg"}],
                        "blocked_by": []}
    r = client.delete(turl(client, ts["alpha"]["id"]))
    assert r.status_code == 409 and len(r.json()["children"]) == 3  # ticket, idea, plan
    assert client.delete(turl(client, ts["beta"]["id"])).status_code == 204
    assert not os.path.exists(os.path.join(repo, "map/pathway-beta.md"))


def test_pathway_close_conflict(client):
    ts = tasks(client)
    for status in ("complete", "dropped"):
        r = client.patch(turl(client, ts["alpha"]["id"]), json={"status": status})
        assert r.status_code == 409
        assert r.json() == {"detail": "Pathway still has live plans",
                            "children": [{"id": ts["alpha-plan"]["id"], "title": "Alpha plan"}],
                            "blocking": [], "blocked_by": []}
    r = client.patch(turl(client, ts["beta"]["id"]), json={"status": "complete"})
    assert r.status_code == 200 and r.json()["status"] == "complete"


def test_promoted_to_only_on_inbox_kinds(client):
    ts = tasks(client)
    r = client.patch(turl(client, ts["shiny-thing"]["id"]),
                     json={"status": "promoted", "promoted_to": "ticket-alpha-question"})
    assert r.status_code == 200 and r.json()["promoted_to"] == "ticket-alpha-question"
    r = client.patch(turl(client, ts["alpha"]["id"]), json={"promoted_to": "x"})
    assert r.status_code == 422


@pytest.mark.parametrize("kind,slug", [("idea", "shiny-thing"), ("bug", "wobbly-leg"),
                                       ("feature", "new-feature")])
def test_promoted_round_trip_on_each_inbox_kind(client, repo, kind, slug):
    """PATCH status=promoted + promoted_to writes both to the item file; a re-read has both."""
    if kind == "feature":
        r = client.post(turl(client), json={"kind": "feature", "title": "New feature"})
        assert r.status_code in (200, 201), r.text
    t = tasks(client)[slug]
    r = client.patch(turl(client, t["id"]),
                     json={"status": "promoted", "promoted_to": "plan-example.md",
                           "if_unchanged_since": t["updated_at"]})
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["promoted_to"]) == ("promoted", "plan-example.md")
    reread = tasks(client)[slug]
    assert (reread["status"], reread["promoted_to"]) == ("promoted", "plan-example.md")
    text = read(repo, "map/%s-%s.md" % (kind, slug))
    assert "status: promoted" in text and "promoted_to: plan-example.md" in text


# ------------------------------------------------------ startup, health ---

def test_startup_refused_without_config(repo, capsys):
    from server.app import create_app
    from server.cli import main
    from server.config import ConfigError
    os.remove(os.path.join(repo, "map", "config.yaml"))
    with pytest.raises(ConfigError):
        create_app(repo)
    assert main(["--repo", repo, "--no-open"]) == 2
    assert "refusing to start" in capsys.readouterr().err


def test_health_degraded_on_malformed_file(client, repo):
    assert client.get(API + "/health").json() == {
        "status": "ok", "errors": [],
        "banner": {"level": None, "message": "", "since": None}}
    n = len(tasks(client))
    with open(os.path.join(repo, "map", "bug-broken.md"), "w", encoding="utf-8") as fh:
        fh.write("---\nkind: bug\ntitle: [unclosed\n---\n\nbody\n")
    h = client.get(API + "/health").json()
    assert h["status"] == "degraded"
    assert [e["path"] for e in h["errors"]] == ["map/bug-broken.md"]
    assert "YAML" in h["errors"][0]["message"]
    assert len(tasks(client)) == n  # the rest keeps serving


def test_no_dist_root_says_build(client):
    r = client.get("/")
    assert r.status_code == 200 and "npm run build" in r.text


def test_dist_spa_fallback(repo, tmp_path):
    from fastapi.testclient import TestClient

    from server.app import create_app
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>spa</html>")
    with TestClient(create_app(repo, dist_dir=str(dist))) as c:
        assert "spa" in c.get("/", headers={"accept": "text/html"}).text
        assert "spa" in c.get("/projects/x", headers={"accept": "text/html"}).text
        assert isinstance(c.get(API + "/users", headers={"accept": "text/html"}).json(), list)


# --------------------------------------------------------------- events ---

def test_events_invalidate_after_write(app):
    import httpx
    import uvicorn
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    base = "http://127.0.0.1:%d" % port
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)
        with httpx.Client(base_url=base, timeout=5.0) as c:
            ts = tasks(c)
            with c.stream("GET", API + "/events") as resp:
                assert resp.status_code == 200
                lines = resp.iter_lines()
                assert next(lines).startswith(": connected")
                for _ in range(100):  # wait until the broker holds this client
                    if app.state.broker.client_count:
                        break
                    time.sleep(0.02)
                r = httpx.patch(base + turl(c, ts["wobbly-leg"]["id"]), json={"title": "Moved"})
                assert r.status_code == 200
                got = []
                for line in lines:
                    got.append(line)
                    if line.startswith("data:"):
                        break
                assert "event: invalidate" in got
                assert got.count("event: invalidate") == 1
    finally:
        server.should_exit = True
        th.join(timeout=5)
