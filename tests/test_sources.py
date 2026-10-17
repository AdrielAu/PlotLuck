import csv
import io
import json
import zipfile

from plotluck import sources


def write_csv_zip(path, member, rows):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(member, buf.getvalue())


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def tripadvisor_row(link, country, **overrides):
    row = {
        "restaurant_link": link,
        "restaurant_name": "Cafe",
        "country": country,
        "city": "London",
        "address": "1 High St, London SE1 0AA England",
        "latitude": "51.5",
        "longitude": "-0.1",
        "cuisines": "Cafe, British",
        "avg_rating": "4.5",
        "total_reviews_count": "347.0",
        "reviews_count_in_default_language": "346.0",
        "excellent": "237.0",
        "very_good": "70.0",
        "average": "23.0",
        "poor": "7.0",
        "terrible": "9.0",
        "features": "Takeout, Seating",
        "price_level": "€€-€€€",
        "special_diets": "Vegan Options",
        "vegetarian_friendly": "Y",
        "vegan_options": "Y",
        "gluten_free": "N",
        "keywords": "eggs benedict",
    }
    row.update(overrides)
    return row


def test_tripadvisor_extract_keeps_england_rows_and_listed_fields(tmp_path):
    write_csv_zip(
        tmp_path / "raw" / "tripadvisor.zip",
        "tripadvisor_european_restaurants.csv",
        [
            tripadvisor_row("g1-d1", "England"),
            tripadvisor_row("g2-d2", "France"),
            tripadvisor_row("g3-d3", "Wales"),
        ],
    )

    count = sources.extract("tripadvisor", tmp_path)

    rows = read_csv(tmp_path / "tripadvisor_england.csv")
    assert count == 1
    assert [r["restaurant_link"] for r in rows] == ["g1-d1"]
    assert rows[0]["excellent"] == "237.0"
    assert rows[0]["price_level"] == "€€-€€€"
    assert rows[0]["vegan_options"] == "Y"
    assert "keywords" not in rows[0]


def onspd_row(pcds, ctry, **overrides):
    row = {
        "pcd7": pcds,
        "pcds": pcds,
        "doterm": "",
        "ctry27cd": ctry,
        "rgn27cd": "E12000007",
        "lat": "51.498709",
        "long": "-0.101747",
        "imd25ind": "4977",
    }
    row.update(overrides)
    return row


def test_onspd_extract_keeps_england_postcodes_with_their_district(tmp_path):
    rows = [
        onspd_row("SE1 0AA", "E92000001"),
        onspd_row("SW1A 1AA", "E92000001", doterm="202001"),
        onspd_row("EH1 1AA", "S92000003"),
    ]
    raw = tmp_path / "raw" / "onspd.zip"
    write_csv_zip(raw, "Data/ONSPD_AUG_2027_UK.csv", rows)
    with zipfile.ZipFile(raw, "a") as zf:  # per-area copies must be ignored
        zf.writestr("Data/multi_csv/ONSPD_AUG_2027_UK_SE.csv", "pcds\nSE1 0AA\n")

    count = sources.extract("onspd", tmp_path)

    out = read_csv(tmp_path / "onspd_england.csv")
    assert count == 2
    assert [(r["pcds"], r["district"]) for r in out] == [
        ("SE1 0AA", "SE1"),
        ("SW1A 1AA", "SW1A"),
    ]
    assert out[1]["doterm"] == "202001"
    assert out[0]["country_code"] == "E92000001"
    assert out[0]["region_code"] == "E12000007"
    assert out[0]["imd25ind"] == "4977"


def test_p004_extract_keeps_districts_with_english_postcodes(tmp_path):
    (tmp_path / "raw").mkdir()
    (tmp_path / "raw" / "p004.csv").write_text(
        "Postcode Districts,Count\nSE1,40000\nCF10,30000\nLD8,5000\n",
        encoding="utf-8",
    )
    # LD8 straddles the border: it has an English postcode, so it stays.
    (tmp_path / "onspd_england.csv").write_text(
        "pcds,district\nSE1 0AA,SE1\nLD8 2AA,LD8\n", encoding="utf-8"
    )

    count = sources.extract("p004", tmp_path)

    out = read_csv(tmp_path / "p004_england.csv")
    assert count == 2
    assert out == [
        {"district": "SE1", "residents": "40000"},
        {"district": "LD8", "residents": "5000"},
    ]


def test_osm_extract_flattens_elements_once_each(tmp_path):
    node = {
        "type": "node",
        "id": 451153,
        "lat": 51.6020306,
        "lon": -0.1935029,
        "tags": {"amenity": "restaurant", "name": "Central", "cuisine": "indian"},
    }
    way = {
        "type": "way",
        "id": 77,
        "center": {"lat": 51.5, "lon": -0.12},
        "tags": {"amenity": "fast_food"},
    }
    (tmp_path / "raw").mkdir()
    (tmp_path / "raw" / "osm.json").write_text(
        json.dumps({"elements": [node, way, node]}), encoding="utf-8"
    )

    count = sources.extract("osm", tmp_path)

    out = read_csv(tmp_path / "osm_england.csv")
    assert count == 2
    assert out == [
        {"osm_type": "node", "osm_id": "451153", "amenity": "restaurant",
         "cuisine": "indian", "name": "Central",
         "lat": "51.6020306", "lon": "-0.1935029"},
        {"osm_type": "way", "osm_id": "77", "amenity": "fast_food",
         "cuisine": "", "name": "",
         "lat": "51.5", "lon": "-0.12"},
    ]


