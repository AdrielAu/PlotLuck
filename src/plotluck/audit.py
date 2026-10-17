"""Read-only audit of defects in the restaurant source (issue #149, spec #148).

``audit(data, out)`` reads the Tripadvisor and ONSPD extracts in ``data`` and
writes ``<out>/audit.json``: counts and distance statistics only, never a name,
link, address, coordinate, rating or review count (ADR 0003, ``runs/README.md``).
It sizes the cleaning thresholds of issue #150 from real counts.

Run on LinuxONE (``data_dir()`` picks the data folder)::

    python -m plotluck.audit

which writes ``runs/<yyyy-mm-dd>-data-audit/audit.json`` on full data and
``<data>/run/audit.json`` on the sample.
"""

import argparse
import json
import math
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import numpy as np

from plotluck.build import CHAIN_MIN_NAMES, float_or_none, nearest_postcodes, only_keys, read_csv
from plotluck.data import data_dir
from plotluck.geometry import chord, cluster_points, unit_xyz
from plotluck.names import normalise_name

NEAR_DUPLICATE_SWEEP_M = (25, 50, 100, 250)
BEYOND_KM = (0.5, 1, 2, 5)
PERCENTILES = (("p50", 50), ("p90", 90), ("p99", 99), ("p99_9", 99.9))
SPAN_KM = 5  # suffix-merged names whose members lie further apart than this count as unrelated

_NAME_KEYS = {
    "distinct_exact", "distinct_normalised", "distinct_without_suffix",
    "chain_rows_exact", "chain_rows_normalised", "chain_rows_without_suffix",
    "suffix_merge_groups_over_5km",
}
_NEAR_DUPLICATE_KEYS = {m: f"within_{m}m" for m in NEAR_DUPLICATE_SWEEP_M}
_BEYOND_KEYS = {limit: f"beyond_{str(limit).replace('.', '_')}km" for limit in BEYOND_KM}
_DISTANCE_KEYS = {"located_rows", "max", *(key for key, _ in PERCENTILES), *_BEYOND_KEYS.values()}


def audit_rows(rows: list[dict], postcodes: list[dict]) -> dict:
    """Aggregate defect counts for source ``rows`` against live ``postcodes``."""
    located = [r for r in rows if float_or_none(r["latitude"]) is not None and float_or_none(r["longitude"]) is not None]
    points = [(float(r["latitude"]), float(r["longitude"])) for r in located]
    out = {
        "source_rows": len(rows),
        "exact_duplicates": _exact_duplicates(rows),
        "near_duplicates": _near_duplicates(located, points),
        "nearest_postcode_km": _distances(postcodes, points),
        "names": _name_statistics(rows, located, points),
    }
    validate_audit(out)
    return out


def audit(data: Path, out: Path) -> dict:
    """Audit the extracts in ``data`` and write ``<out>/audit.json``; return the result."""
    data, out = Path(data), Path(out)
    result = audit_rows(read_csv(data / "tripadvisor_england.csv"), read_csv(data / "onspd_england.csv"))
    out.mkdir(parents=True, exist_ok=True)
    text = json.dumps(result, indent=1) + "\n"
    (out / "audit.json").write_text(text, encoding="utf-8", newline="\n")
    return result


def validate_audit(result: dict) -> None:
    """Raise ValueError unless ``result`` holds only the known count and distance fields."""
    only_keys(result, {"source_rows", "exact_duplicates", "near_duplicates", "nearest_postcode_km", "names"}, "audit")
    only_keys(result["exact_duplicates"], {"links_repeated", "extra_rows"}, "audit exact_duplicates")
    only_keys(result["near_duplicates"], set(_NEAR_DUPLICATE_KEYS.values()), "audit near_duplicates")
    for value in result["near_duplicates"].values():
        only_keys(value, {"groups", "extra_rows"}, "audit near_duplicates")
    only_keys(result["nearest_postcode_km"], _DISTANCE_KEYS, "audit nearest_postcode_km")
    only_keys(result["names"], _NAME_KEYS, "audit names")

    def check(value):
        if isinstance(value, dict):
            for v in value.values():
                check(v)
        elif isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError("audit values must be finite non-negative numbers")

    check(result)


def _exact_duplicates(rows: list[dict]) -> dict:
    links = Counter(r["restaurant_link"] for r in rows if r["restaurant_link"])
    repeated = [n for n in links.values() if n > 1]
    return {"links_repeated": len(repeated), "extra_rows": sum(n - 1 for n in repeated)}


