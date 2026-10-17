"""Build the site bundle from the England source extracts.

One call, ``build(data, out)``, reads ``<data>/*_england.csv`` and writes:

- to ``out``, only the bundle (``BUNDLE_FILES``), the only thing the site reads;
- to ``data``, ``restaurants.csv``: the 15-column restaurant table of ADR 0004.
  It holds ratings and review counts, so it is private and stays beside the
  sources, on LinuxONE for full data (ADR 0003);
- to ``data``, ``label_policy.json``: the fitted label policy (R0, D0, n_ref).
  It derives from ratings, so it is private like ``restaurants.csv``;
- to ``run`` (default ``<data>/run``), ``metrics.json``: row counts, label
  exclusions and fixes by reason, the district-grouped CV of NN1 against a
  training-mean baseline, and loss per epoch. It holds no restaurant rows or
  fitted label policy, so a run folder can be committed (``runs/README.md``).

This is the tracer of the spec in issue #64: every stage is crude, but the
file shapes are the contract the site builds against.
"""

import argparse
import csv
import json
import math
import re
import statistics
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from plotluck import context, label, nn1, quality
from plotluck.geometry import EARTH_RADIUS_KM, cluster_points, haversine_km
from plotluck.names import normalise_name
from plotluck.data import data_dir

# The site checks this; bump it whenever a bundle file changes shape.
BUNDLE_VERSION = 3
BUNDLE_FILES = (
    "districts.csv",
    "district_cuisine_supply.csv",
    "vocabulary.json",
    "model.json",
    "reference_scores.json",
)
# NN1 training procedure (issue #62): district-grouped CV with early stopping.
FOLDS = 5
MAX_EPOCHS = 100
PATIENCE = 10
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
# Cleaning thresholds (issue #150), set from the full-data audit in runs/2026-10-17-data-audit/.
# 99.9% of located rows lie within 0.81 km of a live English postcode; rows beyond 2 km (70)
# barely thin out by 5 km (66), so they are bad coordinates or outside England.
FAR_FROM_POSTCODE_KM = 2.0  # a row farther than this from any live English postcode is dropped
# Same-name groups grow steadily from 25 m to 100 m with no clean break; 50 m covers geocoding
# scatter around one building while staying below a street block, where branches start.
NEAR_DUPLICATE_M = 50.0  # same normalised name within this distance is one listing
# Off: removing the suffix makes 628 merged groups span more than 5 km, so it merges unrelated places.
DROP_BRANCH_SUFFIX = False  # strip " - Soho" / " (Kings Cross)" before comparing names

# Fine cuisines with fewer label-eligible rows fold into their parent, then Other.
FULL_GROUP_THRESHOLD = 300
SAMPLE_GROUP_THRESHOLD = 10
# A fine cuisine may have fewer examples than a standalone group because its
# group remains an input. Validate the 50-row full-data choice on LinuxONE.
MAX_FINE_CUISINE_THRESHOLD = 50

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
    *context.INPUTS,
    *context.SUMMARIES,
    "radius_km",
)
# Register each approved public economic or demographic extension here before
# adding it to district_table. Unknown fields must never pass through by default.
DISTRICT_PUBLIC_EXTENSIONS = ()

# NN1's district inputs, in input-vector order, and which get log1p first.
DISTRICT_INPUTS = (
    "population",
    "deprivation_index",
    "commercial_rent_index",
    "total_restaurants",
    "same_cuisine_supply",
    *context.INPUTS,
)
LOG1P = {"population", "commercial_rent_index", "total_restaurants", "same_cuisine_supply", *context.TOURISM_INPUTS}
# VOA measuring standards the rent index divides by, in order of preference:
# net internal area, then gross internal area where a district has no NIA.
VOA_AREA_UNITS = ("NIA", "GIA")
# Map circle radius: the distance from the centroid within which this share of
# a district's postcodes lie, so one stray postcode does not inflate it. A
# district with one or two postcodes (a PO box, one building) gets the minimum.
RADIUS_SHARE = 0.9
MIN_RADIUS_KM = 0.3


