"""Quality rules use only district context, never review labels."""

from zipfile import ZipFile

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
    prepared, reliable, excluded, _ = prepare_districts(rows)
    by_code = {d["postcode_district"]: d for d in prepared}

    assert 100 <= by_code["M1"]["commercial_rent_index"] <= 105
    assert 100 <= by_code["L1"]["commercial_rent_index"] <= 105
    assert by_code["H1"]["commercial_rent_index"] == 900
    assert "M1" not in reliable and "L1" not in reliable and "H1" in reliable
    assert not excluded


def test_invalid_recorded_context_is_estimated_not_treated_as_reliable():
    donors = [district(f"A{i}", i * .01) for i in range(1, 5)]
    bad_age = district("G1", .025)
    bad_age["average_age"] = -3
    bad_shares = district("S1", .035)
    bad_shares["ethnicity_white_share"] = 3.6
    bad_deprivation = district("D1", .045)
    bad_deprivation["deprivation_index"] = 0

    prepared, reliable, excluded, estimated = prepare_districts([*donors, bad_age, bad_shares, bad_deprivation])
    by_code = {d["postcode_district"]: d for d in prepared}

    assert reliable == {"A1", "A2", "A3", "A4"}
    assert by_code["G1"]["average_age"] == 40
    assert by_code["S1"]["ethnicity_white_share"] == .6
    assert by_code["D1"]["deprivation_index"] == 10000
    assert estimated == {"average_age_invalid": 1, "ethnicity_invalid": 1, "deprivation_index_invalid": 1}
    assert not excluded


def test_estimate_reasons_distinguish_missing_from_suspect_low_rent():
    rows = [district(f"A{i}", i * .01, rent=99 + i) for i in range(1, 4)]
    rows += [district("L1", .04, rent=1), district("M1", .05, rent="", population="")]

    _, _, _, estimated = prepare_districts(rows)

    assert estimated == {"commercial_rent_index_low": 1, "commercial_rent_index_missing": 1, "population_missing": 1}


def test_suspect_low_rent_is_not_used_as_an_estimation_donor():
    rows = [district(f"A{i}", i * .01, rent=99 + i) for i in range(1, 4)]
    rows += [district("L1", .04, rent=1), district("M1", .05, rent="")]

    prepared, reliable, excluded, _ = prepare_districts(rows)
    by_code = {row["postcode_district"]: row for row in prepared}

    assert by_code["M1"]["commercial_rent_index"] == 101
    assert "L1" not in reliable and "M1" not in reliable
    assert not excluded


def test_unestimable_district_is_not_published():
    rows = [district("A1", 0), district("X1", 3, rent=""),
            district("L1", 4, rent=1), district("Z1", .02, restaurants=0)]
    prepared, reliable, excluded, _ = prepare_districts(rows)

    assert {d["postcode_district"] for d in prepared} == {"A1"}
    assert reliable == {"A1"}
    assert excluded["no_comparable_peers"] == 2
    assert excluded["no_restaurants"] == 1


def test_commercial_core_with_tiny_resident_population_needs_visitor_evidence():
    rows = [district("C1", 0, population=2, restaurants=60),
            district("R1", .02, population=9000, restaurants=20)]
    prepared, reliable, excluded, _ = prepare_districts(rows)

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
