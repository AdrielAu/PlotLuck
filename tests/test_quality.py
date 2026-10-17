"""Quality rules use only district context, never review labels."""

from zipfile import ZipFile

import pytest

from plotluck.quality import cross_border_districts, prepare_districts


def district(code, lon, *, rent=100, population=10000, restaurants=20):
    return {
        "postcode_district": code, "centroid_lat": 51.5, "centroid_lon": lon,
        "radius_km": 1, "total_restaurants": restaurants, "population": population,
        "deprivation_index": 10000, "commercial_rent_index": rent,
        "average_age": 40, "ethnicity_asian_share": .1, "ethnicity_black_share": .1,
        "ethnicity_mixed_share": .1, "ethnicity_white_share": .6,
        "ethnicity_other_share": .1, "sex_female_share": .5, "sex_male_share": .5,
    }


def test_missing_and_suspect_low_rent_use_nearby_comparable_values():
    donors = [district(f"A{i}", i * .01, rent=100 + i) for i in range(1, 6)]
    rows = [*donors, district("M1", .025, rent=""), district("L1", .035, rent=1),
            district("H1", .045, rent=900)]
    prepared, reliable, excluded = prepare_districts(rows)
    by_code = {d["postcode_district"]: d for d in prepared}

    assert 100 <= by_code["M1"]["commercial_rent_index"] <= 105
    assert 100 <= by_code["L1"]["commercial_rent_index"] <= 105
    assert by_code["H1"]["commercial_rent_index"] == 900
    assert "M1" not in reliable and "L1" not in reliable and "H1" in reliable
    assert not excluded


def test_suspect_low_rent_is_not_used_as_an_estimation_donor():
    rows = [district(f"A{i}", i * .01, rent=99 + i) for i in range(1, 4)]
    rows += [district("L1", .04, rent=1), district("M1", .05, rent="")]

    prepared, reliable, excluded = prepare_districts(rows)
    by_code = {row["postcode_district"]: row for row in prepared}

    assert by_code["M1"]["commercial_rent_index"] == 101
    assert "L1" not in reliable and "M1" not in reliable
    assert not excluded


def test_unestimable_district_is_not_published():
    rows = [district("A1", 0), district("X1", 3, rent=""),
            district("L1", 4, rent=1), district("Z1", .02, restaurants=0)]
    prepared, reliable, excluded = prepare_districts(rows)

    assert {d["postcode_district"] for d in prepared} == {"A1"}
    assert reliable == {"A1"}
    assert excluded["no_comparable_peers"] == 2
    assert excluded["no_restaurants"] == 1


def test_invalid_demographic_shares_are_estimated_and_never_used_as_donors():
    donors = [district(f"A{i}", i * .01) for i in range(1, 4)]
    invalid = district("B1", .04)
    invalid["sex_female_share"] = 1.5
    invalid["most_common_sex"] = "female"
    missing = district("M1", .05)
    missing["sex_female_share"] = ""
    missing["most_common_sex"] = "unknown"

    prepared, reliable, excluded = prepare_districts([*donors, invalid, missing])
    by_code = {row["postcode_district"]: row for row in prepared}

    assert by_code["B1"]["sex_female_share"] == .5
    assert by_code["M1"]["sex_female_share"] == .5
    assert by_code["B1"]["most_common_sex"] == "tie"
    assert by_code["M1"]["most_common_sex"] == "tie"
    assert {"B1", "M1"}.isdisjoint(reliable)
    assert not excluded


def test_estimation_checks_valid_peers_beyond_the_nearest_eight():
    near = [district(f"N{i}", i * .001, rent="") for i in range(1, 9)]
    donors = [district(f"A{i}", .02 + i * .001, rent=100) for i in range(3)]
    target = district("M1", 0, rent="")

    prepared, reliable, _ = prepare_districts([target, *near, *donors])
    by_code = {row["postcode_district"]: row for row in prepared}

    assert by_code["M1"]["commercial_rent_index"] == 100
    assert "M1" not in reliable


def test_extreme_recorded_peer_does_not_determine_an_estimate():
    donors = [district(f"A{i}", i * .01, population=10000 + i * 1000) for i in range(1, 4)]
    extreme = district("X1", .005, population=1_000_000_000)
    target = district("M1", 0, population="")

    prepared, _, excluded = prepare_districts([target, extreme, *donors])
    by_code = {row["postcode_district"]: row for row in prepared}

    assert by_code["M1"]["population"] == 12000
    assert by_code["X1"]["population"] == 1_000_000_000
    assert not excluded


def test_commercial_core_with_tiny_resident_population_needs_visitor_evidence():
    rows = [district("C1", 0, population=2, restaurants=60),
            district("R1", .02, population=9000, restaurants=20)]
    prepared, reliable, excluded = prepare_districts(rows)

    assert [row["postcode_district"] for row in prepared] == ["R1"]
    assert reliable == {"R1"}
    assert excluded["commercial_core_without_footfall"] == 1


def test_only_districts_with_active_postcodes_in_two_countries_are_cross_border(tmp_path):
    archive = tmp_path / "onspd.zip"
    with ZipFile(archive, "w") as file:
        file.writestr("Data/ONSPD_OCT_2026_UK.csv", (
            "pcds,doterm,ctry24cd\n"
            "TD5 1AA,,E92000001\nTD5 1AB,,S92000003\n"
            "TD12 1AA,,E92000001\nTD12 1AB,202001,S92000003\n"
            "NE1 1AA,,E92000001\nNE2 1AA,,S92000003\n"
        ))
    assert cross_border_districts(archive) == {"TD5"}


def test_cross_border_check_rejects_missing_country_evidence(tmp_path):
    archive = tmp_path / "onspd.zip"
    with ZipFile(archive, "w") as file:
        file.writestr("Data/ONSPD_OCT_2026_UK.csv", (
            "pcds,doterm,ctry24cd\nTD5 1AA,,E92000001\nTD5 1AB,,\n"
        ))

    with pytest.raises(ValueError, match="country code"):
        cross_border_districts(archive)
