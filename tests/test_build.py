import csv
import copy
import json
import shutil
import statistics
from collections import Counter
from zipfile import ZipFile

import numpy as np
import pytest

from plotluck import build, context, data_dir, nn1, sources


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


SOURCES = ("tripadvisor_england.csv", "onspd_england.csv", "p004_england.csv", "voa_england.csv",
           "census_age_england.csv", "census_ethnicity_england.csv", "census_sex_england.csv", "tourism_england.csv")


def copy_sources(dest):
    """A data folder holding only the sample sources, so builds never touch data/sample."""
    dest.mkdir(parents=True, exist_ok=True)
    for name in SOURCES:
        shutil.copyfile(data_dir(choice="sample") / name, dest / name)
    return dest


# 203 rows survive cleaning, and the first of them to be dropped (row 20) is filled: the rule needs 102.
@pytest.mark.parametrize("filled, ships", [(101, False), (103, True)])
def test_trait_fill_rule_controls_vocabulary_and_model(tmp_path, capsys, filled, ships):
    copy_sources(tmp_path)
    source = tmp_path / "tripadvisor_england.csv"
    rows = read_csv(source)
    for i, row in enumerate(rows):
        row["vegan_options"] = "N" if i < filled else ""
        row["price_level"] = ""
    with source.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    out = tmp_path / "bundle"
    build.build(tmp_path, out, group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1)
    vocab = read_json(out / "vocabulary.json")
    model = read_json(out / "model.json")
    traits = {t["name"]: t for t in vocab["traits"]}

    assert ("vegan_options" in traits) is ships
    assert ("vegan_options" in model["features"]["restaurant_inputs"]) is ships
    assert ("vegan_options" in model["transforms"]) is ships
    assert "price_band" not in traits
    assert "price_band" not in model["features"]["restaurant_inputs"]
    assert "price_band" not in model["transforms"]
    assert traits["venue_type"]["default"] == "Restaurant"
    for case in read_json(out / "reference_scores.json")["cases"]:
        assert set(case["profile"]) == {"cuisine", *traits}
    output = capsys.readouterr().out
    assert f"vegan_options: {(filled - 1) / 203:.1%}" in output  # row 20 is cleaned out
    for name in ("chain", "price_band", "vegetarian_friendly", "gluten_free"):
        assert f"{name}: " in output


@pytest.fixture(scope="module")
def data(tmp_path_factory):
    data = copy_sources(tmp_path_factory.mktemp("data"))
    build.build(data, data / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD)
    return data


@pytest.fixture(scope="module")
def built(data):
    return data / "bundle"


def test_bundle_holds_only_publishable_files_and_private_ones_stay_in_data(data, built):
    assert sorted(p.name for p in built.iterdir()) == [
        "district_cuisine_supply.csv",
        "district_outlines.json",
        "districts.csv",
        "model.json",
        "reference_scores.json",
        "vocabulary.json",
    ]
    assert (data / "restaurants.csv").is_file()
    assert read_json(data / "run" / "metrics.json")["restaurants"] == 203


def test_cross_border_district_is_absent_from_export_and_training(tmp_path):
    data = copy_sources(tmp_path / "data")
    archive = data / "raw" / "onspd.zip"
    archive.parent.mkdir()
    with ZipFile(archive, "w") as file:
        file.writestr("Data/ONSPD_OCT_2026_UK.csv", (
            "pcds,doterm,ctry24cd\n"
            "SE17 1AA,,E92000001\nSE17 1AB,,S92000003\n"
            "SE1 1AA,,E92000001\nSE1 1AB,202001,W92000004\n"
        ))

    mapped, _ = build.restaurant_table(
        read_csv(data / "tripadvisor_england.csv"),
        read_csv(data / "onspd_england.csv"),
        build.load_mapping(),
    )
    mapped_counts = Counter(row["postcode_district"] for row in mapped)
    assert mapped_counts["SE17"] > 0

    out = tmp_path / "bundle"
    metrics = build.build(data, out, group_threshold=build.SAMPLE_GROUP_THRESHOLD, folds=3, max_epochs=1)

    districts = {row["postcode_district"] for row in read_csv(out / "districts.csv")}
    supply = {row["postcode_district"] for row in read_csv(out / "district_cuisine_supply.csv")}
    private_rows = read_csv(data / "restaurants.csv")
    private = {row["postcode_district"] for row in private_rows}
    assert "SE17" not in districts | supply | private
    assert Counter(row["postcode_district"] for row in private_rows) == {
        code: count for code, count in mapped_counts.items() if code != "SE17"
    }
    assert "SE1" in districts
    assert metrics["quality"]["cross_border"] == 1
    assert metrics["excluded"]["cross_border"] == mapped_counts["SE17"]
    for case in read_json(out / "reference_scores.json")["cases"]:
        assert "SE17" not in case["scores"]
        assert "SE1" in case["scores"]


def test_full_data_build_requires_uk_postcode_archive(tmp_path):
    data = copy_sources(tmp_path / "data")
    with pytest.raises(FileNotFoundError, match="raw/onspd.zip"):
        build.build(data, tmp_path / "bundle", group_threshold=build.FULL_GROUP_THRESHOLD)


@pytest.mark.parametrize(
    "filename, fields",
    [
        ("districts.csv", {"restaurant_name": "A private name"}),
        ("districts.csv", {"restaurant_link": "https://example.invalid/private"}),
        ("districts.csv", {"street_address": "A private address"}),
        ("districts.csv", {"postcode": "SE1 1AA"}),
        ("districts.csv", {"avg_rating": 4.5}),
        ("districts.csv", {"most_common_ethnicity": "Private restaurant name"}),
        ("district_cuisine_supply.csv", {"total_reviews": 42}),
        ("districts.csv", {"latitude": 51.5, "longitude": -0.1}),
        ("model.json", {"R0": 3.5}),
    ],
)
def test_private_bundle_fields_raise_before_any_file_is_written(built, tmp_path, filename, fields):
    bundle = {
        name: read_csv(built / name) if name.endswith(".csv") else read_json(built / name)
        for name in build.BUNDLE_FILES
    }
    bundle = copy.deepcopy(bundle)
    target = bundle[filename][0] if filename.endswith(".csv") else bundle[filename]
    target.update(fields)
    out = tmp_path / "public"

    with pytest.raises(ValueError, match="private|unexpected|not allowed"):
        build.publish_bundle(out, bundle)

    assert not out.exists()


@pytest.mark.parametrize(
    "filename, fields",
    [
        ("districts.csv", {"restaurant_name": "A private name"}),
        ("districts.csv", {"avg_rating": 4.5}),
        ("district_cuisine_supply.csv", {"total_reviews": 42}),
        ("districts.csv", {"latitude": 51.5, "longitude": -0.1}),
        ("model.json", {"R0": 3.5}),
    ],
)
def test_build_rejects_private_fields_before_writing(tmp_path, monkeypatch, filename, fields):
    data = copy_sources(tmp_path / "data")
    out = tmp_path / "public"
    original = build.publish_bundle

    def leaking_publisher(destination, bundle):
        target = bundle[filename][0] if filename.endswith(".csv") else bundle[filename]
        target.update(fields)
        original(destination, bundle)

    monkeypatch.setattr(build, "publish_bundle", leaking_publisher)
    with pytest.raises(ValueError, match="private|unexpected"):
        build.build(data, out, group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1)

    assert not out.exists()
    assert not (data / "restaurants.csv").exists()
    assert not (data / "label_policy.json").exists()
    assert not (data / "run").exists()


def test_sample_run_folder_contains_only_metrics_and_no_policy_values(data):
    run = data / "run"
    assert sorted(path.name for path in run.iterdir()) == ["metrics.json"]
    metrics = read_json(run / "metrics.json")
    assert not {"R0", "D0", "n_ref", "avg_rating", "total_reviews"} & set(metrics)


