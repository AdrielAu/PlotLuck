import csv
import json
import shutil
from collections import Counter

import numpy as np
import pytest

from plotluck import build, data_dir, sources


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


SOURCES = ("tripadvisor_england.csv", "onspd_england.csv", "p004_england.csv", "voa_england.csv")


def copy_sources(dest):
    """A data folder holding only the sample sources, so builds never touch data/sample."""
    dest.mkdir(parents=True, exist_ok=True)
    for name in SOURCES:
        shutil.copyfile(data_dir(choice="sample") / name, dest / name)
    return dest


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
        "districts.csv",
        "model.json",
        "reference_scores.json",
        "vocabulary.json",
    ]
    assert (data / "restaurants.csv").is_file()
    assert read_json(data / "run" / "metrics.json")["restaurants"] == 200


def test_run_metrics_count_label_exclusions_and_fixes_by_reason(data):
    metrics = read_json(data / "run" / "metrics.json")

    # Sample rows 0-4 carry one of each problem; see tripadvisor_england.csv.
    # Row 4 (zero reviews, zero counts) is excluded, so its counts are no fix.
    assert metrics["excluded"] == {"rating_missing": 1, "rating_out_of_range": 1, "n_total_zero": 1}
    assert metrics["label_fixes"] == {"counts_partly_missing": 1, "total_below_counts": 1}
    assert metrics["labelled"] == 197


def test_label_policy_stays_private_and_out_of_the_bundle(data, built):
    policy = read_json(data / "label_policy.json")

    assert set(policy) >= {"R0", "D0", "n_ref"}
    for path in built.iterdir():
        text = path.read_text(encoding="utf-8")
        for name in ("R0", "D0", "n_ref"):
            assert name not in text, path.name
            assert repr(policy[name]) not in text, path.name


def test_districts_cover_every_sample_district_with_supply_that_adds_up(data, built):
    onspd = read_csv(data / "onspd_england.csv")
    districts = read_csv(built / "districts.csv")
    supply = read_csv(built / "district_cuisine_supply.csv")
    restaurants = read_csv(data / "restaurants.csv")

    assert {d["postcode_district"] for d in districts} == {r["district"] for r in onspd}
    per_district = Counter()
    for row in supply:
        per_district[row["postcode_district"]] += int(row["restaurants"])
    for d in districts:
        assert per_district[d["postcode_district"]] == int(d["total_restaurants"])
    assert sum(int(d["total_restaurants"]) for d in districts) == len(restaurants)


def test_vocabulary_groups_every_cuisine_and_matches_model_features(built):
    vocabulary = read_json(built / "vocabulary.json")
    model = read_json(built / "model.json")

    cuisines = {c["cuisine"]: c for c in vocabulary["cuisines"]}
    assert {"British", "Italian", "Thai", "Unspecified"} <= set(cuisines)
    assert all(c["cuisine_group"] and c["label"] for c in cuisines.values())
    assert model["version"] == vocabulary["version"]

    traits = {t["name"]: t for t in vocabulary["traits"]}
    assert model["features"]["restaurant_inputs"] == ["cuisine_group", *traits]
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

    metrics = build.build(data, data / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD, epochs=1)

    rent = {d["postcode_district"]: d["commercial_rent_index"]
            for d in read_csv(data / "bundle" / "districts.csv")}
    assert rent["SE1"] == "150.0"  # median of 100 and 200 £/m², NIA only
    assert rent["SE11"] == "400.0"
    assert rent["EC4R"] == ""
    model = read_json(data / "bundle" / "model.json")
    assert "commercial_rent_index" in model["features"]["district_inputs"]
    assert model["transforms"]["commercial_rent_index"]["log1p"] is True
    assert "commercial_rent_index" not in metrics.get("inputs_left_out", {})


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


def test_restaurant_table_keeps_raw_cuisines_and_the_sample_keeps_several_groups(data, built):
    source = Counter(r["cuisines"] for r in read_csv(data / "tripadvisor_england.csv"))
    restaurants = Counter(r["cuisines"] for r in read_csv(data / "restaurants.csv"))
    groups = read_json(built / "model.json")["transforms"]["cuisine_group"]["values"]

    assert restaurants == source
    assert len(groups) >= 5
