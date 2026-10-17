import csv
import json
import shutil
from collections import Counter

import numpy as np
import pytest

from plotluck import build, data_dir


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
        ("SE1", "GIA", "100.00", "30000"),
        ("SE1", "NIA", "50.00", "10000"),
        ("SE1", "NIA", "", "90000"),  # no area: not a valid denominator
        ("SE1", "NIA", "0.00", "90000"),
        ("SE1", "OTH", "3.00", "90000"),  # a count of units, not square metres
        ("EC4R", "NIA", "", "5000"),
    ]
    with (data / "voa_england.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["uarn", "postcode", "district", "scat_code", "description",
                         "unit", "total_area", "adopted_rv"])
        for i, (district, unit, area, rv) in enumerate(voa):
            writer.writerow([f"synthetic-{i}", f"{district} 1AA", district, "234",
                             "Restaurant And Premises", unit, area, rv])

    metrics = build.build(data, data / "bundle", group_threshold=build.SAMPLE_GROUP_THRESHOLD, epochs=1)

    rent = {d["postcode_district"]: d["commercial_rent_index"]
            for d in read_csv(data / "bundle" / "districts.csv")}
    assert rent["SE1"] == "200.0"  # median of 100, 300 and 200 £/m²
    assert rent["EC4R"] == ""
    model = read_json(data / "bundle" / "model.json")
    assert "commercial_rent_index" in model["features"]["district_inputs"]
    assert model["transforms"]["commercial_rent_index"]["log1p"] is True
    assert "commercial_rent_index" not in metrics.get("inputs_left_out", {})


def test_unmapped_cuisine_tag_fails_and_names_the_tag(tmp_path):
    copy_sources(tmp_path)
    rows = read_csv(tmp_path / "tripadvisor_england.csv")
    rows[0]["cuisines"] = "Eritrean, Cafe"
    with (tmp_path / "tripadvisor_england.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    with pytest.raises(ValueError, match="Eritrean"):
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