def test_committed_sample_run_metrics_pass_privacy_guard():
    build.validate_run_metrics(read_json(data_dir(choice="sample") / "run" / "metrics.json"))


def test_generated_cv_metrics_pass_privacy_guard(data):
    build.validate_run_metrics(read_json(data / "run" / "metrics.json"))


@pytest.mark.parametrize(
    "path, value",
    [
        (("cv", "folds", 0, "restaurant_name"), "Private name"),
        (("cv", "folds", 0, "rows", "fit"), "Private name"),
        (("cv", "folds", 0, "mae"), float("nan")),
        (("cv", "folds", 0, "early_stop_loss"), ["Private name"]),
        (("cv", "summary", "mae", "R0"), 0.5),
        (("cv", "summary", "rmse", "std"), float("inf")),
        (("shipped", "train_loss"), ["Private name"]),
        (("shipped", "epochs"), True),
    ],
)
def test_nested_cv_metrics_reject_private_or_invalid_values(data, path, value):
    metrics = read_json(data / "run" / "metrics.json")
    target = metrics
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value

    with pytest.raises(ValueError):
        build.validate_run_metrics(metrics)


def test_build_cli_help_lists_current_options(capsys):
    with pytest.raises(SystemExit) as result:
        build.main(["--help"])
    assert result.value.code == 0
    help_text = capsys.readouterr().out
    assert "--max-epochs" in help_text and "--run" in help_text


def test_build_writes_metrics_to_the_requested_run_folder(tmp_path):
    data = copy_sources(tmp_path / "data")
    run = tmp_path / "results"

    metrics = build.build(
        data, tmp_path / "bundle", run=run,
        group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1,
    )

    assert read_json(run / "metrics.json") == metrics
    build.validate_run_metrics(metrics)
    assert not (data / "run").exists()


@pytest.mark.parametrize(
    "field, value",
    [
        ("R0", 3.5),
        ("tag_frequencies", {"Italian": 10}),
        ("inputs_left_out", {"population": "Private restaurant name"}),
    ],
)
def test_private_metadata_cannot_enter_run_metrics(data, field, value):
    metrics = read_json(data / "run" / "metrics.json")
    metrics[field] = value
    with pytest.raises(ValueError, match="private|unexpected"):
        build.validate_run_metrics(metrics)


@pytest.mark.parametrize("value", [
    {"census_age": "EC3M", "census_ethnicity": 0, "census_sex": 0},
    {"census_age": -1, "census_ethnicity": 0, "census_sex": 0},
    {"census_age": 0.5, "census_ethnicity": 0, "census_sex": 0},
    {"census_age": True, "census_ethnicity": 0, "census_sex": 0},
    {"census_age": 0, "census_ethnicity": 0},
    {"census_age": 0, "census_ethnicity": 0, "census_sex": 0, "SE1": 0},
    3,
])
def test_census_coverage_in_run_metrics_must_be_counts_per_source(data, value):
    metrics = read_json(data / "run" / "metrics.json")
    metrics["districts_without_census"] = value
    with pytest.raises(ValueError, match="private|unexpected|counts"):
        build.validate_run_metrics(metrics)


def test_registered_district_extension_can_be_published(built, tmp_path, monkeypatch):
    bundle = {
        name: read_csv(built / name) if name.endswith(".csv") else read_json(built / name)
        for name in build.BUNDLE_FILES
    }
    for row in bundle["districts.csv"]:
        row["employment_index"] = "0.5"
    monkeypatch.setattr(build, "DISTRICT_PUBLIC_EXTENSIONS", ("employment_index",))

    out = tmp_path / "public"
    build.publish_bundle(out, bundle)

    assert read_csv(out / "districts.csv")[0]["employment_index"] == "0.5"


def test_run_metrics_count_label_exclusions_and_fixes_by_reason(data):
    metrics = read_json(data / "run" / "metrics.json")

    # Sample rows 0-4 carry one of each problem; see tripadvisor_england.csv.
    # Row 4 (zero reviews, zero counts) is excluded, so its counts are no fix.
    # Rows 200-205 are the seeded cleaning defects: a far point, an exact and a
    # near duplicate (the other row of each pair is kept) and three spellings of a chain.
    assert metrics["source_rows"] == 206
    assert metrics["excluded"] == {
        "far_from_postcode": 1, "duplicate_listing": 2,
        "rating_missing": 1, "rating_out_of_range": 1, "n_total_zero": 1,
    }
    assert metrics["label_fixes"] == {"counts_partly_missing": 1, "total_below_counts": 1}
    assert metrics["restaurants"] == 203
    assert 0 < metrics["labelled"] < 200  # quality-gated training rows


def test_cleaning_the_sample_equals_removing_the_losing_row_of_each_seeded_defect_by_hand(data):
    rows = read_csv(data / "tripadvisor_england.csv")
    postcodes = read_csv(data / "onspd_england.csv")
    by_link = {}
    for i, r in enumerate(rows):
        by_link.setdefault(r["restaurant_link"], []).append(i)
    (original, exact), = (v for v in by_link.values() if len(v) == 2)
    near, = by_link["synthetic-near-0030"]
    far, = by_link["synthetic-far-0001"]
    total = lambda i: float(rows[i]["total_reviews_count"])
    assert total(exact) > total(original) and total(near) < total(by_link["synthetic-0030"][0])

    cleaned, _ = build.restaurant_table(rows, postcodes, build.load_mapping())
    by_hand, _ = build.restaurant_table(
        [r for i, r in enumerate(rows) if i not in (original, near, far)], postcodes, build.load_mapping()
    )

    assert cleaned == by_hand
    assert sum(r["is_chain"] for r in cleaned) == sum(r["is_chain"] for r in by_hand)
    variants = [r for r in rows if r["restaurant_link"].startswith("synthetic-variant-")]
    assert len(variants) == 3 and len({r["restaurant_name"] for r in variants}) == 3


def test_run_metrics_report_cv_against_the_baseline_and_ship_the_median_best_epoch(data):
    metrics = read_json(data / "run" / "metrics.json")
    folds = metrics["cv"]["folds"]

    assert len(folds) == 5
    assert sum(f["rows"]["test"] for f in folds) == metrics["labelled"]
    for f in folds:
        assert set(f["rows"]) == {"fit", "early_stop", "test"}
        losses = f["early_stop_loss"]
        assert len(f["train_loss"]) == len(losses)
        # Early stopping: best is the lowest early-stop loss; training ran on
        # for the patience, or to the epoch limit.
        assert f["best_epoch"] == 1 + int(np.argmin(losses))
        assert len(losses) == min(f["best_epoch"] + build.PATIENCE, build.MAX_EPOCHS)
        for name in ("mae", "rmse", "baseline_mae", "baseline_rmse"):
            assert 0 < f[name] < 1, name
        assert f["mae"] <= f["rmse"] and f["baseline_mae"] <= f["baseline_rmse"]
    summary = metrics["cv"]["summary"]
    assert set(summary) == {"mae", "rmse", "baseline_mae", "baseline_rmse"}
    assert all(set(s) == {"mean", "std"} for s in summary.values())

    shipped = metrics["shipped"]
    # Exactly the median for the odd fold count the spec sets.
    assert shipped["epochs"] == statistics.median(f["best_epoch"] for f in folds)
    assert len(shipped["train_loss"]) == shipped["epochs"]


def test_cli_parses_its_options():
    with pytest.raises(SystemExit) as exit_:
        build.main(["--help"])
    assert exit_.value.code == 0