def _near_duplicates(located: list[dict], points: list[tuple[float, float]]) -> dict:
    """Same normalised name, different link, within each radius; rows are first de-duplicated by link."""
    seen, by_name = set(), defaultdict(list)
    for r, point in zip(located, points):
        if r["restaurant_link"] and r["restaurant_link"] in seen:
            continue
        seen.add(r["restaurant_link"])
        by_name[normalise_name(r["restaurant_name"])].append(point)
    groups = {m: 0 for m in NEAR_DUPLICATE_SWEEP_M}
    extra = {m: 0 for m in NEAR_DUPLICATE_SWEEP_M}
    for members in by_name.values():
        if len(members) < 2:
            continue
        for m in NEAR_DUPLICATE_SWEEP_M:
            sizes = Counter(cluster_points(members, m))
            groups[m] += sum(n > 1 for n in sizes.values())
            extra[m] += sum(n - 1 for n in sizes.values())
    return {_NEAR_DUPLICATE_KEYS[m]: {"groups": groups[m], "extra_rows": extra[m]} for m in NEAR_DUPLICATE_SWEEP_M}


def _distances(postcodes: list[dict], points: list[tuple[float, float]]) -> dict:
    _, km = nearest_postcodes(postcodes, points)
    km = np.asarray(km, dtype=float)
    stats = {"located_rows": len(km)}
    for key, q in PERCENTILES:
        stats[key] = round(float(np.percentile(km, q)), 3) if len(km) else 0
    stats["max"] = round(float(km.max()), 3) if len(km) else 0
    for limit in BEYOND_KM:
        stats[_BEYOND_KEYS[limit]] = int((km > limit).sum())
    return stats


def _name_statistics(rows: list[dict], located: list[dict], points: list[tuple[float, float]]) -> dict:
    exact = [r["restaurant_name"] for r in rows]
    normalised = [normalise_name(n) for n in exact]
    stripped = [normalise_name(n, drop_branch_suffix=True) for n in exact]

    def chain_rows(values):
        counts = Counter(values)
        return sum(n for n in counts.values() if n >= CHAIN_MIN_NAMES)

    return {
        "distinct_exact": len(set(exact)),
        "distinct_normalised": len(set(normalised)),
        "distinct_without_suffix": len(set(stripped)),
        "chain_rows_exact": chain_rows(exact),
        "chain_rows_normalised": chain_rows(normalised),
        "chain_rows_without_suffix": chain_rows(stripped),
        "suffix_merge_groups_over_5km": _suffix_merges_far_apart(located, points),
    }


def _suffix_merges_far_apart(located: list[dict], points: list[tuple[float, float]]) -> int:
    """Groups where suffix removal merges different names and the members span more than ``SPAN_KM``.

    The span is found by two sweeps (farthest from the first member, then
    farthest from that), which is within a few per cent of the true diameter.
    """
    # shortcut: two-sweep approximate diameter, within a few per cent; upgrade to the exact
    # diameter (convex hull) if the audit shows groups near the SPAN_KM boundary.
    by_stripped = defaultdict(lambda: (set(), []))
    for r, point in zip(located, points):
        variants, members = by_stripped[normalise_name(r["restaurant_name"], drop_branch_suffix=True)]
        variants.add(normalise_name(r["restaurant_name"]))
        members.append(point)
    count = 0
    for variants, members in by_stripped.values():
        if len(variants) < 2:
            continue
        xyz = unit_xyz(members)
        a = int(np.linalg.norm(xyz - xyz[0], axis=1).argmax())
        span = np.linalg.norm(xyz - xyz[a], axis=1).max()
        count += int(span > chord(SPAN_KM))
    return count


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(
        prog="python -m plotluck.audit",
        description="Count restaurant-data defects in the data folder chosen by data_dir(); aggregates only.",
    )
    parser.add_argument("--out", type=Path, help="output folder (default: runs/<today>-data-audit on full data, else <data>/run)")
    args = parser.parse_args(argv)
    data = data_dir()
    full = data == data_dir(choice="full")
    out = args.out or (data.parents[1] / "runs" / f"{date.today():%Y-%m-%d}-data-audit" if full else data / "run")
    print(json.dumps(audit(data, out)))
    print("wrote", out / "audit.json")


if __name__ == "__main__":
    main()
