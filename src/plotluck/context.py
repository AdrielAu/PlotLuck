"""Public Census and tourism context for postcode districts.

Census counts are allocated from 2021 MSOAs using their share of active
English postcodes in each district. These are estimates, not an exact
postcode-district Census tabulation; see ADR 0005.
"""

import csv
import io
import json
import math
import random
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ETHNICITY = {
    "asian": "Asian, Asian British or Asian Welsh",
    "black": "Black, Black British, Black Welsh, Caribbean or African",
    "mixed": "Mixed or Multiple ethnic groups",
    "white": "White",
    "other": "Other ethnic group",
}
SEX = ("female", "male")
ETHNICITY_INPUTS = tuple(f"ethnicity_{name}_share" for name in ETHNICITY)
SEX_INPUTS = tuple(f"sex_{name}_share" for name in SEX)
DEMOGRAPHIC_INPUTS = ("average_age", *ETHNICITY_INPUTS, *SEX_INPUTS)
TOURISM_INPUTS = ("attractions_count", "hotels_count")
INPUTS = (*DEMOGRAPHIC_INPUTS, *TOURISM_INPUTS)
SUMMARIES = ("most_common_ethnicity", "most_common_sex")
CENSUS_CODES = {"census_age": "ts007", "census_ethnicity": "ts021", "census_sex": "ts008"}
SOURCE_COLUMNS = {
    "census_age": ("average_age",),
    "census_ethnicity": ETHNICITY_INPUTS,
    "census_sex": SEX_INPUTS,
}


def census_rows(data: Path, name: str):
    """Extract a Nomis bulk MSOA table to estimated district means/shares."""
    weights: defaultdict[str, Counter[str]] = defaultdict(Counter)
    with zipfile.ZipFile(data / "raw" / "onspd.zip") as archive:
        (member,) = [n for n in archive.namelist() if re.fullmatch(r"Data/ONSPD_[A-Z]{3}_\d{4}_UK.csv", n)]
        with archive.open(member) as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
            header = reader.fieldnames or []
            (country,) = [c for c in header if re.fullmatch(r"ctry\d\dcd", c)]
            if "msoa21" not in header:
                raise ValueError("Census context requires ONSPD's msoa21 column")
            for row in reader:
                if row[country] == "E92000001" and not row["doterm"] and row["msoa21"]:
                    weights[row["msoa21"]][row["pcds"].split()[0]] += 1
    if not weights:
        raise ValueError("Census context has no active English postcode-to-MSOA mappings")

    code = CENSUS_CODES[name]
    totals: defaultdict[str, defaultdict[str, float]] = defaultdict(lambda: defaultdict(float))
    covered = set()
    with zipfile.ZipFile(data / "raw" / f"{name}.zip") as archive:
        with archive.open(f"census2021-{code}-msoa.csv") as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
            if name == "census_age":
                columns = ["Age: Aged under 1 year; measures: Value", *(
                    f"Age: Aged {age} {'year' if age == 1 else 'years'}; measures: Value"
                    for age in range(1, 100)
                ), "Age: Aged 100 years and over; measures: Value"]
            elif name == "census_ethnicity":
                columns = [f"Ethnic group: {label}" for label in ETHNICITY.values()]
            else:
                columns = [f"Sex: {sex.title()}; measures: Value" for sex in SEX]
            if set(columns) - set(reader.fieldnames or []):
                raise ValueError(f"{name} has missing Census columns")
            for row in reader:
                area = row["geography code"]
                if area not in weights:
                    continue
                if area in covered:
                    raise ValueError(f"{name} repeats MSOA {area}")
                covered.add(area)
                counts = [float(row[column]) for column in columns]
                if any(not math.isfinite(n) or n < 0 or not n.is_integer() for n in counts):
                    raise ValueError(f"{name} has invalid Census counts")
                # shortcut: the open-ended 100+ age category is represented by
                # 100 years; replace with a fitted tail estimate if needed.
                values = ([sum(age * n for age, n in enumerate(counts))]
                          if name == "census_age" else counts)
                denominator = sum(counts)
                for district, postcodes in weights[area].items():
                    fraction = postcodes / weights[area].total()
                    totals[district]["residents"] += denominator * fraction
                    for field, value in zip(SOURCE_COLUMNS[name], values):
                        totals[district][field] += value * fraction
    if covered != set(weights):
        raise ValueError(f"{name} is missing {len(set(weights) - covered)} mapped MSOAs")
    yield ("district", *SOURCE_COLUMNS[name])
    for district, district_totals in sorted(totals.items()):
        yield [district, *(round(district_totals[field] / district_totals["residents"], 8)
                           if district_totals["residents"] else "" for field in SOURCE_COLUMNS[name])]