def build(
    data: Path,
    out: Path,
    *,
    group_threshold: int = FULL_GROUP_THRESHOLD,
    run: Path | None = None,
    folds: int = FOLDS,
    max_epochs: int = MAX_EPOCHS,
    patience: int = PATIENCE,
    seed: int = 0,
    apply_quality: bool = True,
) -> dict:
    """Run every stage on ``data`` and write the bundle to ``out``; return run metrics.

    NN1 is cross-validated in ``folds`` district-grouped folds, then the
    shipped model trains on every labelled row for the median best epoch.
    """
    data, out = Path(data), Path(out)
    run = Path(run) if run is not None else data / "run"
    if data.resolve() == out.resolve():
        raise ValueError("bundle output must be separate from private data")
    all_postcodes = read_csv(data / "onspd_england.csv")
    onspd_archive = data / "raw" / "onspd.zip"
    if group_threshold >= FULL_GROUP_THRESHOLD and not onspd_archive.is_file():
        raise FileNotFoundError("full-data build requires raw/onspd.zip to exclude cross-border districts")
    cross_border = quality.cross_border_districts(onspd_archive) if onspd_archive.is_file() else set()
    mapping = load_mapping()
    restaurants, metrics = restaurant_table(
        read_csv(data / "tripadvisor_england.csv"), all_postcodes, mapping
    )
    if cross_border:
        removed = sum(r["postcode_district"] in cross_border for r in restaurants)
        restaurants = [r for r in restaurants if r["postcode_district"] not in cross_border]
        if removed:
            metrics["excluded"]["cross_border"] = removed
    postcodes = [row for row in all_postcodes if row["district"] not in cross_border]
    districts = district_table(
        postcodes, read_csv(data / "p004_england.csv"), restaurants, read_csv(data / "voa_england.csv"),
        context.demographic_table(data), read_csv(data / "tourism_england.csv"),
    )
    tiny = [d["postcode_district"] for d in districts if d["radius_km"] == MIN_RADIUS_KM]
    print(f"Districts at the minimum {MIN_RADIUS_KM} km radius ({len(tiny)}): {' '.join(tiny)}")
    raw_districts = districts
    districts, reliable_codes, excluded, estimated = (
        quality.prepare_districts(raw_districts) if apply_quality else
        (raw_districts, {d["postcode_district"] for d in raw_districts}, Counter(), Counter())
    )
    scored_codes = {d["postcode_district"] for d in districts}
    policy = label_restaurants(restaurants, reliable_codes)
    labelled = [r for r in restaurants if r["review_success_label"] != "" and r["postcode_district"] in reliable_codes]
    fine_threshold = min(MAX_FINE_CUISINE_THRESHOLD, max(3, group_threshold // 6))
    traits = trait_vocabulary(restaurants)
    thresholds = {"group_threshold": group_threshold, "fine_threshold": fine_threshold}
    model, groups, supply = fit_inputs(labelled, restaurants, districts, traits, mapping, **thresholds)
    for r in restaurants:
        r["cuisine_group"] = groups[r["cuisine"]]
    supply_rows = [
        {"postcode_district": d, "cuisine_group": g, "restaurants": n}
        for (d, g), n in sorted(supply.items()) if d in scored_codes
    ]
    vocab = vocabulary(groups, traits)
    district_raw = training_district_inputs(labelled, districts, supply)
    # Without the quality stage (tests only) every district trains and a missing value takes the median.
    if apply_quality and np.isnan(district_raw).any():
        raise ValueError("a training district lacks recorded context; it must not be filled with a training median")
    cv = cross_validate(
        labelled, restaurants, districts, traits, mapping, **thresholds,
        folds=folds, max_epochs=max_epochs, patience=patience, seed=seed
    )
    # median_low: an epoch some fold actually chose; the plain median for an odd fold count.
    epochs = statistics.median_low(f["best_epoch"] for f in cv["folds"])
    y = np.array([r["review_success_label"] for r in labelled], dtype=float)
    model["layers"], losses = nn1.train(_design(model, labelled, district_raw), y, epochs=epochs, seed=seed)
    model["activations"] = list(nn1.ACTIVATIONS)

    reference = {
        "version": BUNDLE_VERSION,
        "tolerance": REFERENCE_TOLERANCE,
        "cases": [
            {"profile": profile, "scores": score_districts(model, vocab, districts, supply, profile)}
            for profile in reference_profiles(vocab)
        ],
    }
    metrics.update(
        restaurants=len(restaurants),
        labelled=len(labelled),
        districts_without_rent=sum(d["commercial_rent_index"] == "" for d in raw_districts),
        # A source's shares are all filled or all blank (context.demographic_table), so its first column stands for it.
        districts_without_census={
            name: sum(d[fields[0]] == "" for d in raw_districts) for name, fields in context.SOURCE_COLUMNS.items()
        },
        quality={
            "districts": len(raw_districts), "scored": len(districts),
            "training": len(reliable_codes),
            "training_with_labels": len({r["postcode_district"] for r in labelled}),
            "estimated": len(districts) - len(reliable_codes),
            "cross_border": len(cross_border), "estimated_reasons": dict(estimated), "excluded": dict(excluded),
        },
        cv=cv,
        shipped={"epochs": epochs, "train_loss": losses},
    )
    bundle = {
        "districts.csv": districts,
        "district_cuisine_supply.csv": supply_rows,
        "vocabulary.json": vocab,
        "model.json": model,
        "reference_scores.json": reference,
    }
    validate_run_metrics(metrics)
    publish_bundle(out, bundle)
    _write_csv(data / "restaurants.csv", RESTAURANT_COLUMNS, restaurants)
    _write_json(data / "label_policy.json", {"prior_reviews": label.PRIOR_REVIEWS, **policy})
    run.mkdir(parents=True, exist_ok=True)
    _write_json(run / "metrics.json", metrics)
    return metrics


def cross_validate(
    labelled: list[dict], restaurants: list[dict], districts: list[dict], traits: list[dict], mapping: dict, *,
    group_threshold: int, fine_threshold: int, folds: int, max_epochs: int, patience: int, seed: int
) -> dict:
    """District-grouped CV of NN1: per-fold and summary MAE and RMSE, with loss curves.

    Each fold refits the label policy, cuisine groups, fine-cuisine support
    and input transforms on its training rows (the fit rows and the
    early-stopping slice), so nothing from the test districts leaks in. The
    baseline predicts the training mean; only its errors are reported, as the
    mean itself derives from ratings.
    """
    results = []
    for split in nn1.group_splits([r["postcode_district"] for r in labelled], folds):
        train = np.concatenate([split["fit"], split["early_stop"]])
        train_rows = [labelled[i] for i in train]
        policy = label.fit_policy(train_rows)
        y = np.array(label.labels(labelled, policy), dtype=float)
        model, groups, supply = fit_inputs(
            train_rows, restaurants, districts, traits, mapping,
            group_threshold=group_threshold, fine_threshold=fine_threshold,
        )
        x = fold_design(model, groups, supply, labelled, districts)
        fit, stop, test = split["fit"], split["early_stop"], split["test"]
        layers, best, train_loss, stop_loss = nn1.train_early_stopping(
            x[fit], y[fit], x[stop], y[stop], max_epochs=max_epochs, patience=patience, seed=seed
        )
        model_mae, model_rmse = _mae_rmse(nn1.forward(layers, x[test]) - y[test])
        baseline_mae, baseline_rmse = _mae_rmse(y[train].mean() - y[test])
        results.append({
            "rows": {side: len(rows) for side, rows in split.items()},
            "best_epoch": best,
            "mae": model_mae,
            "rmse": model_rmse,
            "baseline_mae": baseline_mae,
            "baseline_rmse": baseline_rmse,
            "train_loss": train_loss,
            "early_stop_loss": stop_loss,
        })
    summary = {
        name: {"mean": statistics.fmean(f[name] for f in results), "std": statistics.pstdev(f[name] for f in results)}
        for name in ("mae", "rmse", "baseline_mae", "baseline_rmse")
    }
    return {"folds": results, "summary": summary}


def _mae_rmse(error: np.ndarray) -> tuple[float, float]:
    return float(np.abs(error).mean()), float(np.sqrt((error**2).mean()))


def only_keys(value: dict, keys, where: str) -> None:
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError(f"{where} has private or unexpected fields")


def _finite_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_run_metrics(metrics: dict) -> None:
    """Keep server run output to counts, losses and evaluation metrics."""
    allowed = {
        "source_rows", "excluded", "label_fixes", "label_anomalies", "restaurants", "labelled",
        "districts_without_rent", "districts_without_census", "cv", "shipped", "quality",
    }
    # Runs committed before the quality stage and the anomaly audit lack those keys.
    if not allowed - {"quality", "label_anomalies"} <= set(metrics) <= allowed:
        raise ValueError("run metrics have private or unexpected fields")

    def count(value):
        if type(value) is not int or value < 0:
            raise ValueError("run metrics counts must be non-negative integers")

    def number(value):
        if not _finite_number(value) or value < 0:
            raise ValueError("run metrics losses and errors must be finite non-negative numbers")

    def loss_curve(values):
        if not isinstance(values, list) or not values:
            raise ValueError("run metrics loss curve must contain numbers only")
        for value in values:
            number(value)

    for name in ("source_rows", "restaurants", "labelled", "districts_without_rent"):
        count(metrics[name])
    if "quality" in metrics:
        quality_metrics = metrics["quality"]
        only_keys(quality_metrics, (
            "districts", "scored", "training", "training_with_labels", "estimated", "cross_border",
            "estimated_reasons", "excluded",
        ), "quality metrics")
        for name in ("districts", "scored", "training", "training_with_labels", "estimated", "cross_border"):
            count(quality_metrics[name])
        if quality_metrics["scored"] != quality_metrics["training"] + quality_metrics["estimated"] or (
            quality_metrics["training_with_labels"] > quality_metrics["training"]
        ):
            raise ValueError("quality metrics counts are inconsistent")
        for name, allowed_reasons in (
            ("excluded", set(quality.EXCLUSION_REASONS)), ("estimated_reasons", quality.estimate_reasons())
        ):
            if not isinstance(quality_metrics[name], dict) or set(quality_metrics[name]) - allowed_reasons:
                raise ValueError(f"quality metrics have unexpected {name}")
            for value in quality_metrics[name].values():
                count(value)
        if quality_metrics["districts"] != quality_metrics["scored"] + sum(quality_metrics["excluded"].values()):
            raise ValueError("quality metrics exclusions do not add up")
        # Each estimated district repairs one or more groups, up to the limit.
        repairs, estimated = sum(quality_metrics["estimated_reasons"].values()), quality_metrics["estimated"]
        if not estimated <= repairs <= quality.MAX_REPAIRED_GROUPS * estimated:
            raise ValueError("quality metrics estimate reasons do not add up")
    only_keys(metrics["districts_without_census"], context.SOURCE_COLUMNS, "run metrics districts_without_census")
    for value in metrics["districts_without_census"].values():
        count(value)
    reasons = {
        "excluded": {
            "no_location", "far_from_postcode", "duplicate_listing", "cross_border",
            "rating_missing", "rating_out_of_range", "n_total_zero",
        },
        "label_fixes": {"counts_partly_missing", "total_below_counts"},
        "label_anomalies": set(label.ANOMALIES),
    }
    for name, allowed_reasons in reasons.items():
        if name == "label_anomalies" and name not in metrics:
            continue
        if not isinstance(metrics.get(name), dict) or any(
            type(value) is not int or value < 0 for value in metrics[name].values()
        ) or set(metrics[name]) - allowed_reasons:
            raise ValueError(f"run metrics {name} must contain counts only")
    cv = metrics["cv"]
    only_keys(cv, ("folds", "summary"), "run metrics cv")
    errors = ("mae", "rmse", "baseline_mae", "baseline_rmse")
    if not isinstance(cv["folds"], list) or not cv["folds"]:
        raise ValueError("run metrics cv must contain folds")
    for fold in cv["folds"]:
        only_keys(fold, (*errors, "rows", "best_epoch", "train_loss", "early_stop_loss"), "run metrics fold")
        only_keys(fold["rows"], ("fit", "early_stop", "test"), "run metrics fold rows")
        for value in fold["rows"].values():
            count(value)
        count(fold["best_epoch"])
        for name in errors:
            number(fold[name])
        loss_curve(fold["train_loss"])
        loss_curve(fold["early_stop_loss"])
    only_keys(cv["summary"], errors, "run metrics cv summary")
    for summary in cv["summary"].values():
        only_keys(summary, ("mean", "std"), "run metrics error summary")
        for value in summary.values():
            number(value)
    shipped = metrics["shipped"]
    only_keys(shipped, ("epochs", "train_loss"), "run metrics shipped")
    count(shipped["epochs"])
    loss_curve(shipped["train_loss"])


def publish_bundle(out: Path, bundle: dict) -> None:
    """Validate the complete public bundle before writing a single output file."""
    only_keys(bundle, BUNDLE_FILES, "bundle")
    districts = bundle["districts.csv"]
    supply = bundle["district_cuisine_supply.csv"]
    if not isinstance(districts, list) or not districts or not isinstance(supply, list):
        raise ValueError("bundle tables have private or unexpected shape")
    district_columns = (*DISTRICT_COLUMNS, *DISTRICT_PUBLIC_EXTENSIONS)
    for row in districts:
        only_keys(row, district_columns, "districts.csv")
        if not isinstance(row["postcode_district"], str) or not re.fullmatch(
            r"[A-Z]{1,2}\d[A-Z\d]?", row["postcode_district"]
        ):
            raise ValueError("districts.csv has an invalid district code")
        for name in district_columns[1:]:
            if name in context.SUMMARIES:
                continue
            if row[name] != "" and not _finite_number(float(row[name])):
                raise ValueError(f"districts.csv has an invalid {name}")
        if row["radius_km"] == "" or not float(row["radius_km"]) > 0:
            raise ValueError("districts.csv has an invalid radius_km")
        for name in context.DEMOGRAPHIC_INPUTS:
            value = row[name]
            if value != "" and not 0 <= float(value) <= (100 if name == "average_age" else 1):
                raise ValueError(f"districts.csv has an invalid {name}")
        for name in context.TOURISM_INPUTS:
            if isinstance(row[name], bool) or not str(row[name]).isdigit():
                raise ValueError(f"districts.csv has an invalid {name}")
        for fields, labels, name in (
            (context.ETHNICITY_INPUTS, context.ETHNICITY, "most_common_ethnicity"),
            (context.SEX_INPUTS, context.SEX, "most_common_sex"),
        ):
            values = {field: float(row[field]) if row[field] != "" else "" for field in fields}
            shares = list(values.values())
            if any(v != "" for v in shares) and (
                any(v == "" for v in shares) or not math.isclose(sum(shares), 1, abs_tol=1e-6)
            ):
                raise ValueError("districts.csv has invalid demographic shares")
            if row[name] != context.summary(values, fields, labels):
                raise ValueError("districts.csv has private or unexpected demographic summaries")
    district_codes = {row["postcode_district"] for row in districts}

    vocab = bundle["vocabulary.json"]
    only_keys(vocab, ("version", "cuisines", "traits"), "vocabulary.json")
    if vocab["version"] != BUNDLE_VERSION:
        raise ValueError("vocabulary.json has an unexpected version")
    allowed_cuisines = {m["cuisine"] for m in load_mapping().values() if m["cuisine"]} | {UNSPECIFIED}
    groups = set()
    for cuisine in vocab["cuisines"]:
        only_keys(cuisine, ("cuisine", "cuisine_group", "label"), "vocabulary cuisine")
        fine, group = cuisine["cuisine"], cuisine["cuisine_group"]
        if fine not in allowed_cuisines or group not in allowed_cuisines | {OTHER}:
            raise ValueError("vocabulary has a private or unexpected cuisine")
        if cuisine["label"] != (fine if fine == group else f"{fine} (scored as {group})"):
            raise ValueError("vocabulary has a private or unexpected label")
        groups.add(group)
    trait_names = []
    allowed_traits = {"venue_type", "price_band", "chain", *DIET_FLAGS}
    for trait in vocab["traits"]:
        only_keys(trait, ("name", "kind", "values", "default"), "vocabulary trait")
        if trait["name"] not in allowed_traits or trait["name"] in trait_names:
            raise ValueError("vocabulary has a private or unexpected trait")
        trait_names.append(trait["name"])
        expected = (
            list(VENUE_TYPES) if trait["name"] == "venue_type" else
            [*PRICE_BANDS.values(), UNKNOWN_PRICE] if trait["name"] == "price_band" else
            [False, True]
        )
        kind = "single_choice" if trait["name"] in {"venue_type", "price_band"} else "on_off"
        if trait["kind"] != kind or trait["values"] != expected or trait["default"] not in expected:
            raise ValueError("vocabulary has private or unexpected trait values")

    for row in supply:
        only_keys(row, ("postcode_district", "cuisine_group", "restaurants"), "supply table")
        count = row["restaurants"]
        if row["postcode_district"] not in district_codes or row["cuisine_group"] not in groups or (
            isinstance(count, bool) or not str(count).isdigit()
        ):
            raise ValueError("supply table has private or unexpected values")

    model = bundle["model.json"]
    only_keys(model, ("version", "features", "transforms", "layers", "activations"), "model.json")
    if model["version"] != BUNDLE_VERSION or model["activations"] != list(nn1.ACTIVATIONS):
        raise ValueError("model has private or unexpected metadata")
    only_keys(model["features"], ("restaurant_inputs", "district_inputs"), "model features")
    restaurant_inputs = model["features"]["restaurant_inputs"]
    district_inputs = model["features"]["district_inputs"]
    if restaurant_inputs != ["cuisine_group", "cuisine", *trait_names] or (
        len(district_inputs) != len(set(district_inputs)) or set(district_inputs) - set(DISTRICT_INPUTS)
    ):
        raise ValueError("model has private or unexpected inputs")
    only_keys(model["transforms"], [*restaurant_inputs, *district_inputs], "model transforms")
    for name, transform in model["transforms"].items():
        if name in district_inputs:
            only_keys(transform, ("kind", "log1p", "mean", "std", "median"), "numeric transform")
            if transform["kind"] != "numeric" or not isinstance(transform["log1p"], bool) or not all(
                _finite_number(transform[key]) for key in ("mean", "std", "median")
            ):
                raise ValueError("model has private or unexpected numeric transforms")
        elif name in {"cuisine_group", "cuisine", "venue_type", "price_band"}:
            only_keys(transform, ("kind", "values"), "categorical transform")
            expected = (
                sorted(groups) if name == "cuisine_group" else
                None if name == "cuisine" else
                next(trait["values"] for trait in vocab["traits"] if trait["name"] == name)
            )
            if transform["kind"] != "one_hot" or (expected is not None and transform["values"] != expected):
                raise ValueError("model has private or unexpected categorical transforms")
            if name == "cuisine" and (
                transform["values"] != sorted(set(transform["values"])) or
                set(transform["values"]) - {c["cuisine"] for c in vocab["cuisines"]}
            ):
                raise ValueError("model has private or unexpected fine cuisines")
        else:
            only_keys(transform, ("kind",), "flag transform")
            if transform["kind"] != "flag":
                raise ValueError("model has private or unexpected flag transforms")
    for layer in model["layers"]:
        only_keys(layer, ("weights", "biases"), "model layer")
        if not all(_finite_number(value) for row in layer["weights"] for value in row) or not all(
            _finite_number(value) for value in layer["biases"]
        ):
            raise ValueError("model layer has private or unexpected values")

    reference = bundle["reference_scores.json"]
    only_keys(reference, ("version", "tolerance", "cases"), "reference scores")
    if reference["version"] != BUNDLE_VERSION or not _finite_number(reference["tolerance"]):
        raise ValueError("reference scores have private or unexpected metadata")
    for case in reference["cases"]:
        only_keys(case, ("profile", "scores"), "reference case")
        only_keys(case["profile"], ("cuisine", *trait_names), "reference profile")
        if case["profile"]["cuisine"] not in {c["cuisine"] for c in vocab["cuisines"]} or any(
            case["profile"][trait["name"]] not in trait["values"] for trait in vocab["traits"]
        ):
            raise ValueError("reference profile has private or unexpected values")
        only_keys(case["scores"], district_codes, "reference district scores")
        if not all(_finite_number(score) and 0 <= score <= 1 for score in case["scores"].values()):
            raise ValueError("reference scores have private or unexpected values")

    out = Path(out)
    if out.exists() and {path.name for path in out.iterdir()} - set(BUNDLE_FILES) - {".gitkeep"}:
        raise ValueError("bundle output contains private or unexpected files")
    out.mkdir(parents=True, exist_ok=True)
    _write_csv(out / "districts.csv", district_columns, districts)
    _write_csv(out / "district_cuisine_supply.csv", ("postcode_district", "cuisine_group", "restaurants"), supply)
    _write_json(out / "vocabulary.json", vocab)
    _write_json(out / "model.json", model, indent=None)
    _write_json(out / "reference_scores.json", reference)


def vocabulary(groups: dict[str, str], traits: list[dict]) -> dict:
    """``vocabulary.json``: every cuisine with its group, and the shipped ``traits``."""
    return {
        "version": BUNDLE_VERSION,
        "cuisines": [
            {"cuisine": c, "cuisine_group": g, "label": c if c == g else f"{c} (scored as {g})"}
            for c, g in sorted(groups.items())
        ],
        "traits": traits,
    }


def trait_vocabulary(restaurants: list[dict]) -> list[dict]:
    """Traits filled on at least half the prepared England rows.

    Venue type always ships. Rates include label-ineligible rows; diagnostics
    are printed only, so they stay on the server for full-data builds.
    """
    filled = {
        name: sum(r[column] != "" for r in restaurants) / len(restaurants) if restaurants else 0.0
        for name, column in [("price_band", "price_band"), ("chain", "is_chain"), *((f, f) for f in DIET_FLAGS)]
    }
    for name, rate in filled.items():
        print(f"Trait fill rate {name}: {rate:.1%}")
    traits: list[dict] = [
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
    ]
    return [t for t in traits if t["name"] == "venue_type" or filled[t["name"]] >= 0.5]


def fit_inputs(
    train: list[dict], restaurants: list[dict], districts: list[dict], traits: list[dict], mapping: dict, *,
    group_threshold: int, fine_threshold: int,
) -> tuple[dict, dict[str, str], Counter]:
    """(model without layers, cuisine groups, supply) fitted on the labelled ``train`` rows alone.

    Cuisine groups, fine-cuisine support and input transforms see only
    ``train``. Supply counts every row of ``restaurants`` under those groups,
    as it is an observed input, not a fitted value.
    """
    groups = cuisine_groups(train, mapping, group_threshold)
    supply = Counter((r["postcode_district"], groups[r["cuisine"]]) for r in restaurants)
    district_raw = training_district_inputs(_grouped(train, groups), districts, supply)
    model = model_spec(
        vocabulary(groups, traits), district_raw, fine_cuisines=_supported_cuisines(train, fine_threshold)
    )
    return model, groups, supply


def fold_design(model: dict, groups: dict[str, str], supply: Counter, rows: list[dict], districts: list[dict]) -> np.ndarray:
    """Input matrix for ``rows`` under one ``fit_inputs`` result."""
    rows = _grouped(rows, groups)
    return _design(model, rows, training_district_inputs(rows, districts, supply))


def _grouped(rows: list[dict], groups: dict[str, str]) -> list[dict]:
    return [{**r, "cuisine_group": groups[r["cuisine"]]} for r in rows]


def training_district_inputs(restaurants: list[dict], districts: list[dict], supply: Counter) -> np.ndarray:
    """Raw ``DISTRICT_INPUTS`` per restaurant row, NaN when missing.

    Each row's own restaurant is left out of both its total and its
    same-cuisine supply, as a new entrant adds to the existing supply. The
    published ``supply`` and ``total_restaurants`` stay unadjusted.
    """
    by_code = {d["postcode_district"]: d for d in districts}
    return np.array([
        _district_raw(
            by_code[r["postcode_district"]],
            supply[(r["postcode_district"], r["cuisine_group"])] - 1,
            exclude_from_total=1,
        )
        for r in restaurants
    ])


def _supported_cuisines(restaurants: list[dict], threshold: int) -> set[str]:
    """Fine cuisines with enough labelled training rows to learn separately."""
    counts = Counter(r["cuisine"] for r in restaurants)
    return {cuisine for cuisine, count in counts.items() if count >= threshold}


def model_spec(vocab: dict, district_raw: np.ndarray, *, fine_cuisines: set[str] | None = None) -> dict:
    """``model.json`` without layers: input order and transforms fitted on ``district_raw``.

    ``district_raw`` holds raw district inputs (NaN when missing), one column per
    ``DISTRICT_INPUTS`` entry. ``median`` is in raw units and fills a missing
    value before ``log1p`` and standardising. ``fine_cuisines`` is selected
    from labelled training rows only; other cuisines use their broad group.
    """
    if fine_cuisines is None:
        fine_cuisines = {c["cuisine"] for c in vocab["cuisines"]}
    transforms = {
        "cuisine_group": {"kind": "one_hot", "values": sorted({c["cuisine_group"] for c in vocab["cuisines"]})},
        "cuisine": {"kind": "one_hot", "values": sorted(fine_cuisines)},
    }
    for trait in vocab["traits"]:
        transforms[trait["name"]] = (
            {"kind": "one_hot", "values": trait["values"]} if trait["kind"] == "single_choice" else {"kind": "flag"}
        )
    for name, column in zip(DISTRICT_INPUTS, district_raw.T):
        median = float(np.nanmedian(column)) if not np.isnan(column).all() else 0.0
        values = _fill_log1p(column, median, name in LOG1P)
        std = float(values.std()) if np.ptp(values) > 0 else 0.0  # a constant column's std is float noise
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
            "restaurant_inputs": ["cuisine_group", "cuisine", *(t["name"] for t in vocab["traits"])],
            "district_inputs": list(DISTRICT_INPUTS),
        },
        "transforms": transforms,
    }


