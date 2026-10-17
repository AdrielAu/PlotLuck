"""Build the site bundle from the England source extracts.

One call, ``build(data, out)``, reads ``<data>/*_england.csv`` and writes:

- to ``out``, only the bundle (``BUNDLE_FILES``), the only thing the site reads;
- to ``data``, ``restaurants.csv``: the 15-column restaurant table of ADR 0004.
  It holds ratings and review counts, so it is private and stays beside the
  sources, on LinuxONE for full data (ADR 0003);
- to ``data``, ``label_policy.json``: the fitted label policy (R0, D0, n_ref).
  It derives from ratings, so it is private like ``restaurants.csv``;
- to ``data``, ``run/metrics.json``: row counts, label exclusions and fixes by
  reason, inputs left out and loss per epoch.

This is the tracer of the spec in issue #64: every stage is crude, but the
file shapes are the contract the site builds against.
"""

import argparse
import csv
import json
import statistics
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from plotluck import label, nn1
from plotluck.data import data_dir

# The site checks this; bump it whenever a bundle file changes shape.
BUNDLE_VERSION = 1
BUNDLE_FILES = (
    "districts.csv",
    "district_cuisine_supply.csv",
    "vocabulary.json",
    "model.json",
    "reference_scores.json",
)
TRACER_EPOCHS = 20
REFERENCE_TOLERANCE = 1e-6

MAPPING = Path(__file__).with_name("cuisine_mapping.csv")
UNSPECIFIED = "Unspecified"
OTHER = "Other"
VENUE_TYPES = ("Restaurant", "Pub and bar", "Café", "Fast food and street food")
DEFAULT_VENUE = "Restaurant"
PRICE_BANDS = {"€": "$", "€€-€€€": "$$", "€€€€": "$$$"}
UNKNOWN_PRICE = "unknown"
DIET_FLAGS = ("vegetarian_friendly", "vegan_options", "gluten_free")
CHAIN_MIN_NAMES = 3

# Fine cuisines with fewer label-eligible rows fold into their parent, then Other.
FULL_GROUP_THRESHOLD = 300
SAMPLE_GROUP_THRESHOLD = 10

RESTAURANT_COLUMNS = (
    "postcode_district",
    "cuisines",
    "price_band",
    "is_chain",
    "vegetarian_friendly",
    "vegan_options",
    "gluten_free",
    "avg_rating",
    "total_reviews",
    "count_excellent",
    "count_very_good",
    "count_average",
    "count_poor",
    "count_terrible",
    "review_success_label",
)
DISTRICT_COLUMNS = (
    "postcode_district",
    "centroid_lat",
    "centroid_lon",
    "total_restaurants",
    "population",
    "deprivation_index",
    "commercial_rent_index",
)

# NN1's district inputs, in input-vector order, and which get log1p first.
# shortcut: commercial_rent_index is left out until VOA lands (issue #72).
DISTRICT_INPUTS = ("population", "deprivation_index", "total_restaurants", "same_cuisine_supply")
LOG1P = {"population", "total_restaurants", "same_cuisine_supply"}


def build(
    data: Path,
    out: Path,
    *,
    group_threshold: int = FULL_GROUP_THRESHOLD,
    epochs: int = TRACER_EPOCHS,
    seed: int = 0,
) -> dict:
    """Run every stage on ``data`` and write the bundle to ``out``; return run metrics."""
    data, out = Path(data), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    postcodes = _read_csv(data / "onspd_england.csv")
    mapping = load_mapping()
    restaurants, metrics = restaurant_table(
        _read_csv(data / "tripadvisor_england.csv"), postcodes, mapping
    )
    policy = label_restaurants(restaurants)
    groups = cuisine_groups(restaurants, mapping, group_threshold)
    for r in restaurants:
        r["cuisine_group"] = groups[r["cuisine"]]
    districts = district_table(postcodes, _read_csv(data / "p004_england.csv"), restaurants)
    supply = Counter((r["postcode_district"], r["cuisine_group"]) for r in restaurants)

    _write_csv(data / "restaurants.csv", RESTAURANT_COLUMNS, restaurants)
    _write_json(data / "label_policy.json", {"prior_reviews": label.PRIOR_REVIEWS, **policy})
    _write_csv(out / "districts.csv", DISTRICT_COLUMNS, districts)
    _write_csv(
        out / "district_cuisine_supply.csv",
        ("postcode_district", "cuisine_group", "restaurants"),
        [
            {"postcode_district": d, "cuisine_group": g, "restaurants": n}
            for (d, g), n in sorted(supply.items())
        ],
    )

    vocab = vocabulary(groups)
    labelled = [r for r in restaurants if r["review_success_label"] != ""]
    by_code = {d["postcode_district"]: d for d in districts}
    district_raw = np.array([
        # In training a row's own restaurant is not part of its district's supply.
        _district_raw(
            by_code[r["postcode_district"]],
            supply[(r["postcode_district"], r["cuisine_group"])] - 1,
            exclude_from_total=1,
        )
        for r in labelled
    ])
    model = model_spec(vocab, district_raw)
    x = np.vstack([
        inputs(model, _restaurant_values(r), row[None, :])
        for r, row in zip(labelled, district_raw)
    ])
    y = np.array([r["review_success_label"] for r in labelled], dtype=float)
    model["layers"], losses = nn1.train(x, y, epochs=epochs, seed=seed)
    model["activations"] = list(nn1.ACTIVATIONS)

    reference = {
        "version": BUNDLE_VERSION,
        "tolerance": REFERENCE_TOLERANCE,
        "cases": [
            {"profile": profile, "scores": score_districts(model, vocab, districts, supply, profile)}
            for profile in reference_profiles(vocab)
        ],
    }
    _write_json(out / "vocabulary.json", vocab)
    _write_json(out / "model.json", model, indent=None)
    _write_json(out / "reference_scores.json", reference)
    metrics.update(
        restaurants=len(restaurants),
        labelled=len(labelled),
        inputs_left_out={"commercial_rent_index": "no VOA source yet (issue #72)"},
        epochs=epochs,
        train_loss=losses,
    )
    (data / "run").mkdir(exist_ok=True)
    _write_json(data / "run" / "metrics.json", metrics)
    return metrics