def test_two_builds_with_seed_0_write_identical_models(data, built, tmp_path):
    again = copy_sources(tmp_path / "data")
    build.build(again, again / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD)

    assert (again / "bundle" / "model.json").read_bytes() == (built / "model.json").read_bytes()
    assert read_json(again / "run" / "metrics.json") == read_json(data / "run" / "metrics.json")


def test_label_policy_stays_private_and_out_of_the_bundle(data, built):
    policy = read_json(data / "label_policy.json")

    assert set(policy) >= {"R0", "D0", "n_ref"}
    for path in built.iterdir():
        text = path.read_text(encoding="utf-8")
        for name in ("R0", "D0", "n_ref"):
            assert name not in text, path.name


def test_districts_cover_every_sample_district_with_supply_that_adds_up(data, built):
    onspd = read_csv(data / "onspd_england.csv")
    districts = read_csv(built / "districts.csv")
    supply = read_csv(built / "district_cuisine_supply.csv")
    restaurants = read_csv(data / "restaurants.csv")

    scored = {d["postcode_district"] for d in districts}
    assert scored < {r["district"] for r in onspd}
    per_district = Counter()
    for row in supply:
        per_district[row["postcode_district"]] += int(row["restaurants"])
    for d in districts:
        assert per_district[d["postcode_district"]] == int(d["total_restaurants"])
    assert sum(int(d["total_restaurants"]) for d in districts) == sum(
        r["postcode_district"] in scored for r in restaurants
    )


def test_district_with_no_restaurants_is_not_scored(built):
    districts = {d["postcode_district"]: d for d in read_csv(built / "districts.csv")}
    supplied = {r["postcode_district"] for r in read_csv(built / "district_cuisine_supply.csv")}
    reference = read_json(built / "reference_scores.json")

    # EC3M has ONSPD postcodes in the sample but no restaurant near them.
    assert "EC3M" not in districts
    assert "EC3M" not in supplied
    assert all("EC3M" not in case["scores"] for case in reference["cases"])