def _design(model: dict, restaurants: list[dict], district_raw: np.ndarray) -> np.ndarray:
    """Input matrix with one row per restaurant, beside its own row of ``district_raw``."""
    return np.vstack([
        inputs(model, _restaurant_values(r), row[None, :]) for r, row in zip(restaurants, district_raw)
    ])


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

    values = {**district, "total_restaurants": district["total_restaurants"] - exclude_from_total,
              "same_cuisine_supply": same_cuisine}
    return [number(values.get(name, "")) for name in DISTRICT_INPUTS]


def _restaurant_values(r: dict) -> dict:
    """A restaurant row as a profile: trait name -> value."""
    return {
        "cuisine": r["cuisine"],
        "cuisine_group": r["cuisine_group"],
        "venue_type": r["venue_type"],
        "price_band": r["price_band"] or UNKNOWN_PRICE,
        "chain": r["is_chain"],
        # Missing diet flags use the profile default (off).
        **{f: r[f] == 1 for f in DIET_FLAGS},
    }


def load_mapping(path: Path = MAPPING) -> dict[str, dict]:
    """The committed cuisine mapping: tag -> {kind, cuisine, parent, venue_type}.

    Raises ValueError if a tag has more than one row, since the later row would silently win.
    """
    rows = read_csv(path)
    duplicates = sorted(tag for tag, n in Counter(r["tag"] for r in rows).items() if n > 1)
    if duplicates:
        raise ValueError(f"tag(s) listed more than once in {Path(path).name}: {', '.join(duplicates)}")
    return {row["tag"]: row for row in rows}


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
    """Source rows -> restaurant dicts (ADR 0004 columns plus derived fields).

    Stages, in order: location check, duplicate listings, chain, label fields.
    Supply and ``total_restaurants`` are counted from the result, so they see
    only the cleaned rows.
    """
    located = [r for r in rows if float_or_none(r["latitude"]) is not None and float_or_none(r["longitude"]) is not None]
    points = [(float(r["latitude"]), float(r["longitude"])) for r in located]
    district, km = nearest_postcodes(postcodes, points)
    excluded = Counter({"no_location": len(rows) - len(located)})
    kept = [i for i, d in enumerate(km) if d <= FAR_FROM_POSTCODE_KM]
    excluded["far_from_postcode"] = len(located) - len(kept)
    located, points, district = ([x[i] for i in kept] for x in (located, points, district))
    kept = _without_duplicate_listings(located, points)
    excluded["duplicate_listing"] = len(located) - len(kept)
    located, district = [located[i] for i in kept], [district[i] for i in kept]
    name_counts = Counter(normalise_name(r["restaurant_name"], drop_branch_suffix=DROP_BRANCH_SUFFIX) for r in located)
    fixes = Counter()
    restaurants = []
    for row, code in zip(located, district):
        name = normalise_name(row["restaurant_name"], drop_branch_suffix=DROP_BRANCH_SUFFIX)
        cuisine, venue = classify(row["cuisines"], mapping)
        restaurants.append({
            "postcode_district": code,
            "cuisines": row["cuisines"],
            "price_band": PRICE_BANDS.get(row["price_level"], ""),
            "is_chain": int(name_counts[name] >= CHAIN_MIN_NAMES),
            **{f: {"Y": 1, "N": 0}.get(row[f], "") for f in DIET_FLAGS},
            **label.review_fields(row, fixes),
            "cuisine": cuisine,
            "venue_type": venue,
        })
    excluded.update(filter(None, map(label.exclusion, restaurants)))
    anomalies = Counter(flag for r in restaurants for flag in label.anomalies(r))
    return restaurants, {
        "source_rows": len(rows), "excluded": dict(+excluded), "label_fixes": dict(fixes),
        "label_anomalies": dict(anomalies),
    }


