"""Ranking audit on the committed synthetic sample bundle."""

import json

from plotluck.data import data_dir
from plotluck.ranking_audit import audit


def test_audit_detects_when_grouped_cuisines_have_identical_rankings():
    bundle = data_dir(choice="sample")
    model = json.loads((bundle / "model.json").read_text(encoding="utf-8"))
    result = audit(bundle)

    assert result["districts"] > 0
    assert result["cuisines"] >= result["cuisine_groups"]
    assert result["min_district_p10_p90_spread"] >= 0
    if "cuisine" not in model["features"]["restaurant_inputs"]:
        assert result["distinct_cuisine_score_vectors"] == result["cuisine_groups"]
        assert result["median_within_group_score_change"] == 0
