import csv
import json

import numpy as np

from plotluck import data_dir
from plotluck.bundle import build_bundle


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def test_build_writes_complete_bundle_for_every_sample_district(tmp_path, monkeypatch):
    monkeypatch.setenv("PLOTLUCK_DATA", "sample")
    output = tmp_path / "bundle"

    build_bundle(output, epochs=2)

    assert {p.name for p in output.iterdir()} == {
        "districts.csv", "district_cuisine_supply.csv", "vocabulary.json",
        "model.json", "reference.json",
    }
    districts = read_csv(output / "districts.csv")
    expected = {r["district"] for r in read_csv(data_dir() / "onspd_england.csv")}
    assert {r["postcode_district"] for r in districts} == expected
    supply = read_csv(output / "district_cuisine_supply.csv")
    for district in districts:
        assert sum(int(r["restaurants"]) for r in supply
                   if r["postcode_district"] == district["postcode_district"]) == int(
                       district["total_restaurants"])
    assert sum(int(r["total_restaurants"]) for r in districts) == 200
    assert (tmp_path / "bundle-run" / "restaurants.csv").is_file()
    run = json.loads((tmp_path / "bundle-run" / "metrics.json").read_text())
    assert len(run["loss"]) == 2
    assert run["stage"] == "tracer"


def test_exported_contract_reproduces_torch_reference_scores(tmp_path, monkeypatch):
    monkeypatch.setenv("PLOTLUCK_DATA", "sample")
    output = build_bundle(tmp_path / "bundle", epochs=2)
    model = json.loads((output / "model.json").read_text())
    vocabulary = json.loads((output / "vocabulary.json").read_text())
    reference = json.loads((output / "reference.json").read_text())
    districts = {d["postcode_district"]: d for d in read_csv(output / "districts.csv")}
    supply = {(r["postcode_district"], r["cuisine_group"]): int(r["restaurants"])
              for r in read_csv(output / "district_cuisine_supply.csv")}
    groups = {c["cuisine"]: c["cuisine_group"] for c in vocabulary["cuisines"]}
    features = model["features"]
    assert set(features["restaurant_inputs"]) == {
        "cuisine_group", *(t["name"] for t in vocabulary["traits"])}
    assert set(groups.values()) == set(model["transforms"]["categorical_vocabs"]["cuisine_group"])
    dimension = sum(len(model["transforms"]["categorical_vocabs"].get(name, [None]))
                    for name in features["restaurant_inputs"] + features["district_inputs"])
    assert [np.shape(layer["weights"]) for layer in model["layers"]] == [
        (64, dimension), (32, 64), (1, 32)]
    assert [len(layer["biases"]) for layer in model["layers"]] == [64, 32, 1]
    assert model["activations"] == ["relu", "relu", "sigmoid"]
    assert reference["tolerance"] == 1e-6

    # Independent consumer: do not call the Python encoder or training network.
    for case in reference["profiles"]:
        group = groups[case["profile"]["cuisine"]]
        for expected in case["scores"]:
            code = expected["postcode_district"]
            values = {**case["profile"], **districts[code], "cuisine_group": group,
                      "same_cuisine_supply": supply.get((code, group), 0)}
            vector = []
            for name in features["restaurant_inputs"] + features["district_inputs"]:
                categories = model["transforms"]["categorical_vocabs"].get(name)
                if categories is not None:
                    vector.extend(np.equal(categories, values[name]).astype(float))
                else:
                    transform = model["transforms"]["numeric"][name]
                    value = values.get(name)
                    number = float(value) if value not in (None, "") else transform["median"]
                    number = np.log1p(number) if transform["log1p"] else number
                    vector.append((number - transform["mean"]) / transform["std"])
            result = np.array(vector)
            for layer, activation in zip(model["layers"], model["activations"]):
                result = np.array(layer["weights"]) @ result + np.array(layer["biases"])
                result = np.maximum(result, 0) if activation == "relu" else 1 / (1 + np.exp(-result))
            assert abs(float(result[0]) - expected["score"]) <= reference["tolerance"]

    second = build_bundle(tmp_path / "repeat", epochs=2)
    assert (output / "model.json").read_bytes() == (second / "model.json").read_bytes()
