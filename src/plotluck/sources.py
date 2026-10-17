"""Pull the MVP datasets and cut them down to England.

Each source has a raw download under ``<data dir>/raw/`` and an England
extract ``<data dir>/<name>_england.csv`` with a fixed schema. The sample
keeps the same file names and schema.
"""

import argparse
import csv
import hashlib
import io
import json
import random
import re
import shutil
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from plotluck.data import data_dir

USER_AGENT = "plotluck/0.1 (github.com/AdrielAu/PlotLuck)"

# Pinned editions. Bump url and edition together, then re-run pull and extract.
SOURCES = {
    "tripadvisor": {
        "file": "tripadvisor.zip",
        "url": "https://www.kaggle.com/api/v1/datasets/download/"
        "stefanoleone992/tripadvisor-european-restaurants",
        "edition": "Kaggle stefanoleone992/tripadvisor-european-restaurants "
        "version 1 (updated 2021-05-18; scraped early May 2021)",
        "licence": "CC0 1.0 as listed on Kaggle. Scraped from tripadvisor.com, "
        "whose terms restrict reuse of its content.",
        "attribution": "TripAdvisor European restaurants, Stefano Leone (Kaggle)",
    },
    "onspd": {
        "file": "onspd.zip",
        "url": "https://www.arcgis.com/sharing/rest/content/items/"
        "9e5a92a3cfb14dc7ad43d6ea7a7b8c7f/data",
        "edition": "ONS Postcode Directory, August 2026",
        "licence": "Open Government Licence v3.0",
        "attribution": "Contains OS data © Crown copyright and database right "
        "2026. Contains Royal Mail data © Royal Mail copyright and database "
        "right 2026. Source: Office for National Statistics licensed under "
        "the Open Government Licence v.3.0",
    },
    "p004": {
        "file": "p004.csv",
        "url": "https://www.nomisweb.co.uk/output/census/2021/pcdd_p004.csv",
        "edition": "Census 2021 P004, usual residents by postcode district "
        "(census day 2021-03-21)",
        "licence": "Open Government Licence v3.0",
        "attribution": "Source: Office for National Statistics licensed under "
        "the Open Government Licence v.3.0",
    },
    "osm": {
        "file": "osm.json",
        "url": "https://overpass-api.de/api/interpreter",
        "edition": "Live OpenStreetMap via Overpass; see snapshot",
        "licence": "Open Database Licence 1.0",
        "attribution": "© OpenStreetMap contributors",
    },
}

# England in 1-degree tiles: the whole-country query times out on Overpass.
# shortcut: live Overpass cannot be re-pulled at the same snapshot; switch to a
# dated Geofabrik extract if exact reproducibility is needed.
# Only the 34 tiles (south-west corners) holding a live English postcode in
# ONSPD August 2026; the area filter drops their Welsh and Scottish parts.
_OSM_TILE_CORNERS = {
    49: (-7, -6),
    50: (-6, -5, -4, -3, -2, -1, 0),
    51: (-5, -4, -3, -2, -1, 0, 1),
    52: (-4, -3, -2, -1, 0, 1),
    53: (-4, -3, -2, -1, 0),
    54: (-4, -3, -2, -1),
    55: (-4, -3, -2),
}
OSM_TILES = [
    (lat, lon, lat + 1, lon + 1)
    for lat, lons in _OSM_TILE_CORNERS.items()
    for lon in lons
]
OSM_QUERY = (
    '[out:json][timeout:300];area["ISO3166-2"="GB-ENG"]->.a;'
    'nwr["amenity"~"^(restaurant|fast_food)$"]({},{},{},{})(area.a);'
    "out center tags;"
)
OSM_RETRIES = 6

TRIPADVISOR_COLUMNS = (
    "restaurant_link",
    "restaurant_name",
    "address",
    "city",
    "latitude",
    "longitude",
    "cuisines",
    "avg_rating",
    "total_reviews_count",
    "reviews_count_in_default_language",
    "excellent",
    "very_good",
    "average",
    "poor",
    "terrible",
    "features",
    "price_level",
    "special_diets",
    "vegetarian_friendly",
    "vegan_options",
    "gluten_free",
)


def http_fetch(url: str, dest: Path, post: str | None = None) -> None:
    """Stream ``url`` to ``dest``; ``post`` is sent as an Overpass query."""
    body = urllib.parse.urlencode({"data": post}).encode() if post else None
    request = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
    part = dest.with_name(dest.name + ".part")  # never leave a truncated file at dest
    with urllib.request.urlopen(request, timeout=900) as response, part.open("wb") as f:
        shutil.copyfileobj(response, f, 1 << 20)
    part.replace(dest)


