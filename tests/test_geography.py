"""Offline geography preparation at the catalogue-to-centroid membership seam."""

import copy
import json
from pathlib import Path

import pytest

from plotluck.geography import prepare_catalogue


def test_catalogue_includes_boundary_centroids_and_excludes_overlap_without_centroid():
    # Synthetic square: a postcode district may overlap it, but only its centre counts.
    source = {"type": "FeatureCollection", "features": [{
        "type": "Feature", "properties": {
            "BUA22CD": "E63000001", "BUA22NM": "Example", "LAT": 51, "LONG": 0,
        }, "geometry": {"type": "Polygon", "coordinates": [[
            [-1, 50], [1, 50], [1, 52], [-1, 52], [-1, 50],
        ]]},
    }]}
    districts = [
        {"postcode_district": "IN1", "centroid_lat": "51", "centroid_lon": "0"},
        {"postcode_district": "EDGE1", "centroid_lat": "51", "centroid_lon": "1"},
        {"postcode_district": "OUT1", "centroid_lat": "51", "centroid_lon": "1.1"},
    ]
    catalogue = prepare_catalogue({"settlement": source}, districts)
    assert catalogue["places"][0]["districts"] == ["EDGE1", "IN1"]


def test_catalogue_excludes_hole_centres_includes_hole_edge_and_rejects_projected_coordinates():
    feature = {"type": "Feature", "properties": {
        "LAD25CD": "E09000001", "LAD25NM": "City of London", "LAT": 51, "LONG": 0,
    }, "geometry": {"type": "Polygon", "coordinates": [
        [[-1, 50], [1, 50], [1, 52], [-1, 52], [-1, 50]],
        [[-0.2, 50.8], [0.2, 50.8], [0.2, 51.2], [-0.2, 51.2], [-0.2, 50.8]],
    ]}}
    collection = {"type": "FeatureCollection", "features": [feature]}
    districts = [{"postcode_district": "HOLE", "centroid_lat": "51", "centroid_lon": "0"},
                 {"postcode_district": "EDGE", "centroid_lat": "51", "centroid_lon": "0.2"}]
    catalogue = prepare_catalogue({"local_authority": collection}, districts)
    assert catalogue["places"][0]["districts"] == ["EDGE"]
    projected = copy.deepcopy(collection)
    projected["features"][0]["geometry"]["coordinates"][0][0] = [530000, 180000]
    projected["features"][0]["geometry"]["coordinates"][0][-1] = [530000, 180000]
    with pytest.raises(ValueError, match="WGS84"):
        prepare_catalogue({"local_authority": projected}, districts)


def test_publisher_known_answers_and_typed_london_choices():
    proof = json.loads((Path(__file__).parents[1] / "data/sample/geography-proof.json").read_text(encoding="utf-8"))
    # Same source feature shape, Welsh identifier: excluded from England-only results.
    non_english = copy.deepcopy(proof["sources"]["settlement"]["features"][0])
    non_english["properties"]["BUA22CD"] = "W45000001"
    proof["sources"]["settlement"]["features"].append(non_english)
    catalogue = prepare_catalogue(proof["sources"], proof["districts"])
    places = {place["id"]: place for place in catalogue["places"]}
    assert len(places) == 4
    assert places["E63001295"]["districts"] == ["M1"]
    assert places["E09000007"]["districts"] == ["NW5"]
    assert places["E09000001"]["districts"] == ["EC4V"]
    assert places["E12000007"]["districts"] == ["EC4V", "NW5"]
    assert places["E09000001"]["type"] == "city"
    assert places["E09000007"]["type"] == "borough"
    assert places["E12000007"]["name"] == "Greater London"
    assert all("London" in places[code]["aliases"] for code in ("E09000001", "E12000007"))
    assert places["E63001295"]["lat"] == pytest.approx(53.474738443)
