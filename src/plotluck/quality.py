"""Conservative district-context repair before NN1 training and export.

Only public context is used. Recorded positive values are preserved except a
rent index markedly below comparable peers, or an extremely low value with too
few peers to establish that it is plausible.
"""

import math
import csv
import io
import re
import statistics
import zipfile
from collections import Counter
from pathlib import Path
from typing import cast

from plotluck import context
from plotluck.geometry import haversine_km

ETHNICITY = (
    "ethnicity_asian_share", "ethnicity_black_share", "ethnicity_mixed_share",
    "ethnicity_white_share", "ethnicity_other_share",
)
SEX = ("sex_female_share", "sex_male_share")
GROUPS = (
    ("population",), ("deprivation_index",), ("commercial_rent_index",),
    ("average_age",), ETHNICITY, SEX,
)
MIN_PEERS = 3
MAX_DISTANCE_KM = 30


def cross_border_districts(archive_path: Path) -> set[str]:
    """Districts with active postcodes in England and another UK country."""
    countries: dict[str, set[str]] = {}
    with zipfile.ZipFile(archive_path) as archive:
        members = [name for name in archive.namelist() if re.fullmatch(
            r"Data/ONSPD_[A-Z]{3}_\d{4}_UK.csv", name
        )]
        if len(members) != 1:
            raise ValueError("ONSPD archive must contain one UK postcode CSV")
        with archive.open(members[0]) as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
            fields = reader.fieldnames or []
            country_fields = [name for name in fields if re.fullmatch(r"ctry\d\dcd", name)]
            if len(country_fields) != 1 or not {"pcds", "doterm"} <= set(fields):
                raise ValueError("ONSPD archive lacks postcode, termination, or country code fields")
            country_field = country_fields[0]
            for row in reader:
                if not row["doterm"]:
                    if not row["pcds"] or not row[country_field]:
                        raise ValueError("active ONSPD postcode lacks district or country code")
                    district = row["pcds"].split()[0]
                    countries.setdefault(district, set()).add(row[country_field])
    return {district for district, codes in countries.items() if "E92000001" in codes and len(codes) > 1}


def _number(value):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _unsupported_commercial_core(row: dict) -> bool:
    population = _number(row["population"])
    return population is not None and 0 < population < 100 and int(row["total_restaurants"]) >= 20


def _peers(target: dict, rows: list[dict]) -> list[dict]:
    lat, lon = float(target["centroid_lat"]), float(target["centroid_lon"])
    radius = float(target["radius_km"])
    supply = int(target["total_restaurants"]) + 1
    candidates = []
    for row in rows:
        if row is target or int(row["total_restaurants"]) <= 0 or _unsupported_commercial_core(row):
            continue
        other_radius = float(row["radius_km"])
        supply_ratio = (int(row["total_restaurants"]) + 1) / supply
        if not 1 / 3 <= other_radius / radius <= 3 or not 1 / 4 <= supply_ratio <= 4:
            continue
        candidates.append(row)
    if not candidates:
        return []
    distances = haversine_km(
        [(lat, lon)] * len(candidates),
        [(row["centroid_lat"], row["centroid_lon"]) for row in candidates],
    )
    nearby = [
        (float(distance), row["postcode_district"], row)
        for distance, row in zip(distances, candidates) if distance <= MAX_DISTANCE_KM
    ]
    return [row for _, _, row in sorted(nearby)]


def _valid_group(group: tuple[str, ...], values: list[float | None]) -> bool:
    if any(value is None for value in values):
        return False
    numbers = [value for value in values if value is not None]
    if group in (("population",), ("commercial_rent_index",), ("average_age",)):
        return numbers[0] > 0
    if group in (ETHNICITY, SEX):
        return all(0 <= value <= 1 for value in numbers) and math.isclose(sum(numbers), 1, abs_tol=1e-6)
    return numbers[0] >= 0


def _estimate(group: tuple[str, ...], peers: list[dict], suspect_rents: set[str]) -> list[float] | None:
    if group == ("commercial_rent_index",):
        peers = [row for row in peers if row["postcode_district"] not in suspect_rents]
    donors = [
        cast(list[float], values) for row in peers
        if _valid_group(group, values := [_number(row[name]) for name in group])
    ]
    if len(group) == 1 and len(donors) >= MIN_PEERS:
        centre = statistics.median(values[0] for values in donors)
        if centre > 0:
            donors = [values for values in donors if centre / 10 <= values[0] <= centre * 10]
    donors = donors[:8]
    if len(donors) < MIN_PEERS:
        return None
    estimate = [statistics.median(column) for column in zip(*donors)]
    if len(group) > 1:
        total = sum(estimate)
        if total <= 0:
            return None
        estimate = [value / total for value in estimate]
    return estimate


def _suspect_low_rent(value: float, peers: list[dict], global_floor: float) -> bool:
    rents = [r for row in peers if (r := _number(row["commercial_rent_index"])) is not None and r > 0]
    if len(rents) < MIN_PEERS:
        return value < global_floor
    return value < statistics.median(rents) / 4 and sum(r > value * 3 for r in rents) >= MIN_PEERS


def prepare_districts(districts: list[dict]) -> tuple[list[dict], set[str], Counter]:
    """Return publishable context, unmodified training codes, and exclusion counts.

    A missing value is estimated only when at least three nearby districts of
    similar mapped supply and geographic size provide that field. Districts
    needing more than two context groups repaired, or lacking donors, are not
    exported. Positive low population is not automatically called erroneous.
    """
    prepared, reliable, excluded = [], set(), Counter[str]()
    positive_rents = [rent for row in districts if (rent := _number(row["commercial_rent_index"])) is not None and rent > 0]
    global_floor = statistics.median(positive_rents) / 10 if positive_rents else 0
    peer_map = {row["postcode_district"]: _peers(row, districts) for row in districts}
    suspect_rents = {
        row["postcode_district"] for row in districts
        if (rent := _number(row["commercial_rent_index"])) is not None
        and rent > 0 and _suspect_low_rent(rent, peer_map[row["postcode_district"]], global_floor)
    }
    for original in districts:
        if int(original["total_restaurants"]) <= 0:
            excluded["no_restaurants"] += 1
            continue
        if _unsupported_commercial_core(original):
            excluded["commercial_core_without_footfall"] += 1
            continue
        row = original.copy()
        peers = peer_map[original["postcode_district"]]
        needs = []
        for group in GROUPS:
            low_rent = group == ("commercial_rent_index",) and row["postcode_district"] in suspect_rents
            if not _valid_group(group, [_number(row[name]) for name in group]) or low_rent:
                needs.append(group)
        if len(needs) > 2:
            excluded["too_many_missing_groups"] += 1
            continue
        for group in needs:
            values = _estimate(group, peers, suspect_rents)
            if values is None:
                excluded["no_comparable_peers"] += 1
                break
            for name, value in zip(group, values):
                row[name] = round(value) if name == "population" else round(value, 8)
            if group == ETHNICITY and "most_common_ethnicity" in row:
                row["most_common_ethnicity"] = context.summary(row, ETHNICITY, context.ETHNICITY)
            if group == SEX and "most_common_sex" in row:
                row["most_common_sex"] = context.summary(row, SEX, context.SEX)
        else:
            prepared.append(row)
            if not needs:
                reliable.add(row["postcode_district"])
    return prepared, reliable, excluded
