import json

import pytest

from plotluck import audit, build, data_dir

# Two live postcodes about 111 km apart (one degree of latitude), and a terminated one between them.
POSTCODES = [
    {"pcds": "A1 1AA", "district": "A1", "lat": "51.0", "long": "0.0", "doterm": ""},
    {"pcds": "B1 1AA", "district": "B1", "lat": "52.0", "long": "0.0", "doterm": ""},
    {"pcds": "Z9 9ZZ", "district": "Z9", "lat": "51.5", "long": "0.0", "doterm": "202001"},
]
M = 1 / 111195  # one metre in degrees of latitude


def row(link, name, lat, lon=0.0):
    return {"restaurant_link": link, "restaurant_name": name,
            "latitude": "" if lat is None else str(lat), "longitude": "" if lat is None else str(lon)}


def run(rows):
    return audit.audit_rows(rows, POSTCODES)


def test_exact_duplicates_count_links_and_extra_rows():
    rows = [row("l1", "A", 51.0), row("l1", "A", 51.0), row("l1", "A", 51.0), row("l2", "B", 51.0),
            row("l3", "C", 51.0), row("l3", "C", 51.0)]
    assert run(rows)["exact_duplicates"] == {"links_repeated": 2, "extra_rows": 3}
    assert run(rows)["source_rows"] == 6


def test_near_duplicates_need_same_normalised_name_different_link_within_distance():
    rows = [
        row("l1", "Nando's", 51.0),
        row("l2", "Nandos", 51.0 + 30 * M),   # 30 m: spelling variant
        row("l3", "Nandos", 51.0 + 200 * M),  # 200 m from l1
        row("l4", "Other", 51.0 + 10 * M),    # different name
    ]
    near = run(rows)["near_duplicates"]
    assert near["within_25m"] == {"groups": 0, "extra_rows": 0}
    assert near["within_50m"] == {"groups": 1, "extra_rows": 1}
    assert near["within_100m"] == {"groups": 1, "extra_rows": 1}
    assert near["within_250m"] == {"groups": 1, "extra_rows": 2}


def test_exact_duplicates_are_not_counted_again_as_near_duplicates():
    rows = [row("l1", "A", 51.0), row("l1", "A", 51.0)]
    assert run(rows)["near_duplicates"]["within_25m"] == {"groups": 0, "extra_rows": 0}


def test_distance_to_nearest_live_postcode_ignores_terminated_and_skips_unlocated():
    rows = [row("l1", "A", 51.0), row("l2", "B", 51.0 + 600 * M), row("l3", "C", 51.0 + 3000 * M),
            row("l4", "D", 51.0 + 7000 * M), row("l5", "E", None)]
    d = run(rows)["nearest_postcode_km"]
    assert d["located_rows"] == 4
    assert d["beyond_0_5km"] == 3 and d["beyond_1km"] == 2 and d["beyond_2km"] == 2 and d["beyond_5km"] == 1
    assert d["max"] == pytest.approx(7.0, abs=0.01)
    assert d["p50"] == pytest.approx(1.8, abs=0.01)  # halfway between 0.6 and 3.0 km


def test_name_counts_exact_normalised_and_suffix():
    names = ["Nando's", "Nandos", "Nando's", "Pizza - Soho", "Pizza (Bank)", "Pizza", "Solo"]
    rows = [row(f"l{i}", n, 51.0 + i * 1000 * M) for i, n in enumerate(names)]
    n = run(rows)["names"]
    assert n["distinct_exact"] == 6
    assert n["distinct_normalised"] == 5
    assert n["distinct_without_suffix"] == 3
    assert n["chain_rows_exact"] == 0
    assert n["chain_rows_normalised"] == 3
    assert n["chain_rows_without_suffix"] == 6


def test_suffix_merges_are_flagged_when_members_are_far_apart():
    rows = [row("l1", "The Crown - Leeds", 51.0), row("l2", "The Crown (York)", 51.0 + 20000 * M),
            row("l3", "Pret - A", 51.0), row("l4", "Pret - B", 51.0 + 1000 * M)]
    assert run(rows)["names"]["suffix_merge_groups_over_5km"] == 1


def test_output_holds_only_aggregates():
    out = run([row("l1", "A", 51.0)])
    audit.validate_audit(out)
    out["names"]["example"] = "Nando's"
    with pytest.raises(ValueError):
        audit.validate_audit(out)
    out = run([row("l1", "A", 51.0)])
    out["restaurant_link"] = "l1"
    with pytest.raises(ValueError):
        audit.validate_audit(out)


def test_audit_runs_on_sample_and_writes_json(tmp_path):
    out = audit.audit(data_dir(choice="sample"), tmp_path)
    raw = (tmp_path / "audit.json").read_bytes()
    assert json.loads(raw) == out
    assert out["source_rows"] == 206
    assert raw.endswith(b"}\n") and b"\r" not in raw


def test_nearest_postcodes_distances_agree_with_district_rule():
    pts = [(51.2, 0.0), (51.9, 0.0)]
    districts, km = build.nearest_postcodes(POSTCODES, pts)
    assert districts == ["A1", "B1"]
    assert km == pytest.approx([22.24, 11.12], abs=0.05)
