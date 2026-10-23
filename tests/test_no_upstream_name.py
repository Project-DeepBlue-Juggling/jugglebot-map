"""The no-upstream-name check: clean tree passes, a planted pattern fails and is named."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _copy(dst: Path) -> Path:
    ignore = shutil.ignore_patterns(".git", "node_modules", "__pycache__", ".pytest_cache", "dist", "*.egg-info")
    tree = dst / "tree"
    shutil.copytree(ROOT, tree, ignore=ignore)
    return tree


def _run(tree: Path):
    return subprocess.run(
        ["bash", str(tree / "scripts" / "check_no_upstream_name.sh"), str(tree)],
        capture_output=True, text=True,
    )


def test_clean_tree_passes(tmp_path):
    r = _run(_copy(tmp_path))
    assert r.returncode == 0, r.stderr


def test_planted_pattern_fails_and_names_file(tmp_path):
    tree = _copy(tmp_path)
    (tree / "server" / "planted.py").write_text("# x\nname = 'no-such-upstream-control-string'\n")
    r = _run(tree)
    assert r.returncode != 0
    assert "server/planted.py:2" in r.stderr