def vocabulary(groups: dict[str, str]) -> dict:
    """Cuisines with their group and display label, and the shipped traits."""
    return {
        "version": BUNDLE_VERSION,
        "cuisines": [
            {"cuisine": c, "cuisine_group": g, "label": c if c == g else f"{c} (scored as {g})"}
            for c, g in sorted(groups.items())
        ],
        # shortcut: every trait ships; issue #70 adds the 50% fill-rate rule.
        "traits": [
            {"name": "venue_type", "kind": "single_choice", "values": list(VENUE_TYPES), "default": DEFAULT_VENUE},
            {
                "name": "price_band",
                "kind": "single_choice",
                "values": [*PRICE_BANDS.values(), UNKNOWN_PRICE],
                "default": UNKNOWN_PRICE,
            },
            *(
                {"name": f, "kind": "on_off", "values": [False, True], "default": False}
                for f in ("chain", *DIET_FLAGS)
            ),
        ],
    }


def model_spec(vocab: dict, district_raw: np.ndarray) -> dict:
    """``model.json`` without layers: input order and transforms fitted on ``district_raw``.

    ``district_raw`` holds raw district inputs (NaN when missing), one column per
    ``DISTRICT_INPUTS`` entry. ``median`` is in raw units and fills a missing
    value before ``log1p`` and standardising.
    """
    transforms = {"cuisine_group": {"kind": "one_hot", "values": sorted({c["cuisine_group"] for c in vocab["cuisines"]})}}
    for trait in vocab["traits"]:
        transforms[trait["name"]] = (
            {"kind": "one_hot", "values": trait["values"]} if trait["kind"] == "single_choice" else {"kind": "flag"}
        )
    for name, column in zip(DISTRICT_INPUTS, district_raw.T):
        median = float(np.nanmedian(column)) if not np.isnan(column).all() else 0.0
        values = _fill_log1p(column, median, name in LOG1P)
        std = float(values.std())
        transforms[name] = {
            "kind": "numeric",
            "log1p": name in LOG1P,
            "mean": float(values.mean()),
            "std": std if std > 0 else 1.0,
            "median": median,
        }
    return {
        "version": BUNDLE_VERSION,
        "features": {
            "restaurant_inputs": ["cuisine_group", *(t["name"] for t in vocab["traits"])],
            "district_inputs": list(DISTRICT_INPUTS),
        },
        "transforms": transforms,
    }


def inputs(model: dict, restaurant: dict, district_raw: np.ndarray) -> np.ndarray:
    """Input matrix: the restaurant's encoded inputs beside each row of ``district_raw``.

    A one-hot value outside the vocabulary (an unseen cuisine) encodes as all zeros.
    """
    transforms = model["transforms"]
    head = []
    for name in model["features"]["restaurant_inputs"]:
        t = transforms[name]
        if t["kind"] == "one_hot":
            head += [float(restaurant[name] == v) for v in t["values"]]
        else:
            head.append(float(bool(restaurant[name])))
    columns = []
    for name, column in zip(model["features"]["district_inputs"], district_raw.T):
        t = transforms[name]
        columns.append((_fill_log1p(column, t["median"], t["log1p"]) - t["mean"]) / t["std"])
    return np.column_stack([np.tile(head, (len(district_raw), 1)), *columns])


