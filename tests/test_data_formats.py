import csv
import json
from plotluck import data_dir

RESTAURANT_COLUMNS = [
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
]

DISTRICT_COLUMNS = [
    "postcode_district",
    "centroid_lat",
    "centroid_lon",
    "total_restaurants",
    "population",
    "deprivation_index",
    "commercial_rent_index",
]


def test_sample_restaurants_format():
    path = data_dir() / "restaurants.csv"
    assert path.is_file(), f"{path} should exist"

    with open(path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == RESTAURANT_COLUMNS
        rows = list(reader)
        assert len(rows) > 0

        for r in rows:
            assert r["postcode_district"]
            assert float(r["avg_rating"]) >= 1.0 and float(r["avg_rating"]) <= 5.0
            label = float(r["review_success_label"])
            assert 0.0 <= label <= 1.0
            assert int(r["total_reviews"]) >= 0


def test_sample_districts_format():
    path = data_dir() / "districts.csv"
    assert path.is_file(), f"{path} should exist"

    with open(path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == DISTRICT_COLUMNS
        rows = list(reader)
        assert len(rows) > 0

        for r in rows:
            assert r["postcode_district"]
            assert -90.0 <= float(r["centroid_lat"]) <= 90.0
            assert -180.0 <= float(r["centroid_lon"]) <= 180.0
            assert int(r["total_restaurants"]) >= 0
            if r["population"]:
                assert int(r["population"]) >= 0


def test_sample_model_json_format():
    path = data_dir() / "model.json"
    assert path.is_file(), f"{path} should exist"

    with open(path, mode="r", encoding="utf-8") as f:
        data = json.load(f)

    assert "version" in data
    assert "features" in data
    assert "restaurant_inputs" in data["features"]
    assert "district_inputs" in data["features"]
    assert "transforms" in data
    assert "layers" in data
    assert "activations" in data
    assert len(data["layers"]) == len(data["activations"])
