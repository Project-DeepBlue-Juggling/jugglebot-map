"""GET /glossary: mapkit's GLOSSARY.md parse, in file order, read-only."""
from __future__ import annotations

import os

from server.models import Glossary

API = "/api/v1"

GLOSSARY = """# Jugglebot

Intro prose.

## Language

### The machine

**Jugglebot**:
The whole robot: the Stewart platform, the Hand, and the electronics.
_Avoid_: "the platform" for the whole robot

**Hand**:
The seventh actuated axis,
carried on the Platform.
_Avoid_: leg 6, seventh leg

**Ball Butler (BB)**:
The ball-feeding machine.

### Safety

**Guard**:
A check that stops motion.
_Avoid_: limiter (a soft one, sometimes), clamp

## Relationships

**Not a term**:
Outside the Language section.
"""


def pid(client) -> str:
    return client.get(API + "/projects").json()[0]["id"]


def put_glossary(repo: str, text: str = GLOSSARY) -> None:
    with open(os.path.join(repo, "GLOSSARY.md"), "w", encoding="utf-8") as fh:
        fh.write(text)


def get(client):
    return client.get("%s/projects/%s/glossary" % (API, pid(client)))


def test_clusters_and_terms_in_file_order(client, repo):
    put_glossary(repo)
    body = get(client).json()
    Glossary.model_validate(body)
    assert [c["name"] for c in body["clusters"]] == ["The machine", "Safety"]
    machine = body["clusters"][0]["terms"]
    assert [t["term"] for t in machine] == ["Jugglebot", "Hand", "Ball Butler (BB)"]
    assert [t["anchor"] for t in machine] == ["term-jugglebot", "term-hand", "term-ball-butler-bb"]
    # Wrapped definition lines join into one.
    assert machine[1]["definition"] == "The seventh actuated axis, carried on the Platform."


def test_avoid_list_is_split_outside_parentheses_and_quotes(client, repo):
    put_glossary(repo)
    clusters = get(client).json()["clusters"]
    hand = clusters[0]["terms"][1]
    assert hand["avoid"] == ["leg 6", "seventh leg"]
    assert clusters[0]["terms"][0]["avoid"] == ['"the platform" for the whole robot']
    assert clusters[0]["terms"][2]["avoid"] == []
    assert clusters[1]["terms"][0]["avoid"] == ["limiter (a soft one, sometimes)", "clamp"]


def test_duplicate_terms_get_distinct_anchors(client, repo):
    put_glossary(repo, "## Language\n\n### A\n\n**Hand**:\nOne.\n\n**Hand**:\nTwo.\n")
    anchors = [t["anchor"] for t in get(client).json()["clusters"][0]["terms"]]
    assert anchors == ["term-hand", "term-hand-2"]


def test_missing_glossary_is_404(client):
    r = get(client)
    assert r.status_code == 404
    assert "GLOSSARY.md" in r.json()["detail"]


def test_glossary_without_language_section_is_empty(client, repo):
    put_glossary(repo, "# Nothing\n")
    assert get(client).json() == {"clusters": []}


def test_unknown_project_is_404(client):
    assert client.get(API + "/projects/nope/glossary").status_code == 404