def _without_duplicate_listings(rows: list[dict], points: list[tuple[float, float]]) -> list[int]:
    """Indices of the rows left once each duplicate listing set keeps its best row, in source order.

    A set is rows sharing a ``restaurant_link``, then rows with one normalised
    name within ``NEAR_DUPLICATE_M`` of each other (chained). The kept row has
    the most reviews; ties go to the first row. Review counts are never merged.
    """
    reviews = [label.review_fields(r, Counter())["total_reviews"] for r in rows]
    reviews = [0 if n == "" else n for n in reviews]
    best = {}
    for i, row in enumerate(rows):
        key = row["restaurant_link"] or f"row {i}"  # a blank link identifies nothing
        if key not in best or reviews[i] > reviews[best[key]]:
            best[key] = i
    survivors = sorted(best.values())
    by_name = {}
    for i in survivors:
        name = normalise_name(rows[i]["restaurant_name"], drop_branch_suffix=DROP_BRANCH_SUFFIX)
        by_name.setdefault(name, []).append(i)
    dropped = set()
    for members in by_name.values():
        if len(members) < 2:
            continue
        cluster = cluster_points([points[i] for i in members], NEAR_DUPLICATE_M)
        winner = {}
        for k, i in enumerate(members):
            root = cluster[k]
            if root not in winner or reviews[i] > reviews[winner[root]]:
                winner[root] = i
        dropped.update(set(members) - set(winner.values()))
    return [i for i in survivors if i not in dropped]