def _fill_log1p(column: np.ndarray, median: float, log1p: bool) -> np.ndarray:
    """Fill NaN with the raw-unit median, then apply log1p if asked."""
    values = np.where(np.isnan(column), median, column)
    return np.log1p(values) if log1p else values


def score_districts(model: dict, vocab: dict, districts: list[dict], supply: Counter, profile: dict) -> dict[str, float]:
    """Score ``profile`` in every district with the exported weights."""
    group = {c["cuisine"]: c["cuisine_group"] for c in vocab["cuisines"]}.get(profile["cuisine"])
    district_raw = np.array([_district_raw(d, supply[(d["postcode_district"], group)]) for d in districts])
    scores = nn1.forward(model["layers"], inputs(model, {**profile, "cuisine_group": group}, district_raw))
    return {d["postcode_district"]: float(s) for d, s in zip(districts, scores)}


def reference_profiles(vocab: dict) -> list[dict]:
    """Fixed profiles for the browser parity check: defaults, all traits set, Unspecified."""
    defaults = {t["name"]: t["default"] for t in vocab["traits"]}
    everything = {t["name"]: t["values"][1] for t in vocab["traits"]}
    cuisines = [c["cuisine"] for c in vocab["cuisines"] if c["cuisine"] != UNSPECIFIED]
    return [
        {"cuisine": cuisines[0], **defaults},
        {"cuisine": cuisines[-1], **everything},
        {"cuisine": UNSPECIFIED, **defaults},
    ]


def _district_raw(district: dict, same_cuisine: int, exclude_from_total: int = 0) -> list[float]:
    """Raw ``DISTRICT_INPUTS`` for one district, less ``exclude_from_total`` restaurants."""
    def number(value):
        return float(value) if value != "" else np.nan

    return [
        number(district["population"]),
        number(district["deprivation_index"]),
        float(district["total_restaurants"] - exclude_from_total),
        float(same_cuisine),
    ]


def _restaurant_values(r: dict) -> dict:
    """A restaurant row as a profile: trait name -> value."""
    return {
        "cuisine_group": r["cuisine_group"],
        "venue_type": r["venue_type"],
        "price_band": r["price_band"] or UNKNOWN_PRICE,
        "chain": r["is_chain"],
        # shortcut: a missing diet flag counts as 0; revisit with issue #70.
        **{f: r[f] == 1 for f in DIET_FLAGS},
    }


def load_mapping() -> dict[str, dict]:
    """The committed cuisine mapping: tag -> {kind, cuisine, parent, venue_type}."""
    return {row["tag"]: row for row in _read_csv(MAPPING)}


def classify(cuisines: str, mapping: dict) -> tuple[str, str]:
    """Return (fine cuisine, venue type) for a raw ``cuisines`` value.

    Primary cuisine is the first specific tag, else the first umbrella tag,
    else Unspecified; venue type is the first venue tag, else Restaurant.
    """
    tags = [t.strip() for t in cuisines.split(",") if t.strip()]
    unknown = [t for t in tags if t not in mapping]
    if unknown:
        raise ValueError(f"cuisine tag(s) missing from {MAPPING.name}: {', '.join(unknown)}")
    kinds = {"cuisine": [], "umbrella": [], "venue": []}
    for t in tags:
        m = mapping[t]
        if m["kind"] in kinds:
            kinds[m["kind"]].append(m["venue_type"] if m["kind"] == "venue" else m["cuisine"])
    cuisine = (kinds["cuisine"] or kinds["umbrella"] or [UNSPECIFIED])[0]
    return cuisine, (kinds["venue"] or [DEFAULT_VENUE])[0]


def restaurant_table(rows: list[dict], postcodes: list[dict], mapping: dict):
    """Source rows -> restaurant dicts (ADR 0004 columns plus derived fields)."""
    names = Counter(r["restaurant_name"] for r in rows)
    located = [r for r in rows if _float(r["latitude"]) is not None and _float(r["longitude"]) is not None]
    district = _nearest_district(
        postcodes, [(float(r["latitude"]), float(r["longitude"])) for r in located]
    )
    excluded = Counter({"no_location": len(rows) - len(located)})
    fixes = Counter()
    restaurants = []
    for row, code in zip(located, district):
        cuisine, venue = classify(row["cuisines"], mapping)
        restaurants.append({
            "postcode_district": code,
            "cuisines": row["cuisines"],
            "price_band": PRICE_BANDS.get(row["price_level"], ""),
            "is_chain": int(names[row["restaurant_name"]] >= CHAIN_MIN_NAMES),
            **{f: {"Y": 1, "N": 0}.get(row[f], "") for f in DIET_FLAGS},
            **label.review_fields(row, fixes),
            "cuisine": cuisine,
            "venue_type": venue,
        })
    excluded.update(filter(None, map(label.exclusion, restaurants)))
    return restaurants, {"source_rows": len(rows), "excluded": dict(+excluded), "label_fixes": dict(fixes)}


