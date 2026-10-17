"""Data-folder resolver: one switch between sample and full data."""

import os
from pathlib import Path

ENV_VAR = "PLOTLUCK_DATA"
ALLOWED = ("sample", "full")

# src/plotluck/data.py -> repo root, independent of the working directory.
_REPO_ROOT = Path(__file__).resolve().parents[2]


def data_dir(root: Path | None = None, choice: str | None = None) -> Path:
    """Return the data folder: ``data/sample`` or ``data/full``.

    ``choice`` wins, then ``PLOTLUCK_DATA`` (``sample`` or ``full``). Otherwise
    full when ``data/full/`` exists, else sample. ``root`` overrides the repo
    root (for tests).
    """
    parent = (Path(root) if root is not None else _REPO_ROOT) / "data"
    if choice is None:
        choice = os.environ.get(ENV_VAR)
    if choice is None:
        return parent / ("full" if (parent / "full").is_dir() else "sample")
    if choice not in ALLOWED:
        raise ValueError(
            f"{ENV_VAR}={choice!r} is invalid; allowed values: "
            + ", ".join(ALLOWED)
        )
    return parent / choice