def label_restaurants(restaurants: list[dict], reliable_codes: set[str] | None = None) -> dict:
    """Set labels with a policy fitted on reliable districts; return it.

    ``cross_validate`` refits it per fold. All source rows keep labels in the
    private table, but only reliable districts train the shipped model.
    """
    fit_rows = restaurants if reliable_codes is None else [
        row for row in restaurants if row["postcode_district"] in reliable_codes
    ]
    policy = label.fit_policy(fit_rows)
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


def district_table(
    postcodes: list[dict], p004: list[dict], restaurants: list[dict], voa: list[dict],
    demographics: dict[str, dict], tourism: list[dict],
) -> list[dict]:
    """One row per district with an English postcode that has a grid reference.

    Restaurants come from live postcodes with a grid reference, so no
    restaurant lands in a district left out here.
    """
    residents = {r["district"]: int(r["residents"]) for r in p004}
    rent = rent_index(voa)
    totals = Counter(r["postcode_district"] for r in restaurants)
    tourism_counts = Counter()
    seen = set()
    tourism_points, kinds = [], []
    for point in tourism:
        key = (point["osm_type"], point["osm_id"])
        if key in seen:
            continue
        seen.add(key)
        lat, lon = float(point["lat"]), float(point["lon"])
        if not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError("Tourism point has invalid coordinates")
        if point["tourism"] not in ("attraction", "hotel"):
            raise ValueError("Tourism point has an unexpected kind")
        tourism_points.append((lat, lon))
        kinds.append(point["tourism"])
    for district, kind in zip(nearest_postcodes(postcodes, tourism_points)[0], kinds):
        tourism_counts[district, kind] += 1
    points, ranks = {}, {}
    for p in postcodes:
        lat, lon = float_or_none(p["lat"]), float_or_none(p["long"])
        if lat is not None and lon is not None and lat <= 90:  # 99.999999 = no grid reference
            points.setdefault(p["district"], []).append((lat, lon))
        if float_or_none(p["imd25ind"]) is not None:
            ranks.setdefault(p["district"], []).append(float(p["imd25ind"]))
    rows = []
    for code in sorted(points):
        lats, lons = zip(*points[code])
        lat, lon = statistics.fmean(lats), statistics.fmean(lons)
        demographic = {name: demographics.get(code, {}).get(name, "") for name in context.DEMOGRAPHIC_INPUTS}
        rows.append({
            "postcode_district": code,
            "centroid_lat": round(lat, 6),
            "centroid_lon": round(lon, 6),
            "total_restaurants": totals[code],
            "population": residents.get(code, ""),
            "deprivation_index": round(statistics.fmean(ranks[code]), 1) if code in ranks else "",
            "commercial_rent_index": rent.get(code, ""),
            **demographic,
            "attractions_count": tourism_counts[code, "attraction"],
            "hotels_count": tourism_counts[code, "hotel"],
            "most_common_ethnicity": context.summary(demographic, context.ETHNICITY_INPUTS, context.ETHNICITY),
            "most_common_sex": context.summary(demographic, context.SEX_INPUTS, context.SEX),
            "radius_km": _radius_km(lat, lon, lats, lons),
        })
    return rows