def test_estimated_and_unsupported_districts_never_train_and_metrics_say_why(tmp_path):
    data = copy_sources(tmp_path / "data")
    voa = read_csv(data / "voa_england.csv")
    with (data / "voa_england.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, voa[0].keys())
        writer.writeheader()
        writer.writerows(r for r in voa if r["district"] != "SE17")
    sources_before = {name: (data / name).read_bytes() for name in SOURCES}

    metrics = build.build(
        data, tmp_path / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD, folds=3, max_epochs=1
    )

    published = {d["postcode_district"]: d for d in read_csv(tmp_path / "bundle" / "districts.csv")}
    assert set(published) == {"EC3R", "SE1", "SE11", "SE17", "WC2R"}
    assert published["SE17"]["commercial_rent_index"] == "468.2"  # median of SE1, SE11 and WC2R
    restaurants = read_csv(data / "restaurants.csv")
    # Reliable districts only: SE17 is estimated; EC4R and SE1P are tiny-population commercial cores.
    training = [r for r in restaurants if r["review_success_label"] and r["postcode_district"] in {"EC3R", "SE1", "SE11", "WC2R"}]
    assert metrics["labelled"] == len(training) == 110
    assert sum(f["rows"]["test"] for f in metrics["cv"]["folds"]) == 110
    assert metrics["quality"] == {
        "districts": 13, "scored": 5, "training": 4, "training_with_labels": 4, "estimated": 1,
        "cross_border": 0, "estimated_reasons": {"commercial_rent_index_missing": 1},
        "excluded": {"no_restaurants": 6, "commercial_core_without_footfall": 2},
    }
    assert {name: (data / name).read_bytes() for name in SOURCES} == sources_before
    # The private audit keeps SE17's source value; only the bundle carries the estimate.
    audit = {d["postcode_district"]: d for d in read_csv(data / "district_context.csv")}
    assert len(audit) == 13
    assert (audit["SE17"]["commercial_rent_index"], audit["SE17"]["context_status"],
            audit["SE17"]["context_reasons"]) == ("", "estimated", "commercial_rent_index_missing")
    assert (audit["SE1"]["context_status"], audit["SE1"]["context_reasons"]) == ("recorded", "")
    assert (audit["EC4R"]["context_status"], audit["EC4R"]["context_reasons"]) == (
        "excluded", "commercial_core_without_footfall")
    assert "context_status" not in read_csv(tmp_path / "bundle" / "districts.csv")[0]


def test_training_refuses_to_fill_missing_context_with_a_median(tmp_path, monkeypatch):
    data = copy_sources(tmp_path / "data")
    p004 = read_csv(data / "p004_england.csv")
    with (data / "p004_england.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, p004[0].keys())
        writer.writeheader()
        writer.writerows(r for r in p004 if r["district"] != "SE17")
    # A faulty quality stage that calls every district with restaurants reliable.
    def everything_reliable(rows):
        kept = [r for r in rows if r["total_restaurants"]]
        reliable = {r["postcode_district"] for r in kept}
        return kept, reliable, Counter(no_restaurants=len(rows) - len(kept)), Counter(), {}
    monkeypatch.setattr(build.quality, "prepare_districts", everything_reliable)

    with pytest.raises(ValueError, match="median"):
        build.build(data, tmp_path / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1)
    assert not (tmp_path / "bundle").exists()


def test_quality_metrics_reject_estimate_reasons_that_do_not_add_up(data):
    metrics = read_json(data / "run" / "metrics.json")
    metrics["quality"]["estimated_reasons"] = {"commercial_rent_index_missing": 1}  # but no district is estimated
    with pytest.raises(ValueError, match="estimate"):
        build.validate_run_metrics(metrics)
    metrics["quality"]["estimated_reasons"] = {"private_restaurant_name": 0}
    with pytest.raises(ValueError, match="unexpected"):
        build.validate_run_metrics(metrics)


def test_build_uses_demographics_and_separate_deduplicated_tourism_counts(tmp_path):
    data = copy_sources(tmp_path / "data")
    ages = read_csv(data / "census_age_england.csv")
    for row in ages:
        row["average_age"] = "42" if row["district"] == "SE1" else ""
    with (data / "census_age_england.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, ["district", "average_age"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(ages)
    sexes = read_csv(data / "census_sex_england.csv")
    for row in sexes:
        row["sex_female_share"] = row["sex_male_share"] = "0.5" if row["district"] == "SE1" else ""
    with (data / "census_sex_england.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, list(sexes[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(sexes)
    anchor = next(p for p in read_csv(data / "onspd_england.csv") if p["district"] == "SE1" and not p["doterm"])
    (data / "tourism_england.csv").write_text(
        "osm_type,osm_id,tourism,lat,lon\n"
        f"node,1,hotel,{anchor['lat']},{anchor['long']}\n"
        f"node,1,hotel,{anchor['lat']},{anchor['long']}\n"
        f"way,1,attraction,{anchor['lat']},{anchor['long']}\n", encoding="utf-8",
    )
    out = tmp_path / "bundle"
    build.build(data, out, group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1, apply_quality=False)
    districts = {row["postcode_district"]: row for row in read_csv(out / "districts.csv")}
    assert districts["SE1"]["average_age"] == "42.0"
    assert districts["SE1"]["hotels_count"] == "1"
    assert districts["SE1"]["attractions_count"] == "1"
    assert districts["SE11"]["hotels_count"] == "0"
    assert districts["SE11"]["average_age"] == ""
    assert districts["SE1"]["most_common_sex"] == "tie"
    assert districts["SE11"]["most_common_sex"] == "unknown"
    assert districts["SE1"]["most_common_ethnicity"] in {"asian", "black", "mixed", "white", "other", "tie"}
    model = read_json(out / "model.json")
    assert set(context.INPUTS) <= set(model["features"]["district_inputs"])
    assert model["transforms"]["average_age"] == {
        "kind": "numeric", "log1p": False, "median": 42, "mean": 42, "std": 1,
    }
    assert model["transforms"]["attractions_count"]["log1p"] is True
    assert model["transforms"]["sex_female_share"]["log1p"] is False


def test_run_metrics_count_districts_each_census_source_leaves_blank(tmp_path):
    data = copy_sources(tmp_path / "data")
    ages = read_csv(data / "census_age_england.csv")
    ages[0]["average_age"] = ""  # one district blank in place
    ethnicities = read_csv(data / "census_ethnicity_england.csv")[2:]  # two districts with no row
    for name, rows in (("census_age", ages), ("census_ethnicity", ethnicities)):
        path = data / f"{name}_england.csv"
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, list(rows[0]), lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    run = tmp_path / "run"
    build.build(data, tmp_path / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD, run=run, max_epochs=1)
    assert read_json(run / "metrics.json")["districts_without_census"] == {
        "census_age": 1, "census_ethnicity": 2, "census_sex": 0,
    }


@pytest.mark.parametrize("name, field, value", [
    ("census_age", "average_age", "NaN"),
    ("census_sex", "sex_female_share", "1.5"),
    ("census_ethnicity", "ethnicity_white_share", "0"),
])
def test_build_rejects_invalid_demographic_sources_before_writing(tmp_path, name, field, value):
    data = copy_sources(tmp_path / "data")
    path = data / f"{name}_england.csv"
    rows = read_csv(path)
    rows[0][field] = value
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    out = tmp_path / "bundle"
    with pytest.raises(ValueError, match="invalid|shares"):
        build.build(data, out, group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1)
    assert not out.exists()


def test_training_rows_leave_their_own_restaurant_out_of_both_supply_counts():
    districts = [{
        "postcode_district": "AB1", "population": 1000, "deprivation_index": 12.5,
        "commercial_rent_index": "", "total_restaurants": 3,
    }]
    supply = Counter({("AB1", "Thai"): 2, ("AB1", "Italian"): 1})
    rows = [{"postcode_district": "AB1", "cuisine_group": g} for g in ("Thai", "Italian")]

    raw = build.training_district_inputs(rows, districts, supply)

    thai, italian = (dict(zip(build.DISTRICT_INPUTS, row)) for row in raw)
    assert (thai["total_restaurants"], thai["same_cuisine_supply"]) == (2, 1)
    assert (italian["total_restaurants"], italian["same_cuisine_supply"]) == (2, 0)
    assert thai["population"] == 1000 and thai["deprivation_index"] == 12.5
    assert np.isnan(thai["commercial_rent_index"])  # missing stays missing until the median fill


def test_cv_folds_never_share_a_district_across_fit_early_stop_and_test(data):
    # The rows CV runs on: those with a label.
    codes = [r["postcode_district"] for r in read_csv(data / "restaurants.csv") if r["review_success_label"]]

    splits = nn1.group_splits(codes, folds=5)

    assert len(splits) == 5
    tested = []
    for split in splits:
        sides = [{codes[i] for i in split[side]} for side in ("fit", "early_stop", "test")]
        assert all(sides), "every side holds at least one district"
        fit, early_stop, test = sides
        assert not (fit & early_stop or fit & test or early_stop & test)
        assert sorted(np.concatenate(list(split.values()))) == list(range(len(codes)))
        tested += list(split["test"])
    assert sorted(tested) == list(range(len(codes)))  # each row is tested exactly once


def test_transforms_fitted_on_a_subset_use_only_that_subset():
    vocab = {"cuisines": [{"cuisine": "Thai", "cuisine_group": "Thai"}], "traits": []}
    nan = np.nan
    # Columns follow DISTRICT_INPUTS: population, deprivation, rent, total, same-cuisine.
    train = np.array([
        [9, 10, nan, 0, 0],
        [nan, 20, nan, 0, 0],
        [99, 30, nan, 0, 0],
    ])
    held_out = np.array([[999999, 1000, 5, 7, 7]])
    train = np.pad(train, ((0, 0), (0, 10)), constant_values=nan)
    held_out = np.pad(held_out.astype(float), ((0, 0), (0, 10)), constant_values=nan)

    t = build.model_spec(vocab, train)["transforms"]

    assert build.model_spec(vocab, np.vstack([train, held_out]))["transforms"]["deprivation_index"]["mean"] == 265
    assert t["population"]["median"] == 54  # of 9 and 99; the missing row is skipped
    assert t["population"]["log1p"] is True and t["deprivation_index"]["log1p"] is False
    assert (t["deprivation_index"]["mean"], t["deprivation_index"]["median"]) == (20, 20)
    assert t["deprivation_index"]["std"] == pytest.approx(8.164966)  # population std of 10, 20, 30
    # No training row has rent, so the held-out row's 5 must not leak into the fill.
    assert t["commercial_rent_index"] == {"kind": "numeric", "log1p": True, "mean": 0, "std": 1, "median": 0}
    assert t["average_age"] == {"kind": "numeric", "log1p": False, "mean": 0, "std": 1, "median": 0}


def test_a_column_constant_on_the_training_rows_keeps_held_out_values_finite():
    vocab = {"cuisines": [{"cuisine": "Thai", "cuisine_group": "Thai"}], "traits": []}
    # A fold whose only rented district is SE11 at £400/m²: log1p(400) repeated
    # has a float std of about 1e-15, not 0.
    train = np.array([[1000, 10, 400, 3, 1]] * 170, dtype=float)
    train = np.pad(train, ((0, 0), (0, 10)), constant_values=np.nan)

    model = build.model_spec(vocab, train)

    assert model["transforms"]["commercial_rent_index"]["std"] == 1
    held_out = np.array([[1000, 10, 150, 3, 1, *([np.nan] * 10)]], dtype=float)
    x = build.inputs(model, {"cuisine": "Thai", "cuisine_group": "Thai"}, held_out)
    assert np.abs(x).max() < 10


def test_vocabulary_groups_every_cuisine_and_matches_model_features(built):
    vocabulary = read_json(built / "vocabulary.json")
    model = read_json(built / "model.json")

    cuisines = {c["cuisine"]: c for c in vocabulary["cuisines"]}
    assert {"British", "Italian", "Thai", "Unspecified"} <= set(cuisines)
    assert all(c["cuisine_group"] and c["label"] for c in cuisines.values())
    assert model["version"] == vocabulary["version"]

    traits = {t["name"]: t for t in vocabulary["traits"]}
    assert model["features"]["restaurant_inputs"] == ["cuisine_group", "cuisine", *traits]
    assert set(model["transforms"]["cuisine"]["values"]) <= set(cuisines)
    assert model["transforms"]["cuisine"]["values"]
    assert model["transforms"]["cuisine_group"]["values"] == sorted(
        {c["cuisine_group"] for c in cuisines.values()}
    )
    for name, trait in traits.items():
        transform = model["transforms"][name]
        assert trait["default"] in trait["values"]
        if trait["kind"] == "single_choice":
            assert transform["values"] == trait["values"]
        else:
            assert trait["kind"] == "on_off" and trait["values"] == [False, True]
            assert transform["kind"] == "flag"


def test_rare_fine_cuisine_falls_back_to_its_group_input():
    vocab = {"cuisines": [
        {"cuisine": "Eritrean", "cuisine_group": "African"},
        {"cuisine": "Ethiopian", "cuisine_group": "African"},
    ], "traits": []}
    rows = [{"cuisine": "Eritrean"}] * 3 + [{"cuisine": "Ethiopian"}]
    supported = build._supported_cuisines(rows, threshold=3)
    model = build.model_spec(vocab, np.zeros((2, len(build.DISTRICT_INPUTS))), fine_cuisines=supported)
    district = np.zeros((1, len(build.DISTRICT_INPUTS)))

    assert model["transforms"]["cuisine"]["values"] == ["Eritrean"]
    frequent = build.inputs(model, {"cuisine": "Eritrean", "cuisine_group": "African"}, district)
    rare = build.inputs(model, {"cuisine": "Ethiopian", "cuisine_group": "African"}, district)
    assert not np.array_equal(frequent, rare)
    assert rare[0, 0] == 1 and rare[0, 1] == 0  # broad group on; unsupported fine cuisine off


@pytest.fixture(scope="module")
def two_european(tmp_path_factory):
    """A bundle built from the sample with its plain European rows split into French and Spanish."""
    data = copy_sources(tmp_path_factory.mktemp("two_european"))
    source = data / "tripadvisor_england.csv"
    rows = read_csv(source)
    european = [row for row in rows if row["cuisines"] == "European"]
    for i, row in enumerate(european):
        row["cuisines"] = "French" if i % 2 else "Spanish"
    with source.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    out = data / "bundle"
    build.build(data, out, group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=5)
    return out


def test_two_supported_cuisines_in_one_group_get_distinct_inputs_and_labels(two_european):
    model = read_json(two_european / "model.json")
    vocabulary = read_json(two_european / "vocabulary.json")
    cuisines = {c["cuisine"]: c for c in vocabulary["cuisines"]}
    defaults = {t["name"]: t["default"] for t in vocabulary["traits"]}

    assert {"French", "Spanish"} <= set(model["transforms"]["cuisine"]["values"])
    assert cuisines["French"]["cuisine_group"] == cuisines["Spanish"]["cuisine_group"] == "European"
    # Each now has its own input, so its label must not claim it is scored as the group.
    assert cuisines["French"]["label"] == "French"
    assert cuisines["Greek"]["label"] == "Greek (scored as European)"  # no sample rows: falls back
    district = np.zeros((1, len(build.DISTRICT_INPUTS)))
    french, spanish, greek = (
        build.inputs(model, {**defaults, "cuisine": c, "cuisine_group": "European"}, district)[0]
        for c in ("French", "Spanish", "Greek")
    )
    groups = len(model["transforms"]["cuisine_group"]["values"])
    assert np.array_equal(french[:groups], spanish[:groups])  # same broad group input
    assert not np.array_equal(french, spanish)
    assert not greek[groups:groups + len(model["transforms"]["cuisine"]["values"])].any()


@pytest.mark.parametrize("cuisine, label", [
    ("French", "French (scored as European)"),  # supported: has its own input
    ("Greek", "Greek"),  # fallback: scored as its group
])
def test_publish_rejects_a_label_that_misstates_fine_cuisine_support(two_european, tmp_path, cuisine, label):
    bundle = {
        name: read_csv(two_european / name) if name.endswith(".csv") else read_json(two_european / name)
        for name in build.BUNDLE_FILES
    }
    next(c for c in bundle["vocabulary.json"]["cuisines"] if c["cuisine"] == cuisine)["label"] = label
    with pytest.raises(ValueError, match="label"):
        build.publish_bundle(tmp_path / "public", bundle)


def test_reference_scores_cover_a_supported_and_a_fallback_fine_cuisine(two_european):
    model = read_json(two_european / "model.json")
    cuisines = {c["cuisine"]: c["cuisine_group"] for c in read_json(two_european / "vocabulary.json")["cuisines"]}
    fine = set(model["transforms"]["cuisine"]["values"])
    profiles = [case["profile"]["cuisine"] for case in read_json(two_european / "reference_scores.json")["cases"]]

    assert any(c in fine and c != cuisines[c] for c in profiles)  # its fine input differs from its group's
    assert any(c not in fine for c in profiles)


def test_build_derives_chain_flags_and_preserves_unknown_traits(tmp_path):
    copy_sources(tmp_path)
    source = tmp_path / "tripadvisor_england.csv"
    rows = read_csv(source)
    for i, row in enumerate(rows):
        row["restaurant_name"] = "Three branches" if i < 3 else "Two branches" if i < 5 else f"Independent {i}"
    rows[0].update(price_level="", vegetarian_friendly="Y", vegan_options="N", gluten_free="")
    with source.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    out = tmp_path / "bundle"
    build.build(tmp_path, out, group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1)
    restaurants = read_csv(tmp_path / "restaurants.csv")
    assert [r["is_chain"] for r in restaurants[:6]] == ["1", "1", "1", "0", "0", "0"]
    assert restaurants[0]["price_band"] == ""
    assert restaurants[0]["vegetarian_friendly"] == "1"
    assert restaurants[0]["vegan_options"] == "0"
    assert restaurants[0]["gluten_free"] == ""
    model = read_json(out / "model.json")
    assert model["transforms"]["price_band"] == {"kind": "one_hot", "values": ["$", "$$", "$$$", "unknown"]}
    traits = {t["name"]: t for t in read_json(out / "vocabulary.json")["traits"]}
    assert traits["price_band"]["default"] == "unknown"
    assert all(traits[name]["default"] is False for name in ("chain", *build.DIET_FLAGS))
    assert read_json(out / "reference_scores.json")["cases"][0]["profile"]["price_band"] == "unknown"
    for name in build.BUNDLE_FILES:
        assert "Three branches" not in (out / name).read_text(encoding="utf-8")
def test_model_declares_log1p_mean_std_and_median_for_each_district_input(built):
    model = read_json(built / "model.json")

    for name in model["features"]["district_inputs"]:
        t = model["transforms"][name]
        assert t["kind"] == "numeric" and set(t) == {"kind", "log1p", "mean", "std", "median"}, name
        assert t["log1p"] == (name in {"population", "commercial_rent_index", "total_restaurants",
                                       "same_cuisine_supply", "attractions_count", "hotels_count"}), name


def test_model_layers_are_inputs_64_32_1(built):
    model = read_json(built / "model.json")
    width = sum(
        len(model["transforms"][name].get("values", [None]))
        for name in model["features"]["restaurant_inputs"]
    ) + len(model["features"]["district_inputs"])

    shapes = [
        (len(layer["weights"]), len(layer["weights"][0]), len(layer["biases"]))
        for layer in model["layers"]
    ]
    assert shapes == [(64, width, 64), (32, 64, 32), (1, 32, 1)]
    assert model["activations"] == ["relu", "relu", "sigmoid"]


def test_rent_index_is_median_rateable_value_per_square_metre(tmp_path):
    data = copy_sources(tmp_path / "data")
    voa = [
        ("SE1", "NIA", "100.00", "10000"),
        ("SE1", "GIA", "100.00", "30000"),  # SE1 has NIA areas, so GIA is not used
        ("SE1", "NIA", "50.00", "10000"),
        ("SE1", "NIA", "", "90000"),  # no area: not a valid denominator
        ("SE1", "NIA", "0.00", "90000"),
        ("SE1", "OTH", "3.00", "90000"),  # a count of units, not square metres
        ("SE11", "GIA", "100.00", "40000"),  # no NIA area: GIA stands in
        ("EC4R", "NIA", "", "5000"),
    ]
    with (data / "voa_england.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(sources.VOA_COLUMNS)
        for i, (district, unit, area, rv) in enumerate(voa):
            writer.writerow([f"synthetic-{i}", f"{district} 1AA", district, "234",
                             "Restaurant And Premises", unit, area, rv])

    metrics = build.build(data, data / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1, apply_quality=False)

    rent = {d["postcode_district"]: d["commercial_rent_index"]
            for d in read_csv(data / "bundle" / "districts.csv")}
    assert rent["SE1"] == "150.0"  # median of 100 and 200 £/m², NIA only
    assert rent["SE11"] == "400.0"
    assert rent["EC4R"] == ""
    model = read_json(data / "bundle" / "model.json")
    assert "commercial_rent_index" in model["features"]["district_inputs"]
    assert model["transforms"]["commercial_rent_index"]["log1p"] is True
    assert "commercial_rent_index" not in metrics.get("inputs_left_out", {})


def _disc_postcodes(district, lat, lon, km, n, doterm=""):
    """``n`` postcodes spread evenly over a disc of radius ``km`` (a sunflower pattern)."""
    km_per_degree = build.EARTH_RADIUS_KM * np.pi / 180
    r = km * np.sqrt((np.arange(n) + 0.5) / n)
    t = np.arange(n) * np.pi * (3 - np.sqrt(5))
    return [
        {"district": district, "doterm": doterm, "imd25ind": "",
         "lat": str(lat + y / km_per_degree), "long": str(lon + x / (km_per_degree * np.cos(np.radians(lat))))}
        for x, y in zip(r * np.cos(t), r * np.sin(t))
    ]


def test_district_radius_covers_its_postcodes_with_a_minimum_for_tiny_districts():
    lat, lon = 51.5, -0.1
    # DISC: 200 postcodes filling a 1 km disc. ONE: a single-postcode district (a PO box).
    postcodes = _disc_postcodes("DISC1", lat, lon, 1.0, 200) + [
        {"district": "ONE1", "doterm": "", "imd25ind": "", "lat": str(lat), "long": str(lon)}
    ]

    rows = {d["postcode_district"]: d for d in build.district_table(postcodes, [], [], [], {}, [])}

    assert rows["DISC1"]["radius_km"] == pytest.approx(1.0, abs=0.02)
    assert rows["ONE1"]["radius_km"] == build.MIN_RADIUS_KM


def test_district_circle_ignores_terminated_postcodes_and_a_far_cluster_of_live_ones():
    # IG8 in the August 2026 ONSPD: half its postcodes are terminated, many at old locations
    # up to 6 km away, and ~4% of live ones are business postcodes stacked on one point 5.4 km off.
    lat, lon = 51.6, 0.04
    postcodes = (
        _disc_postcodes("IG8", lat, lon, 1.0, 200)
        + _disc_postcodes("IG8", lat + 0.045, lon, 0.2, 200, doterm="201603")
        + _disc_postcodes("IG8", lat + 0.045, lon + 0.02, 0.01, 8)
    )

    row = build.district_table(postcodes, [], [], [], {}, [])[0]

    assert (row["centroid_lat"], row["centroid_lon"]) == pytest.approx((lat, lon), abs=0.003)
    assert row["radius_km"] == pytest.approx(1.0, abs=0.1)


def test_a_district_with_only_terminated_postcodes_keeps_a_circle():
    row = build.district_table(_disc_postcodes("EC3P", 51.5, -0.08, 0.5, 50, doterm="200001"), [], [], [], {}, [])[0]

    assert row["radius_km"] == pytest.approx(0.5, abs=0.02)


def test_every_sample_district_has_a_positive_radius_and_the_build_names_the_tiny_ones(tmp_path, capsys):
    data = copy_sources(tmp_path / "data")
    build.build(data, data / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD, max_epochs=1)
    radii = {d["postcode_district"]: float(d["radius_km"]) for d in read_csv(data / "bundle" / "districts.csv")}

    assert all(r >= build.MIN_RADIUS_KM for r in radii.values())
    assert radii["SE1"] > build.MIN_RADIUS_KM  # 1,724 sample postcodes: a real spread, not the floor
    # EC3N has a single sample postcode.
    assert "EC3N" in capsys.readouterr().out.split("km radius")[1].splitlines()[0]


def test_the_bundle_outlines_districts_and_draws_the_rest_as_small_circles(built):
    outlines = read_json(built / "district_outlines.json")
    rows = {d["postcode_district"]: d for d in read_csv(built / "districts.csv")}

    assert outlines["version"] == build.BUNDLE_VERSION
    assert set(outlines["districts"]) <= set(rows)
    assert "SE1" in outlines["districts"]  # many residential postcodes
    assert "EC3M" not in outlines["districts"]  # no live residential postcode
    for code, row in rows.items():
        if code not in outlines["districts"]:
            assert float(row["radius_km"]) == build.MIN_RADIUS_KM, code


@pytest.mark.parametrize("change, message", [
    (lambda o: o["districts"].update(ZZ9=o["districts"]["SE1"]), "district"),
    (lambda o: o["districts"]["SE1"][0].append(len(o["arcs"])), "arc reference"),
    (lambda o: o["arcs"][0].append(1.5), "arc"),
    (lambda o: o.update(note="private"), "unexpected"),
])
def test_publish_rejects_an_invalid_outline_file(built, tmp_path, change, message):
    bundle = {
        name: read_csv(built / name) if name.endswith(".csv") else read_json(built / name)
        for name in build.BUNDLE_FILES
    }
    change(bundle["district_outlines.json"])

    with pytest.raises(ValueError, match=message):
        build.publish_bundle(tmp_path / "public", bundle)


@pytest.mark.parametrize("radius", ["", "0", "-1"])
def test_publish_rejects_a_missing_or_non_positive_radius(built, tmp_path, radius):
    bundle = {
        name: read_csv(built / name) if name.endswith(".csv") else read_json(built / name)
        for name in build.BUNDLE_FILES
    }
    bundle["districts.csv"][0]["radius_km"] = radius
    with pytest.raises(ValueError, match="radius_km"):
        build.publish_bundle(tmp_path / "public", bundle)


def test_unmapped_cuisine_tag_fails_and_names_the_tag(tmp_path):
    copy_sources(tmp_path)
    rows = read_csv(tmp_path / "tripadvisor_england.csv")
    rows[0]["cuisines"] = "Martian, Cafe"
    with (tmp_path / "tripadvisor_england.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    with pytest.raises(ValueError, match="Martian"):
        build.build(tmp_path, tmp_path / "out", group_threshold=build.SAMPLE_GROUP_THRESHOLD)


def test_mapping_covers_every_tag_in_the_committed_sample():
    rows = read_csv(data_dir(choice="sample") / "tripadvisor_england.csv")
    tags = {t.strip() for r in rows for t in r["cuisines"].split(",") if t.strip()}
    assert sorted(tags - set(build.load_mapping())) == []


def test_mapping_rejects_a_tag_listed_twice(tmp_path):
    path = tmp_path / "cuisine_mapping.csv"
    path.write_text(
        "tag,kind,cuisine,parent,venue_type\n"
        "Mediterranean,umbrella,Mediterranean,,\n"
        "Italian,cuisine,Italian,European,\n"
        "Mediterranean,umbrella,Mediterranean,European,\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Mediterranean"):
        build.load_mapping(path)


def encode(model, profile, group, district, supply):
    """The input vector, built only from model.json and the bundle tables."""
    t = model["transforms"]
    values = {**profile, "cuisine_group": group}
    vector = []
    for name in model["features"]["restaurant_inputs"]:
        if t[name]["kind"] == "one_hot":
            vector += [1.0 if values[name] == v else 0.0 for v in t[name]["values"]]
        else:
            vector.append(1.0 if values[name] else 0.0)
    raw = {
        **district,
        "same_cuisine_supply": supply.get((district["postcode_district"], group), 0),
    }
    for name in model["features"]["district_inputs"]:
        x = float(raw[name]) if raw[name] != "" else t[name]["median"]
        if t[name]["log1p"]:
            x = np.log1p(x)
        vector.append((x - t[name]["mean"]) / t[name]["std"])
    return np.array(vector)


def test_numpy_forward_pass_reproduces_reference_scores(built):
    model = read_json(built / "model.json")
    vocabulary = read_json(built / "vocabulary.json")
    reference = read_json(built / "reference_scores.json")
    districts = read_csv(built / "districts.csv")
    supply = {
        (r["postcode_district"], r["cuisine_group"]): int(r["restaurants"])
        for r in read_csv(built / "district_cuisine_supply.csv")
    }
    group_of = {c["cuisine"]: c["cuisine_group"] for c in vocabulary["cuisines"]}

    assert len(reference["cases"]) >= 3
    for case in reference["cases"]:
        profile = case["profile"]
        assert set(case["scores"]) == {d["postcode_district"] for d in districts}
        for district in districts:
            x = encode(model, profile, group_of[profile["cuisine"]], district, supply)
            for layer, activation in zip(model["layers"], model["activations"]):
                x = np.array(layer["weights"]) @ x + np.array(layer["biases"])
                x = np.maximum(x, 0) if activation == "relu" else 1 / (1 + np.exp(-x))
            expected = case["scores"][district["postcode_district"]]
            assert abs(x[0] - expected) <= reference["tolerance"]


@pytest.mark.parametrize(
    "cuisines, expected",
    [
        ("European, Italian, Pizza", ("Italian", "Restaurant")),  # specific beats an earlier umbrella
        ("European, Mediterranean", ("European", "Restaurant")),  # first umbrella when nothing specific
        ("Healthy, Cafe", ("Unspecified", "Café")),  # no cuisine tag at all
        ("Sushi", ("Japanese", "Restaurant")),  # dish-style tags fold
        ("Dim Sum, Thai", ("Chinese", "Restaurant")),
        ("Thai, Bar, Cafe", ("Thai", "Pub and bar")),  # first venue tag wins
        ("Indian", ("Indian", "Restaurant")),  # venue type defaults to Restaurant
        ("", ("Unspecified", "Restaurant")),
    ],
)
def test_classify_follows_the_cuisine_rules(cuisines, expected):
    assert build.classify(cuisines, build.load_mapping()) == expected


ITALIAN_REGIONS = (
    "Apulian", "Calabrian", "Campania", "Central-Italian", "Emilian", "Lazio", "Ligurian", "Neapolitan",
    "Northern-Italian", "Romagna", "Romana", "Sardinian", "Sicilian", "Southern-Italian", "Tuscan",
)


# Tags found only in the full Tripadvisor file (#77); the sample never carried them.
@pytest.mark.parametrize(
    "tag, expected",
    [
        ("Argentinian", ("Argentinean", "Restaurant")),
        ("Nepalese", ("Nepali", "Restaurant")),
        ("Philippine", ("Filipino", "Restaurant")),
        ("Fast food", ("Unspecified", "Fast food and street food")),
        *((region, ("Italian", "Restaurant")) for region in ITALIAN_REGIONS),
        *((tag, ("Japanese", "Restaurant")) for tag in ("Hokkaido cuisine", "Kyoto cuisine", "Kaiseki", "Kappo")),
        ("Beijing cuisine", ("Chinese", "Restaurant")),
        ("Costa Rican", ("Central American", "Restaurant")),
        ("Guatemalan", ("Central American", "Restaurant")),
        ("Bahamian", ("Caribbean", "Restaurant")),
        ("Puerto Rican", ("Caribbean", "Restaurant")),
        ("Catalan", ("Spanish", "Restaurant")),
        ("Assyrian", ("Assyrian", "Restaurant")),
        ("Beer restaurants", ("Unspecified", "Pub and bar")),
        ("Dining bars", ("Unspecified", "Pub and bar")),
        ("Fruit parlours", ("Unspecified", "Café")),
        ("Japanese sweets parlour", ("Unspecified", "Café")),
        ("Medicinal foods", ("Unspecified", "Restaurant")),
    ],
)
def test_classify_maps_full_data_tags(tag, expected):
    assert build.classify(tag, build.load_mapping()) == expected


def test_mapping_rows_are_well_formed_with_one_parent_per_cuisine():
    mapping = build.load_mapping()
    roots = {m["cuisine"] for m in mapping.values() if m["kind"] in ("cuisine", "umbrella") and not m["parent"]}
    parents = {}
    for m in mapping.values():
        if m["kind"] in ("cuisine", "umbrella"):
            # A dish-style tag must agree with its cuisine's own row (Pizza and Italian).
            assert parents.setdefault(m["cuisine"], m["parent"]) == m["parent"], m
        assert m["kind"] in ("cuisine", "umbrella", "venue", "set_aside"), m
        if m["kind"] == "venue":
            assert m["venue_type"] in build.VENUE_TYPES, m
        if m["parent"]:
            assert m["parent"] in roots, m


def test_cuisine_groups_fold_small_cuisines_into_their_parent_then_other():
    mapping = {
        tag: {"tag": tag, "kind": kind, "cuisine": tag, "parent": parent, "venue_type": ""}
        for tag, kind, parent in [
            ("European", "umbrella", ""),
            ("Italian", "cuisine", "European"),
            ("Basque", "cuisine", "European"),
            ("African", "cuisine", ""),
            ("Eritrean", "cuisine", "African"),
            ("Ethiopian", "cuisine", "African"),
            ("Middle Eastern", "cuisine", ""),
            ("Kurdish", "cuisine", "Middle Eastern"),
            ("Seafood", "cuisine", ""),
        ]
    }
    labelled = {"Italian": 3, "European": 3, "Basque": 1, "Eritrean": 1, "Ethiopian": 2, "Kurdish": 2, "Seafood": 1}
    restaurants = [{"cuisine": c, "review_success_label": 0.5} for c, n in labelled.items() for _ in range(n)]
    restaurants += [{"cuisine": "Kurdish", "review_success_label": ""}] * 5  # not label-eligible

    groups = build.cuisine_groups(restaurants, mapping, threshold=3)

    assert groups == {
        "Italian": "Italian",  # clears the threshold alone
        "European": "European",
        "Basque": "European",  # parent is a group in its own right
        "Eritrean": "African",  # small siblings together clear it
        "Ethiopian": "African",
        "African": "African",
        "Kurdish": "Other",  # parent with its children still under it
        "Middle Eastern": "Other",
        "Seafood": "Other",  # no parent
        "Unspecified": "Other",
    }


def test_fold_inputs_count_cuisine_support_and_fit_transforms_on_training_rows_only():
    mapping = {c: {"cuisine": c, "kind": "cuisine", "parent": p} for c, p in [
        ("Asian", ""), ("Thai", "Asian"), ("Japanese", "Asian"),
    ]}
    def restaurant(code, cuisine):
        return {"postcode_district": code, "cuisine": cuisine, "review_success_label": 0.5,
                "venue_type": "Restaurant", "price_band": "", "is_chain": 0, **{f: "" for f in build.DIET_FLAGS}}
    def district(code, population):
        return {"postcode_district": code, "population": population, "deprivation_index": 10,
                "commercial_rent_index": 100, "total_restaurants": 9,
                **{name: 1 for name in context.INPUTS}}
    train = [restaurant("AB1", "Thai")] * 3 + [restaurant("AB1", "Asian")] + [restaurant("AB1", "Japanese")] * 6
    held_out = [restaurant("CD2", "Thai")] * 9
    districts = [district("AB1", 1000), district("CD2", 999999)]

    model, groups, supply = build.fit_inputs(
        train, train + held_out, districts, [], mapping, group_threshold=4, fine_threshold=4
    )
    leaky, *_ = build.fit_inputs(
        train + held_out, train + held_out, districts, [], mapping, group_threshold=4, fine_threshold=4
    )

    # Three training Thai rows are below both thresholds; nine held-out ones must not lift them.
    assert groups["Thai"] == "Asian" and groups["Japanese"] == "Japanese"
    assert model["transforms"]["cuisine"]["values"] == ["Japanese"]
    assert model["transforms"]["population"]["median"] == 1000
    assert "Thai" in leaky["transforms"]["cuisine"]["values"]  # what leaking would look like
    # Supply is an observed input, so held-out districts still count, under the fold's groups.
    assert supply[("CD2", "Asian")] == 9
    x = build.fold_design(model, groups, supply, held_out[:1], districts)
    group_values = model["transforms"]["cuisine_group"]["values"]
    assert x[0, group_values.index("Asian")] == 1


def test_restaurant_table_keeps_raw_cuisines_and_the_sample_keeps_several_groups(data, built):
    # The far point and the losing row of each duplicate pair are cleaned out; see the sample metrics test.
    rows = read_csv(data / "tripadvisor_england.csv")
    first = {}
    for i, r in enumerate(rows):
        first.setdefault(r["restaurant_link"], i)
    cleaned_out = {first["synthetic-0020"], first["synthetic-near-0030"], first["synthetic-far-0001"]}
    source = Counter(r["cuisines"] for i, r in enumerate(rows) if i not in cleaned_out)
    restaurants = Counter(r["cuisines"] for r in read_csv(data / "restaurants.csv"))
    groups = read_json(built / "model.json")["transforms"]["cuisine_group"]["values"]

    assert restaurants == source
    assert len(groups) >= 5


# --- cleaning stages in restaurant_table (issue #150) ---------------------------------

POSTCODES = [{"district": "SE1", "lat": "51.5", "long": "-0.1", "doterm": ""}]
HERE = (51.5, -0.1)


def source_row(link, name, total, point=HERE, **overrides):
    """A valid source row; ``total`` tells survivors apart in the output."""
    row = {
        "restaurant_link": link, "restaurant_name": name,
        "latitude": str(point[0]), "longitude": str(point[1]),
        "cuisines": "Italian", "avg_rating": "4.0", "total_reviews_count": f"{total}.0",
        "reviews_count_in_default_language": "5.0",
        **{c: "1.0" for c in ("excellent", "very_good", "average", "poor", "terrible")},
        "price_level": "", "vegetarian_friendly": "", "vegan_options": "", "gluten_free": "",
    }
    return {**row, **overrides}


def metres_north(metres):
    return (HERE[0] + metres / 111_195, HERE[1])


def clean(rows):
    restaurants, metrics = build.restaurant_table(rows, POSTCODES, build.load_mapping())
    return [r["total_reviews"] for r in restaurants], metrics


def test_a_row_farther_than_the_limit_from_any_postcode_is_excluded_as_far_from_postcode():
    far = (HERE[0] + 2 * build.FAR_FROM_POSTCODE_KM / 111.195, HERE[1])
    near = (HERE[0] + build.FAR_FROM_POSTCODE_KM / 2 / 111.195, HERE[1])

    totals, metrics = clean([source_row("a", "A", 10), source_row("b", "B", 20, far), source_row("c", "C", 30, near)])

    assert totals == [10, 30]
    assert metrics["excluded"] == {"far_from_postcode": 1}


def test_exact_duplicate_links_keep_the_row_with_the_most_reviews_and_ties_keep_the_first():
    rows = [
        source_row("x", "One", 10), source_row("x", "One", 40), source_row("x", "One", 25),
        source_row("y", "Two", 10, metres_north(1000)), source_row("y", "Two", 10, metres_north(1000)),
    ]

    totals, metrics = clean(rows)

    assert totals == [40, 10]
    assert metrics["excluded"] == {"duplicate_listing": 3}


def test_near_duplicates_share_a_normalised_name_within_the_limit_and_keep_the_most_reviews():
    rows = [
        source_row("a", "Joe's Café", 10),
        source_row("b", "JOES CAFE", 30, metres_north(build.NEAR_DUPLICATE_M / 2)),
        source_row("c", "Joe's Café", 20, metres_north(build.NEAR_DUPLICATE_M * 4)),  # too far: a different branch
        source_row("d", "Other name", 50),  # same place, different name
    ]

    totals, metrics = clean(rows)

    assert totals == [30, 20, 50]
    assert metrics["excluded"] == {"duplicate_listing": 1}


def test_near_duplicates_chain_together_and_never_merge_review_counts():
    step = build.NEAR_DUPLICATE_M * 0.8
    rows = [source_row(str(i), "Chained", 10 * (i + 1), metres_north(step * i)) for i in range(3)]

    totals, metrics = clean(rows)

    assert totals == [30]
    assert metrics["excluded"] == {"duplicate_listing": 2}


def test_location_is_checked_before_duplicates_and_duplicates_before_chains():
    far = (HERE[0] + 2 * build.FAR_FROM_POSTCODE_KM / 111.195, HERE[1])
    rows = [
        source_row("a", "Far", 10, far), source_row("a", "Far", 20, far),  # counted once, as far
        *[source_row("d", "Triple", 10 * n) for n in (1, 2, 3)],  # one place, not a chain of three
        *[source_row(f"c{i}", name, 10, metres_north(4 * build.NEAR_DUPLICATE_M * (i + 1)))
          for i, name in enumerate(("Nando's", "Nandos", "NANDO’S"))],
    ]

    restaurants, metrics = build.restaurant_table(rows, POSTCODES, build.load_mapping())

    assert metrics["excluded"] == {"far_from_postcode": 2, "duplicate_listing": 2}
    assert [(r["total_reviews"], r["is_chain"]) for r in restaurants] == [(30, 0), (10, 1), (10, 1), (10, 1)]


def test_branch_suffix_removal_is_off_by_default_and_switchable(monkeypatch):
    names = ("Pret", "Pret - Soho", "Pret (Kings Cross)")
    rows = [source_row(str(i), n, 10, metres_north(4 * build.NEAR_DUPLICATE_M * i)) for i, n in enumerate(names)]

    assert build.DROP_BRANCH_SUFFIX is False
    assert [r["is_chain"] for r in build.restaurant_table(rows, POSTCODES, build.load_mapping())[0]] == [0, 0, 0]
    monkeypatch.setattr(build, "DROP_BRANCH_SUFFIX", True)
    assert [r["is_chain"] for r in build.restaurant_table(rows, POSTCODES, build.load_mapping())[0]] == [1, 1, 1]


def test_run_metrics_accept_the_cleaning_exclusion_reasons(data):
    metrics = read_json(data / "run" / "metrics.json")
    metrics["excluded"] = {"far_from_postcode": 1, "duplicate_listing": 2}
    build.validate_run_metrics(metrics)
    metrics["excluded"] = {"duplicate_restaurant": 2}
    with pytest.raises(ValueError, match="counts"):
        build.validate_run_metrics(metrics)


def test_run_metrics_flag_label_source_anomalies_for_audit_without_dropping_rows(data):
    rows = read_csv(data / "tripadvisor_england.csv")
    postcodes = read_csv(data / "onspd_england.csv")
    _, before = build.restaurant_table(rows, postcodes, build.load_mapping())
    seeded = copy.deepcopy(rows)
    seeded[10]["avg_rating"] = "4.3"  # an eligible row; Tripadvisor ratings are half stars

    restaurants, after = build.restaurant_table(seeded, postcodes, build.load_mapping())

    flagged = Counter(after["label_anomalies"]) - Counter(before["label_anomalies"])
    assert flagged == {"rating_off_half_step": 1}
    assert after["excluded"] == before["excluded"]  # flagged, not dropped
    assert "4.3" in {r["avg_rating"] for r in restaurants}  # the label still uses the source value
    build.validate_run_metrics(read_json(data / "run" / "metrics.json"))
    metrics = read_json(data / "run" / "metrics.json")
    metrics["label_anomalies"] = {"restaurant_name": 1}
    with pytest.raises(ValueError, match="counts"):
        build.validate_run_metrics(metrics)