def demographic_table(data: Path) -> dict[str, dict]:
    """Read and validate district demographic extracts, preserving missingness."""
    districts: defaultdict[str, dict[str, float | str]] = defaultdict(dict)
    for name, fields in SOURCE_COLUMNS.items():
        with (data / f"{name}_england.csv").open(encoding="utf-8", newline="") as stream:
            reader = csv.DictReader(stream)
            if reader.fieldnames != ["district", *fields]:
                raise ValueError(f"{name} has an invalid district schema")
            seen = set()
            for row in reader:
                district = row["district"]
                if not re.fullmatch(r"[A-Z]{1,2}\d[A-Z\d]?", district) or district in seen:
                    raise ValueError(f"{name} has an invalid or duplicate district")
                seen.add(district)
                values = [float(row[field]) if row[field] != "" else None for field in fields]
                if any(value is not None and (not math.isfinite(value) or not 0 <= value <= (
                    100 if name == "census_age" else 1
                )) for value in values):
                    raise ValueError(f"{name} has an invalid mean or share")
                if len(fields) > 1 and any(v is not None for v in values):
                    if any(v is None for v in values) or not math.isclose(
                        sum(v for v in values if v is not None), 1, abs_tol=1e-6
                    ):
                        raise ValueError(f"{name} shares must sum to one or all be missing")
                districts[district].update(zip(fields, ("" if v is None else v for v in values)))
    return dict(districts)


def summary(values: dict, fields: tuple[str, ...], labels) -> str:
    """Unique most common category; explicitly preserve ties and missing data."""
    shares = [values.get(field, "") for field in fields]
    if any(value == "" for value in shares):
        return "unknown"
    winners = [label for label, value in zip(labels, shares) if value == max(shares)]
    return winners[0] if len(winners) == 1 else "tie"


def write_sample(data: Path) -> None:
    """Seeded, made-up context at public sample postcode points; never real demographics."""
    with (data / "onspd_england.csv").open(encoding="utf-8", newline="") as stream:
        anchors: dict[str, tuple[str, str]] = {}
        for row in csv.DictReader(stream):
            if row["lat"] and row["long"] and float(row["lat"]) <= 90:
                anchors.setdefault(row["district"], (row["lat"], row["long"]))
    rng = random.Random(101)
    rows: dict[str, list[list[str | float]]] = {name: [] for name in SOURCE_COLUMNS}
    tourism: list[list[str]] = []
    for district, (lat, lon) in sorted(anchors.items()):
        rows["census_age"].append([district, round(rng.uniform(25, 55), 4)])
        ethnicity = [rng.randint(1, 50) for _ in ETHNICITY]
        rows["census_ethnicity"].append([district, *(n / sum(ethnicity) for n in ethnicity)])
        female = rng.uniform(0.4, 0.6)
        rows["census_sex"].append([district, female, 1 - female])
        for kind in ("attraction", "hotel"):
            for _ in range(rng.randrange(5)):
                tourism.append(["node", f"synthetic-{len(tourism)}", kind, lat, lon])
    for name, fields in SOURCE_COLUMNS.items():
        with (data / f"{name}_england.csv").open("w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(["district", *fields])
            writer.writerows(rows[name])
    with (data / "tourism_england.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["osm_type", "osm_id", "tourism", "lat", "lon"])
        writer.writerows(tourism)
    (data / "raw").mkdir(exist_ok=True)
    (data / "raw" / "context_sample.provenance.json").write_text(
        json.dumps({"synthetic": True, "seed": 101, "generator": "plotluck.context.write_sample",
                    "description": "Made-up Census context and tourism points; no real district demographics"}, indent=2) + "\n",
        encoding="utf-8", newline="\n",
    )