def _radius_km(lat: float, lon: float, lats: tuple[float, ...], lons: tuple[float, ...]) -> float:
    """Circle radius around (lat, lon) covering ``RADIUS_SHARE`` of the points, at least ``MIN_RADIUS_KM``.

    Distances are on a flat map local to the district, which is close enough at district scale.
    """
    # shortcut: a coverage circle from postcode points, not district boundaries; upgrade if a
    # permitted postcode-district boundary source appears (none from OS/ONS as of 2026-10).
    dy = np.radians(np.subtract(lats, lat))
    dx = np.radians(np.subtract(lons, lon)) * math.cos(math.radians(lat))
    radius = float(np.quantile(np.hypot(dx, dy), RADIUS_SHARE)) * EARTH_RADIUS_KM
    return round(max(radius, MIN_RADIUS_KM), 3)


def rent_index(voa: list[dict]) -> dict[str, float]:
    """Median rateable value per square metre of each district's VOA valuations.

    £/m² only compares within one measuring standard, so a district uses its
    NIA valuations, or its GIA ones when it has no NIA. Valuations without a
    positive area have no valid denominator; a district with none is left
    out, not filled.
    """
    per_m2 = {}
    for v in voa:
        area, rv = float_or_none(v["total_area"]), float_or_none(v["adopted_rv"])
        if v["unit"] in VOA_AREA_UNITS and area and area > 0 and rv is not None:
            per_m2.setdefault(v["district"], {}).setdefault(v["unit"], []).append(rv / area)
    return {
        d: round(statistics.median(next(by_unit[u] for u in VOA_AREA_UNITS if u in by_unit)), 1)
        for d, by_unit in per_m2.items()
    }


