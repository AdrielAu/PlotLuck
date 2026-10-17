"""Audit how much an exported NN1 ranking responds to district and cuisine inputs.

All reported values derive from public model outputs. No restaurant rows or
district review aggregates are read or written.
"""

import argparse
import csv
import json
import statistics
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

from plotluck.build import score_districts

TOP = 20


def _load(bundle: Path):
    bundle = Path(bundle)
    model = json.loads((bundle / "model.json").read_text(encoding="utf-8"))
    vocabulary = json.loads((bundle / "vocabulary.json").read_text(encoding="utf-8"))
    with (bundle / "districts.csv").open(encoding="utf-8", newline="") as file:
        districts = [{**row, "total_restaurants": int(row["total_restaurants"])} for row in csv.DictReader(file)]
    with (bundle / "district_cuisine_supply.csv").open(encoding="utf-8", newline="") as file:
        supply = Counter({
            (row["postcode_district"], row["cuisine_group"]): int(row["restaurants"])
            for row in csv.DictReader(file)
        })
    return model, vocabulary, districts, supply


def audit(bundle: Path) -> dict:
    """Summarise score spread and distinct cuisine rankings in a public bundle."""
    model, vocabulary, districts, supply = _load(bundle)
    defaults = {trait["name"]: trait["default"] for trait in vocabulary["traits"]}
    profiles = {}
    groups = {}
    spreads = []
    for cuisine in vocabulary["cuisines"]:
        scores = score_districts(model, vocabulary, districts, supply, {"cuisine": cuisine["cuisine"], **defaults})
        ordered = np.array([scores[d["postcode_district"]] for d in districts])
        spreads.append(float(np.quantile(ordered, .9) - np.quantile(ordered, .1)))
        # Exact equality reveals profiles that reach the model as identical inputs.
        profiles[cuisine["cuisine"]] = tuple(scores.values())
        groups[cuisine["cuisine"]] = cuisine["cuisine_group"]
    group_members = {}
    for cuisine, group in groups.items():
        group_members.setdefault(group, []).append(cuisine)
    differences, overlaps = [], []
    for group, members in group_members.items():
        reference = group if group in members else members[0]
        reference_scores = np.array(profiles[reference])
        reference_top = set(np.argsort(reference_scores)[-min(TOP, len(districts)):])
        for cuisine in members:
            if cuisine == reference:
                continue
            scores = np.array(profiles[cuisine])
            differences.append(float(np.median(np.abs(scores - reference_scores))))
            overlaps.append(len(reference_top & set(np.argsort(scores)[-min(TOP, len(districts)):])))
    baseline_cuisine = "Indian" if "Indian" in profiles else next(iter(profiles))
    baseline = np.array(profiles[baseline_cuisine])
    trait_changes = {}
    for trait in vocabulary["traits"]:
        alternative = next((value for value in trait["values"] if value != trait["default"]), None)
        if alternative is None:
            continue
        changed = score_districts(model, vocabulary, districts, supply, {
            "cuisine": baseline_cuisine, **defaults, trait["name"]: alternative,
        })
        values = np.array([changed[d["postcode_district"]] for d in districts])
        trait_changes[trait["name"]] = float(np.median(np.abs(values - baseline)))
    return {
        "districts": len(districts),
        "cuisines": len(profiles),
        "cuisine_groups": len({row["cuisine_group"] for row in vocabulary["cuisines"]}),
        "distinct_cuisine_score_vectors": len(set(profiles.values())),
        "median_within_group_score_change": statistics.median(differences) if differences else 0,
        "median_within_group_top20_overlap": statistics.median(overlaps) if overlaps else 0,
        "trait_change_profile": baseline_cuisine,
        "median_score_change_by_trait": trait_changes,
        "median_district_p10_p90_spread": statistics.median(spreads),
        "min_district_p10_p90_spread": min(spreads),
        "max_district_p10_p90_spread": max(spreads),
    }


def compare(live: Path, candidate: Path, inspect=()) -> dict:
    """Compare a candidate bundle's rankings and coverage with the live bundle.

    Each cuisine group present in both vocabularies is scored with default
    traits. Rank correlation and top-20 overlap use only the districts both
    bundles score, so coverage changes are reported separately. ``inspect``
    lists districts whose default Indian score and rank are reported as
    ``None`` where a bundle omits them.
    """
    bundles = {"live": _load(live), "candidate": _load(candidate)}
    codes = {name: [d["postcode_district"] for d in b[2]] for name, b in bundles.items()}
    shared = sorted(set(codes["live"]) & set(codes["candidate"]))
    groups = sorted(
        {c["cuisine_group"] for c in bundles["live"][1]["cuisines"]}
        & {c["cuisine_group"] for c in bundles["candidate"][1]["cuisines"]}
    )

    def scores(name, cuisine):
        model, vocabulary, districts, supply = bundles[name]
        defaults = {t["name"]: t["default"] for t in vocabulary["traits"]}
        return score_districts(model, vocabulary, districts, supply, {"cuisine": cuisine, **defaults})

    def profile_cuisine(group):
        # A cuisine named after its group is scored as the group in both bundles.
        names = {c["cuisine"] for c in bundles["live"][1]["cuisines"] if c["cuisine_group"] == group}
        return group if group in names else sorted(names)[0]

    correlations, overlaps = {}, {}
    for group in groups:
        cuisine = profile_cuisine(group)
        ranked = {n: scores(n, cuisine) for n in ("live", "candidate")}
        live, cand = (np.array([ranked[n][c] for c in shared]) for n in ("live", "candidate"))
        top = min(TOP, len(shared))
        correlations[group] = float(spearmanr(live, cand).statistic) if len(shared) > 1 else 1.0
        overlaps[group] = len(set(np.argsort(live)[-top:]) & set(np.argsort(cand)[-top:]))

    inspected = {}
    for name in ("live", "candidate"):
        ranked = scores(name, "Indian")
        order = sorted(ranked, key=ranked.get, reverse=True)
        position = {code: i + 1 for i, code in enumerate(order)}
        for code in inspect:
            inspected.setdefault(code, {})[name] = (
                {"score": round(ranked[code], 4), "rank": position[code], "of": len(order)}
                if code in ranked else None
            )
    return {
        "live_districts": len(codes["live"]),
        "candidate_districts": len(codes["candidate"]),
        "shared_districts": len(shared),
        "dropped": sorted(set(codes["live"]) - set(codes["candidate"])),
        "added": sorted(set(codes["candidate"]) - set(codes["live"])),
        "cuisine_groups_compared": len(groups),
        "median_rank_correlation": statistics.median(correlations.values()),
        "min_rank_correlation": min(correlations.values()),
        "median_top20_overlap": statistics.median(overlaps.values()),
        "min_top20_overlap": min(overlaps.values()),
        "rank_correlation_by_group": correlations,
        "top20_overlap_by_group": overlaps,
        "inspect": inspected,
    }


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, help="folder containing the public model bundle")
    parser.add_argument("--against", type=Path, help="live bundle to compare rankings and coverage with")
    parser.add_argument("--inspect", nargs="*", default=[], help="districts to report with --against")
    args = parser.parse_args(argv)
    result = audit(args.bundle)
    if args.against:
        result = {"audit": result, "comparison": compare(args.against, args.bundle, args.inspect)}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