def fake_fetch(body):
    calls = []

    def fetch(url, dest, post=None):
        calls.append((url, post))
        dest.write_bytes(body)

    fetch.calls = calls
    return fetch


def test_pull_saves_raw_file_with_provenance(tmp_path):
    fetch = fake_fetch(b"abc")

    raw = sources.pull("p004", tmp_path, fetch=fetch)

    assert raw == tmp_path / "raw" / "p004.csv"
    assert raw.read_bytes() == b"abc"
    prov = json.loads((tmp_path / "raw" / "p004.provenance.json").read_text())
    assert prov["url"] == fetch.calls[0][0]
    assert prov["sha256"] == (
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
    assert prov["bytes"] == 3
    assert prov["retrieved_at"].startswith("20")
    assert prov["licence"]


def test_pull_osm_merges_tiles_and_records_snapshot(tmp_path):
    tile = {
        "osm3s": {"timestamp_osm_base": "2026-10-17T10:52:28Z"},
        "elements": [{"type": "node", "id": 1, "lat": 51.5, "lon": -0.1,
                      "tags": {"amenity": "restaurant"}}],
    }
    fetch = fake_fetch(json.dumps(tile).encode())

    sources.pull("osm", tmp_path, fetch=fetch)

    merged = json.loads((tmp_path / "raw" / "osm.json").read_text())
    prov = json.loads((tmp_path / "raw" / "osm.provenance.json").read_text())
    assert len(fetch.calls) > 1  # England is pulled in tiles
    assert len(merged["elements"]) == len(fetch.calls)
    assert prov["snapshot"] == "2026-10-17T10:52:28Z"
    assert "(area.a)" in fetch.calls[0][1]


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


LONDON = ("51.5007", "-0.1030")  # Southwark, inside the sample box
MANCHESTER = ("53.4808", "-2.2426")


def test_cut_sample_keeps_one_london_area_across_all_files(tmp_path):
    full, sample = tmp_path / "full", tmp_path / "sample"
    full.mkdir()
    write_csv(full / "onspd_england.csv", [
        {"pcds": "SE1 0AA", "district": "SE1", "lat": LONDON[0], "long": LONDON[1]},
        {"pcds": "M1 1AA", "district": "M1", "lat": MANCHESTER[0], "long": MANCHESTER[1]},
    ])
    write_csv(full / "osm_england.csv", [
        {"osm_id": "1", "lat": LONDON[0], "lon": LONDON[1]},
        {"osm_id": "2", "lat": MANCHESTER[0], "lon": MANCHESTER[1]},
        {"osm_id": "3", "lat": "", "lon": ""},
    ])
    write_csv(full / "p004_england.csv", [
        {"district": "SE1", "residents": "40000"},
        {"district": "M1", "residents": "20000"},
    ])
    (full / "raw").mkdir()
    (full / "raw" / "osm.provenance.json").write_text('{"source": "osm"}')

    counts = sources.cut_sample(full, sample)

    assert {k: v for k, v in counts.items() if k != "tripadvisor"} == {
        "onspd": 1, "osm": 1, "p004": 1
    }
    assert read_csv(sample / "p004_england.csv") == [
        {"district": "SE1", "residents": "40000"}
    ]
    assert [r["osm_id"] for r in read_csv(sample / "osm_england.csv")] == ["1"]
    assert (sample / "raw" / "osm.provenance.json").read_text() == '{"source": "osm"}'


def test_tripadvisor_sample_is_synthetic_with_the_full_schema(tmp_path):
    # ADR 0003: no real Tripadvisor row may reach the committed sample.
    full = tmp_path / "full"
    write_csv_zip(
        full / "raw" / "tripadvisor.zip",
        "tripadvisor_european_restaurants.csv",
        [tripadvisor_row("g1-d1", "England", latitude=LONDON[0], longitude=LONDON[1])],
    )
    sources.extract("tripadvisor", full)
    for name, row in [
        ("onspd", {"pcds": "SE1 0AA", "district": "SE1", "lat": LONDON[0], "long": LONDON[1]}),
        ("osm", {"osm_id": "1", "lat": LONDON[0], "lon": LONDON[1]}),
        ("p004", {"district": "SE1", "residents": "40000"}),
    ]:
        write_csv(full / f"{name}_england.csv", [row])

    counts = sources.cut_sample(full, tmp_path / "a")
    sources.cut_sample(full, tmp_path / "b")

    real = (full / "tripadvisor_england.csv").read_text(encoding="utf-8")
    fake = (tmp_path / "a" / "tripadvisor_england.csv").read_text(encoding="utf-8")
    assert fake.splitlines()[0] == real.splitlines()[0]  # same schema
    assert fake == (tmp_path / "b" / "tripadvisor_england.csv").read_text(encoding="utf-8")
    rows = read_csv(tmp_path / "a" / "tripadvisor_england.csv")
    assert counts["tripadvisor"] == len(rows) > 0
    assert "g1-d1" not in fake and "Cafe" not in {r["restaurant_name"] for r in rows}
    for r in rows:
        cats = ["excellent", "very_good", "average", "poor", "terrible"]
        assert sum(float(r[c]) for c in cats) == float(r["reviews_count_in_default_language"])
        assert float(r["total_reviews_count"]) >= float(r["reviews_count_in_default_language"])
        assert 1 <= float(r["avg_rating"]) <= 5
        assert sources._in_box(r["latitude"], r["longitude"])