def nearest_postcodes(postcodes: list[dict], points: list[tuple[float, float]]) -> tuple[list[str], list[float]]:
    """District of the nearest live postcode to each (lat, lon), and the great-circle distance to it in km."""
    live = [
        p for p in postcodes
        if not p["doterm"] and (float_or_none(p["lat"]) or 99) <= 90 and float_or_none(p["long"]) is not None
    ]
    if not points:
        return [], []
    scale = np.cos(np.radians(52.5))  # England's mid-latitude; fine for nearest-neighbour

    def xy(pairs):
        a = np.asarray(pairs, dtype=float)
        return np.column_stack((a[:, 1] * scale, a[:, 0]))

    coords = np.array([(float(p["lat"]), float(p["long"])) for p in live])
    _, idx = cKDTree(xy(coords)).query(xy(points))
    km = haversine_km(points, coords[idx])
    return [live[i]["district"] for i in idx], km.tolist()


def float_or_none(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def read_csv(path: Path) -> list[dict]:
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
    parser.add_argument("--out", type=Path, help="bundle folder (default: <data folder>/bundle)")
    parser.add_argument("--run", type=Path, help="run-results folder (default: <data folder>/run)")
    parser.add_argument("--max-epochs", type=int, default=MAX_EPOCHS)
    parser.add_argument("--patience", type=int, default=PATIENCE)
    args = parser.parse_args(argv)
    data = data_dir()
    full = data == data_dir(choice="full")
    metrics = build(
        data,
        args.out or data / "bundle",
        group_threshold=FULL_GROUP_THRESHOLD if full else SAMPLE_GROUP_THRESHOLD,
        run=args.run,
        max_epochs=args.max_epochs,
        patience=args.patience,
    )
    print(json.dumps({**metrics, "cv": metrics["cv"]["summary"], "shipped": {"epochs": metrics["shipped"]["epochs"]}}))


if __name__ == "__main__":
    main()
