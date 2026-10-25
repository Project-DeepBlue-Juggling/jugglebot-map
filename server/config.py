"""Locate the Jugglebot checkout, read ``map/config.yaml`` and make its parser importable.

The server refuses to start without ``map/config.yaml`` (decision #31). The
shared parser package ``mapkit`` lives in the checkout and is imported by
inserting the checkout root on ``sys.path`` (the ``teensy_link`` precedent):
one source of truth, no install step, and a different checkout uses its own
parser.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import yaml

ENV_REPO = "JUGGLEBOT_REPO"
CONFIG_REL = os.path.join("map", "config.yaml")


class ConfigError(RuntimeError):
    """The checkout is missing, has no ``map/config.yaml``, or has no ``mapkit``."""


@dataclass
class MapConfig:
    repo_root: str
    items_dir: str
    plan_dirs: List[str]
    kinds: List[str]
    statuses: Dict[str, List[str]] = field(default_factory=dict)
    raw: Dict[str, Any] = field(default_factory=dict)


def resolve_repo(arg: Optional[str]) -> str:
    repo = arg or os.environ.get(ENV_REPO)
    if not repo:
        raise ConfigError("no checkout given: pass --repo or set %s" % ENV_REPO)
    repo = os.path.abspath(os.path.expanduser(repo))
    if not os.path.isdir(repo):
        raise ConfigError("checkout %s does not exist" % repo)
    return repo


def load_config(repo_root: str) -> MapConfig:
    path = os.path.join(repo_root, CONFIG_REL)
    if not os.path.isfile(path):
        raise ConfigError("%s not found: refusing to start (is %s a Jugglebot checkout with a map/?)"
                          % (path, repo_root))
    with open(path, encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    if not isinstance(raw, dict):
        raise ConfigError("%s is not a mapping" % path)
    items = raw.get("items", "map/")
    plans = raw.get("plans", ["plans/active", "plans/parked", "plans/archived"])
    if isinstance(plans, str):
        plans = [plans]
    return MapConfig(
        repo_root=repo_root,
        items_dir=os.path.normpath(os.path.join(repo_root, items)),
        plan_dirs=[os.path.normpath(os.path.join(repo_root, p)) for p in plans],
        kinds=list(raw.get("kinds") or []),
        statuses=dict(raw.get("statuses") or {}),
        raw=raw,
    )


def ensure_mapkit(repo_root: str) -> None:
    """Put the checkout first on ``sys.path`` and check ``mapkit`` imports."""
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)
    try:
        import mapkit.ids  # noqa: F401  (short Item IDs JB-<n>; on main since map-item-ids P1)
        import mapkit.items  # noqa: F401
        import mapkit.plans  # noqa: F401
    except ImportError as exc:
        raise ConfigError("cannot import mapkit from %s: %s" % (repo_root, exc)) from exc


def setup(repo_arg: Optional[str]) -> MapConfig:
    """Everything the CLI needs before building the app; raises ConfigError."""
    root = resolve_repo(repo_arg)
    cfg = load_config(root)
    ensure_mapkit(root)
    return cfg
