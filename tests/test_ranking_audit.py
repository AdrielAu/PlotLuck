"""Ranking audit on the committed synthetic sample bundle."""

import json

import pytest

from plotluck.data import data_dir
from plotluck.ranking_audit import audit, compare


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


def test_compare_reports_stable_rankings_and_absent_districts():
    bundle = data_dir(choice="sample")
    result = compare(bundle, bundle, inspect=["ZZ99"])

    assert result["dropped"] == [] and result["added"] == []
    assert result["min_rank_correlation"] == pytest.approx(1)
    assert result["min_top20_overlap"] == min(20, result["shared_districts"])
    assert result["inspect"]["ZZ99"] == {"live": None, "candidate": None}