def pull(name: str, data: Path, fetch=http_fetch) -> Path:
    """Download one source to ``<data>/raw/`` with a provenance record."""
    source = SOURCES[name]
    raw_dir = Path(data) / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw = raw_dir / source["file"]
    provenance = {
        "source": name,
        "url": source["url"],
        "edition": source["edition"],
        "licence": source["licence"],
        "attribution": source["attribution"],
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if name == "osm":
        provenance.update(_pull_osm(raw, fetch))
    else:
        fetch(source["url"], raw)
    provenance["bytes"] = raw.stat().st_size
    provenance["sha256"] = _sha256(raw)
    (raw_dir / f"{name}.provenance.json").write_text(
        json.dumps(provenance, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",  # LF on every platform
    )
    return raw


def _pull_osm(raw: Path, fetch) -> dict:
    """Query each England tile and merge the elements into one file."""
    # shortcut: holds every element in memory (~100k, fine); stream if it grows.
    elements, snapshots = [], []
    tile_file = raw.with_name("osm_tile.json")
    for i, tile in enumerate(OSM_TILES, 1):
        query = OSM_QUERY.format(*tile)
        for attempt in range(OSM_RETRIES):
            try:
                fetch(SOURCES["osm"]["url"], tile_file, post=query)
                with tile_file.open(encoding="utf-8") as f:
                    result = json.load(f)
                if "remark" in result:  # Overpass reports timeouts in-band
                    raise RuntimeError(result["remark"])
                break
            except (OSError, ValueError, RuntimeError) as err:
                if attempt == OSM_RETRIES - 1:
                    raise RuntimeError(f"Overpass tile {tile} failed") from err
                wait = 10 * 2**attempt  # Overpass asks for exponential backoff
                print(f"tile {tile}: {err}; retrying in {wait}s")
                time.sleep(wait)
        elements += result["elements"]
        print(f"tile {i}/{len(OSM_TILES)}: {len(result['elements'])} elements")
        snapshots.append(result["osm3s"]["timestamp_osm_base"])
    tile_file.unlink()
    raw.write_text(json.dumps({"elements": elements}), encoding="utf-8")
    # The oldest tile bounds the snapshot; tiles are minutes apart.
    return {"snapshot": min(snapshots), "query": OSM_QUERY, "tiles": len(OSM_TILES)}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def extract(name: str, data: Path) -> int:
    """Write ``<data>/<name>_england.csv`` from the raw pull; return its row count."""
    rows = _EXTRACTORS[name](Path(data))
    return _write_csv(Path(data) / f"{name}_england.csv", rows)


def _tripadvisor_rows(data: Path):
    with zipfile.ZipFile(data / "raw" / "tripadvisor.zip") as zf:
        (member,) = zf.namelist()
        with zf.open(member) as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8", newline=""))
            yield TRIPADVISOR_COLUMNS
            for row in reader:
                if row["country"] == "England":
                    yield [row[c] for c in TRIPADVISOR_COLUMNS]


ENGLAND_CODE = "E92000001"
ONSPD_COLUMNS = (
    "pcds",
    "district",
    "lat",
    "long",
    "country_code",
    "region_code",
    "doterm",
    "imd25ind",
)
# Whole-UK file only; Data/multi_csv/ repeats it split by postcode area.
_ONSPD_MEMBER = re.compile(r"Data/ONSPD_[A-Z]{3}_\d{4}_UK\.csv")


def _edition_column(fieldnames, prefix: str) -> str:
    """Find ``ctry26cd``-style columns whose year changes with each edition."""
    pattern = re.compile(rf"{prefix}\d\dcd")
    (match,) = [f for f in fieldnames if pattern.fullmatch(f)]
    return match


def _onspd_rows(data: Path):
    with zipfile.ZipFile(data / "raw" / "onspd.zip") as zf:
        (member,) = [n for n in zf.namelist() if _ONSPD_MEMBER.fullmatch(n)]
        with zf.open(member) as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
            ctry = _edition_column(reader.fieldnames, "ctry")
            rgn = _edition_column(reader.fieldnames, "rgn")
            yield ONSPD_COLUMNS
            for row in reader:
                if row[ctry] == ENGLAND_CODE:
                    pcds = row["pcds"]
                    yield [
                        pcds,
                        pcds.split(" ")[0],
                        row["lat"],
                        row["long"],
                        row[ctry],
                        row[rgn],
                        row["doterm"],
                        row["imd25ind"],
                    ]


def _p004_rows(data: Path):
    """Census residents for districts with at least one English postcode.

    P004 covers England and Wales. Cross-border districts stay, and their
    count includes Welsh residents.
    """
    with (data / "onspd_england.csv").open(encoding="utf-8", newline="") as f:
        english = {row["district"] for row in csv.DictReader(f)}
    with (data / "raw" / "p004.csv").open(encoding="utf-8-sig", newline="") as f:
        yield ("district", "residents")
        for row in csv.DictReader(f):
            if row["Postcode Districts"] in english:
                yield [row["Postcode Districts"], row["Count"]]


def _osm_rows(data: Path):
    """One row per OSM element; ways and relations use their centre point."""
    with (data / "raw" / "osm.json").open(encoding="utf-8") as f:
        elements = json.load(f)["elements"]
    seen = set()
    yield ("osm_type", "osm_id", "amenity", "cuisine", "name", "lat", "lon")
    for el in elements:
        key = (el["type"], el["id"])
        if key in seen:  # tiles overlap on their edges
            continue
        seen.add(key)
        point = el.get("center", el)
        tags = el["tags"]
        yield [
            el["type"],
            el["id"],
            tags["amenity"],
            tags.get("cuisine", ""),
            tags.get("name", ""),
            point["lat"],
            point["lon"],
        ]


_EXTRACTORS = {
    "tripadvisor": _tripadvisor_rows,
    "osm": _osm_rows,
    "onspd": _onspd_rows,
    "p004": _p004_rows,
}


# Sample: every row inside one central London box (south, west, north, east),
# so the files still join on district and location. No randomness.
SAMPLE_BBOX = (51.49, -0.12, 51.51, -0.08)
_COORDS = {
    "onspd": ("lat", "long"),
    "osm": ("lat", "lon"),
}


def cut_sample(full: Path, sample: Path) -> dict[str, int]:
    """Cut the committed sample from the England extracts; return row counts.

    The TripAdvisor sample is synthetic (ADR 0003): no real row is read.
    """
    full, sample = Path(full), Path(sample)
    (sample / "raw").mkdir(parents=True, exist_ok=True)
    counts = {}
    for name, (lat, lon) in _COORDS.items():
        counts[name] = _write_csv(
            sample / f"{name}_england.csv",
            _filter_csv(full / f"{name}_england.csv", lambda r: _in_box(r[lat], r[lon])),
        )
    with (sample / "onspd_england.csv").open(encoding="utf-8", newline="") as f:
        postcodes = list(csv.DictReader(f))
    if not postcodes:
        raise ValueError("Sample ONSPD has no postcode districts")
    districts = {row["district"] for row in postcodes}
    anchors = {}
    for row in postcodes:
        anchors.setdefault(row["district"], (row["lat"], row["long"]))
    counts["tripadvisor"] = _write_csv(
        sample / "tripadvisor_england.csv", _synthetic_tripadvisor_rows(anchors)
    )
    counts["p004"] = _write_csv(
        sample / "p004_england.csv",
        _filter_csv(full / "p004_england.csv", lambda r: r["district"] in districts),
    )
    for prov in (full / "raw").glob("*.provenance.json"):
        shutil.copyfile(prov, sample / "raw" / prov.name)
    return counts


SYNTHETIC_SEED = 43
SYNTHETIC_ROWS = 200
_SAMPLE_CUISINES = (
    "European, Italian, Pizza",  # a specific tag beats an earlier umbrella
    "Pizza, Cafe",  # dish-style cuisine plus venue type
    "European",  # umbrella only
    "Cafe",  # venue only; cuisine is Unspecified
    "Pub",  # another venue-only row
    "Healthy, Indian",  # set-aside tag does not decide cuisine
    "Thai, Bar, Cafe",  # first venue tag wins
    "British, Fast Food",
    "Chinese, Dim Sum",
    "Turkish, Mediterranean",
)
_FEATURES = ("Takeout", "Seating", "Outdoor Seating", "Wheelchair Accessible", "Reservations")
_PRICE_LEVELS = ("€", "€€-€€€", "€€€€")


def _synthetic_tripadvisor_rows(anchors):
    """Made-up rows in the TripAdvisor extract's schema, inside the sample box.

    Values mimic the real formats (counts like ``347.0``, ``€`` price levels,
    ``Y``/``N`` flags); the category counts sum to the default-language count.
    Public postcode points anchor the locations, not source restaurant rows.
    A few rows deliberately contain missing or invalid review fields.
    """
    rng = random.Random(SYNTHETIC_SEED)
    points = [anchors[district] for district in sorted(anchors)]
    yield TRIPADVISOR_COLUMNS
    for i in range(1, SYNTHETIC_ROWS + 1):
        cats = [rng.randint(0, n) for n in (300, 150, 60, 25, 25)]
        default = sum(cats)
        total = default + rng.choice((0, 0, rng.randint(1, 50)))  # other languages
        stars = sum(s * c for s, c in zip((5, 4, 3, 2, 1), cats)) / max(default, 1)
        diets = {d: rng.choice("YN") for d in ("Vegetarian Friendly", "Vegan Options", "Gluten Free Options")}
        latitude, longitude = points[(i - 1) % len(points)]
        row = {
            "restaurant_link": f"synthetic-{i:04d}",
            "restaurant_name": (
                "Synthetic chain" if 8 <= i <= 11 else f"Synthetic restaurant {i}"
            ),
            "address": "Synthetic address, London",
            "city": "London",
            "latitude": latitude,
            "longitude": longitude,
            "cuisines": _SAMPLE_CUISINES[(i - 1) % len(_SAMPLE_CUISINES)],
            "avg_rating": f"{max(1.0, round(stars * 2) / 2):.1f}",
            "total_reviews_count": f"{total}.0",
            "reviews_count_in_default_language": f"{default}.0",
            **{c: f"{n}.0" for c, n in zip(("excellent", "very_good", "average", "poor", "terrible"), cats)},
            "features": ", ".join(rng.sample(_FEATURES, rng.randint(0, 3))),
            "price_level": rng.choice(_PRICE_LEVELS),
            "special_diets": ", ".join(d for d, flag in diets.items() if flag == "Y"),
            "vegetarian_friendly": diets["Vegetarian Friendly"],
            "vegan_options": diets["Vegan Options"],
            "gluten_free": diets["Gluten Free Options"],
        }
        if i == 1:
            row["avg_rating"] = ""
        elif i == 2:
            row["avg_rating"] = "5.5"
        elif i == 3:
            row["excellent"] = ""
        elif i == 4:
            row["total_reviews_count"] = f"{default - 1}.0"
        elif i == 5:
            row["total_reviews_count"] = "0.0"
            row["reviews_count_in_default_language"] = "0.0"
            for category in ("excellent", "very_good", "average", "poor", "terrible"):
                row[category] = "0.0"
        elif i == 6:
            for flag in ("vegetarian_friendly", "vegan_options", "gluten_free"):
                row[flag] = ""
            row["special_diets"] = ""
        elif i == 7:
            row["price_level"] = ""
        yield [row[c] for c in TRIPADVISOR_COLUMNS]


def _in_box(lat: str, lon: str) -> bool:
    south, west, north, east = SAMPLE_BBOX
    try:
        return south <= float(lat) <= north and west <= float(lon) <= east
    except ValueError:  # missing coordinates
        return False


def _filter_csv(path: Path, keep):
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        yield reader.fieldnames
        for row in reader:
            if keep(row):
                yield [row[c] for c in reader.fieldnames]


def _write_csv(path: Path, rows) -> int:
    """Write a header then data rows; return the number of data rows."""
    rows = iter(rows)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(next(rows))
        count = 0
        for row in rows:
            writer.writerow(row)
            count += 1
    return count


# Extract order matters: p004 reads the ONSPD extract.
ORDER = ("tripadvisor", "onspd", "p004", "osm")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(
        prog="python -m plotluck.sources",
        description="Pull, extract and sample the MVP datasets (server only).",
    )
    parser.add_argument("step", choices=("pull", "extract", "sample"))
    parser.add_argument("names", nargs="*", help=f"default: all of {', '.join(ORDER)}")
    args = parser.parse_args(argv)
    unknown = set(args.names) - set(ORDER)
    if unknown:
        parser.error(f"unknown source(s): {', '.join(sorted(unknown))}")
    data = data_dir()
    if data != data_dir(choice="full"):
        parser.exit(2, "Writes full data: run on the server with PLOTLUCK_DATA=full.\n")
    if args.step == "sample":
        for name, count in cut_sample(data, data_dir(choice="sample")).items():
            print(f"sample {name}: {count} rows")
        return
    for name in sorted(args.names or ORDER, key=ORDER.index):
        if args.step == "pull":
            print(f"pulled {name}: {pull(name, data)}")
        else:
            print(f"extracted {name}: {extract(name, data)} rows")


if __name__ == "__main__":
    main()
