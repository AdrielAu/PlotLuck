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

from plotluck.build import score_districts


def _bundle_inputs(bundle: Path) -> tuple[dict, dict, list[dict], Counter]:
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


def _rank_comparison(candidate: tuple, comparison: tuple) -> dict:
    model, vocabulary, districts, supply = candidate
    other_model, other_vocabulary, other_districts, other_supply = comparison
    shared_codes = {row["postcode_district"] for row in districts} & {
        row["postcode_district"] for row in other_districts
    }
    shared_cuisines = sorted({row["cuisine"] for row in vocabulary["cuisines"]} & {
        row["cuisine"] for row in other_vocabulary["cuisines"]
    })
    if not shared_codes or not shared_cuisines:
        raise ValueError("ranking comparison needs shared districts and cuisines")
    defaults = {trait["name"]: trait["default"] for trait in vocabulary["traits"]}
    other_defaults = {trait["name"]: trait["default"] for trait in other_vocabulary["traits"]}
    correlations, overlaps = [], []
    size = len(shared_codes)
    top_size = min(20, size)
    for cuisine in shared_cuisines:
        scores = score_districts(model, vocabulary, districts, supply, {"cuisine": cuisine, **defaults})
        other_scores = score_districts(
            other_model, other_vocabulary, other_districts, other_supply,
            {"cuisine": cuisine, **other_defaults},
        )
        ranked = sorted(shared_codes, key=lambda code: (-scores[code], code))
        other_ranked = sorted(shared_codes, key=lambda code: (-other_scores[code], code))
        positions = {code: i for i, code in enumerate(ranked)}
        other_positions = {code: i for i, code in enumerate(other_ranked)}
        squared_difference = sum((positions[code] - other_positions[code]) ** 2 for code in shared_codes)
        correlations.append(1 - 6 * squared_difference / (size * (size**2 - 1)) if size > 1 else 1)
        overlaps.append(len(set(ranked[:top_size]) & set(other_ranked[:top_size])))
    return {
        "shared_districts": size,
        "shared_cuisines": len(shared_cuisines),
        "median_rank_correlation": statistics.median(correlations),
        "median_top20_overlap": statistics.median(overlaps),
    }


def audit(bundle: Path, *, comparison: Path | None = None) -> dict:
    """Summarise score spread and distinct cuisine rankings in a public bundle."""
    candidate = _bundle_inputs(bundle)
    model, vocabulary, districts, supply = candidate
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
    group_members: dict[str, list[str]] = {}
    for cuisine, group in groups.items():
        group_members.setdefault(group, []).append(cuisine)
    differences, overlaps = [], []
    for group, members in group_members.items():
        reference = group if group in members else members[0]
        reference_scores = np.array(profiles[reference])
        reference_top = set(np.argsort(reference_scores)[-min(20, len(districts)):])
        for cuisine in members:
            if cuisine == reference:
                continue
            scores = np.array(profiles[cuisine])
            differences.append(float(np.median(np.abs(scores - reference_scores))))
            overlaps.append(len(reference_top & set(np.argsort(scores)[-min(20, len(districts)):])))
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
    result = {
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
    if comparison is not None:
        result["comparison"] = _rank_comparison(candidate, _bundle_inputs(comparison))
    return result


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, help="folder containing the public model bundle")
    parser.add_argument("--comparison", type=Path, help="second bundle for rank stability over shared districts")
    args = parser.parse_args(argv)
    print(json.dumps(audit(args.bundle, comparison=args.comparison), indent=2))


if __name__ == "__main__":
    main()
