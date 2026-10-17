import csv
import io
import json
import zipfile

import pytest

from plotluck import context, sources


def csv_zip(path, member, rows):
    text = io.StringIO()
    writer = csv.DictWriter(text, list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(member, text.getvalue())


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def test_census_extract_allocates_counts_before_computing_means_and_shares(tmp_path):
    raw = tmp_path / "raw"
    csv_zip(raw / "onspd.zip", "Data/ONSPD_AUG_2026_UK.csv", [
        {"pcds": postcode, "ctry26cd": country, "doterm": terminated, "msoa21": area}
        for postcode, area, country, terminated in (
            ("AB1 1AA", "E02000001", "E92000001", ""),
            ("AB2 1AA", "E02000001", "E92000001", ""),
            ("AB1 1AB", "E02000002", "E92000001", ""),
            ("AB2 1AB", "E02000002", "E92000001", "202001"),
            ("CF1 1AA", "W02000001", "W92000004", ""),
        )
    ])
    age_columns = ["Age: Aged under 1 year; measures: Value", *(
        f"Age: Aged {age} {'year' if age == 1 else 'years'}; measures: Value" for age in range(1, 100)
    ), "Age: Aged 100 years and over; measures: Value"]
    age_rows = []
    for area, age, count in (("E02000001", 20, 100), ("E02000002", 60, 300)):
        row = {"geography code": area, **dict.fromkeys(age_columns, 0)}
        row[age_columns[age]] = count
        row["Age: Total; measures: Value"] = count  # aggregate must not be counted again
        age_rows.append(row)
    csv_zip(raw / "census_age.zip", "census2021-ts007-msoa.csv", age_rows)
    csv_zip(raw / "census_ethnicity.zip", "census2021-ts021-msoa.csv", [
        {"geography code": area, **{f"Ethnic group: {label}": count
                                   for label, count in zip(context.ETHNICITY.values(), values)}}
        for area, values in (("E02000001", [60, 0, 0, 40, 0]), ("E02000002", [0, 0, 0, 300, 0]))
    ])
    csv_zip(raw / "census_sex.zip", "census2021-ts008-msoa.csv", [
        {"geography code": area, "Sex: Female; measures: Value": female, "Sex: Male; measures: Value": male}
        for area, female, male in (("E02000001", 60, 40), ("E02000002", 100, 200))
    ])
    for name in context.CENSUS_CODES:
        assert sources.extract(name, tmp_path) == 2
    districts = context.demographic_table(tmp_path)
    assert districts["AB1"]["average_age"] == pytest.approx(54.28571429)
    assert districts["AB2"]["average_age"] == 20
    assert districts["AB1"]["ethnicity_asian_share"] == pytest.approx(0.08571429)
    assert districts["AB2"]["ethnicity_asian_share"] == 0.6
    assert districts["AB1"]["sex_female_share"] == pytest.approx(0.37142857)
    assert set(districts) == {"AB1", "AB2"}


def test_tourism_extract_deduplicates_elements_and_uses_way_centres(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    node = {"type": "node", "id": 1, "lat": 51.5, "lon": -0.1, "tags": {"tourism": "hotel"}}
    way = {"type": "way", "id": 1, "center": {"lat": 51.6, "lon": -0.2},
           "tags": {"tourism": "attraction"}}
    other = {"type": "node", "id": 2, "tags": {"tourism": "information"}}
    (raw / "tourism.json").write_text(json.dumps({"elements": [node, way, node, other]}), encoding="utf-8")
    assert sources.extract("tourism", tmp_path) == 2
    rows = read_csv(tmp_path / "tourism_england.csv")
    assert [(r["osm_type"], r["tourism"], r["lat"]) for r in rows] == [
        ("node", "hotel", "51.5"), ("way", "attraction", "51.6"),
    ]


def test_context_sample_is_deterministic_and_explicitly_synthetic(tmp_path):
    (tmp_path / "onspd_england.csv").write_text(
        "district,lat,long\nAB1,51.5,-0.1\nAB2,51.6,-0.2\n", encoding="utf-8",
    )
    context.write_sample(tmp_path)
    first = (tmp_path / "tourism_england.csv").read_bytes()
    context.write_sample(tmp_path)
    assert first == (tmp_path / "tourism_england.csv").read_bytes()
    assert len(context.demographic_table(tmp_path)) == 2
    provenance = json.loads((tmp_path / "raw" / "context_sample.provenance.json").read_text())
    assert provenance["synthetic"] is True and provenance["seed"] == 101
