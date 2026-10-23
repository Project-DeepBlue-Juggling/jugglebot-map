"""Fixture checkout copied to tmp_path so writes never touch this repo.

The fixture has no parser of its own; the real ``mapkit`` package is copied in
from a Jugglebot checkout so the app loads it exactly as in production (from
the ``--repo`` root on ``sys.path``). Source: ``$MAPKIT_SRC`` (a checkout root
containing ``mapkit/``), else a sibling ``../Jugglebot`` or ``../Jugglebot-map``.
"""
from __future__ import annotations

import os
import shutil

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, "fixtures", "repo")
FORK = os.path.dirname(HERE)


def _mapkit_src() -> str:
    cands = [os.environ.get("MAPKIT_SRC", "")]
    parent = os.path.dirname(FORK)
    cands += [os.path.join(parent, "Jugglebot"), os.path.join(parent, "Jugglebot-map")]
    for c in cands:
        if c and os.path.isfile(os.path.join(c, "mapkit", "items.py")):
            return os.path.join(c, "mapkit")
    pytest.skip("no mapkit found: set MAPKIT_SRC to a Jugglebot checkout root")
    return ""


def make_repo(dest: str) -> str:
    shutil.copytree(FIXTURE, dest)
    shutil.copytree(_mapkit_src(), os.path.join(dest, "mapkit"),
                    ignore=shutil.ignore_patterns("__pycache__"))
    return dest


@pytest.fixture
def repo(tmp_path) -> str:
    return make_repo(str(tmp_path / "repo"))


@pytest.fixture
def app(repo):
    from server.app import create_app
    return create_app(repo, dist_dir=os.path.join(repo, "no-dist"))


@pytest.fixture
def client(app):
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c