def label_restaurants(restaurants: list[dict]) -> dict:
    """Set ``review_success_label`` under a policy fitted on every row; return it.

    The shipped model trains on every row; CV refits the policy per fold (issue #71).
    """
    policy = label.fit_policy(restaurants)
    for r, value in zip(restaurants, label.labels(restaurants, policy)):
        r["review_success_label"] = "" if value is None else round(value, 6)
    return policy


def cuisine_groups(restaurants: list[dict], mapping: dict, threshold: int) -> dict[str, str]:
    """Fine cuisine -> cuisine_group, for every fine cuisine in the mapping.

    A cuisine with fewer than ``threshold`` label-eligible rows folds into its
    parent. A parent's pool is its own rows plus those of its folded children;
    a pool still under ``threshold`` folds into Other. Parents are one level
    deep: a parent never has a parent of its own (checked in the tests).
    """
    parent = {m["cuisine"]: m["parent"] for m in mapping.values() if m["kind"] in ("cuisine", "umbrella")}
    parent.setdefault(UNSPECIFIED, "")
    counts = Counter(r["cuisine"] for r in restaurants if r["review_success_label"] != "")
    root = {c: parent[c] if parent[c] and counts[c] < threshold else c for c in parent}
    pool = Counter()
    for c, group in root.items():
        pool[group] += counts[c]
    return {c: group if pool[group] >= threshold else OTHER for c, group in root.items()}


def district_table(postcodes: list[dict], p004: list[dict], restaurants: list[dict]) -> list[dict]:
    """One row per district with an English postcode that has a grid reference.

    Restaurants come from live postcodes with a grid reference, so no
    restaurant lands in a district left out here.
    """
    residents = {r["district"]: int(r["residents"]) for r in p004}
    totals = Counter(r["postcode_district"] for r in restaurants)
    points, ranks = {}, {}
    for p in postcodes:
        lat, lon = _float(p["lat"]), _float(p["long"])
        if lat is not None and lon is not None and lat <= 90:  # 99.999999 = no grid reference
            points.setdefault(p["district"], []).append((lat, lon))
        if _float(p["imd25ind"]) is not None:
            ranks.setdefault(p["district"], []).append(float(p["imd25ind"]))
    rows = []
    for code in sorted(points):
        lats, lons = zip(*points[code])
        rows.append({
            "postcode_district": code,
            "centroid_lat": round(statistics.fmean(lats), 6),
            "centroid_lon": round(statistics.fmean(lons), 6),
            "total_restaurants": totals[code],
            "population": residents.get(code, ""),
            "deprivation_index": round(statistics.fmean(ranks[code]), 1) if code in ranks else "",
            # shortcut: no VOA source yet; issue #72 fills commercial_rent_index.
            "commercial_rent_index": "",
        })
    return rows


def _nearest_district(postcodes: list[dict], points: list[tuple[float, float]]) -> list[str]:
    """District of the nearest live postcode to each (lat, lon)."""
    live = [
        p for p in postcodes
        if not p["doterm"] and (_float(p["lat"]) or 99) <= 90 and _float(p["long"]) is not None
    ]
    if not points:
        return []
    scale = np.cos(np.radians(52.5))  # England's mid-latitude; fine for nearest-neighbour

    def xy(pairs):
        a = np.asarray(pairs, dtype=float)
        return np.column_stack((a[:, 1] * scale, a[:, 0]))

    _, idx = cKDTree(xy([(float(p["lat"]), float(p["long"])) for p in live])).query(xy(points))
    return [live[i]["district"] for i in idx]


def _float(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def _read_csv(path: Path) -> list[dict]:
    with Path(path).open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _write_json(path: Path, value, indent: int | None = 1) -> None:
    text = json.dumps(value, indent=indent, ensure_ascii=False, separators=None if indent else (",", ":"))
    path.write_text(text + "\n", encoding="utf-8", newline="\n")


def _write_csv(path: Path, columns, rows) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, columns, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(
        prog="python -m plotluck.build",
        description="Build the site bundle from the data folder chosen by data_dir().",
    )
    parser.add_argument("--out", type=Path, help="bundle folder (default: the data folder)")
    parser.add_argument("--epochs", type=int, default=TRACER_EPOCHS)
    args = parser.parse_args(argv)
    data = data_dir()
    full = data == data_dir(choice="full")
    metrics = build(
        data,
        args.out or data,
        group_threshold=FULL_GROUP_THRESHOLD if full else SAMPLE_GROUP_THRESHOLD,
        epochs=args.epochs,
    )
    print(json.dumps({k: v for k, v in metrics.items() if k != "train_loss"}))


if __name__ == "__main__":
    main()
