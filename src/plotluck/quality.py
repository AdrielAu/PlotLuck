"""Conservative district-context repair before NN1 training and export.

Only public context is used. Recorded valid values are preserved except a
rent index markedly below comparable peers, or an extremely low value with too
few peers to establish that it is plausible. A missing or invalid value (a
non-positive single value, or shares outside 0-1 or not summing to 1) is
estimated, so its district never trains NN1.
"""

import math
import csv
import io
import re
import statistics
import zipfile
from collections import Counter
from pathlib import Path

ETHNICITY = (
    "ethnicity_asian_share", "ethnicity_black_share", "ethnicity_mixed_share",
    "ethnicity_white_share", "ethnicity_other_share",
)
SEX = ("sex_female_share", "sex_male_share")
GROUPS = (
    ("population",), ("deprivation_index",), ("commercial_rent_index",),
    ("average_age",), ETHNICITY, SEX,
)
SHARE_SUM_TOLERANCE = 0.01
MAX_REPAIRED_GROUPS = 2
EXCLUSION_REASONS = (
    "no_restaurants", "commercial_core_without_footfall", "too_many_missing_groups", "no_comparable_peers",
)
MIN_PEERS = 3
# Provisional donor screens, like the peer limits; check them against the full-data audit.
OUTLIER_FACTOR = 4
OUTLIER_SHARE_DISTANCE = 0.5
MAX_DISTANCE_KM = 30
EARTH_RADIUS_KM = 6371.0088


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
    if not countries:
        raise ValueError("ONSPD archive has no active UK postcodes")
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
        dy = math.radians(float(row["centroid_lat"]) - lat)
        dx = math.radians(float(row["centroid_lon"]) - lon) * math.cos(math.radians(lat))
        distance = EARTH_RADIUS_KM * math.hypot(dx, dy)
        if distance <= MAX_DISTANCE_KM:
            candidates.append((distance, row["postcode_district"], row))
    return [row for _, _, row in sorted(candidates)[:8]]


def _group_name(group: tuple[str, ...]) -> str:
    return group[0] if len(group) == 1 else group[0].split("_")[0]


def estimate_reasons() -> set[str]:
    """Every key ``prepare_districts`` may count an estimate under."""
    return {
        f"{_group_name(group)}_{reason}" for group in GROUPS for reason in ("missing", "invalid")
    } | {"commercial_rent_index_low"}


def _valid(group: tuple[str, ...], values: list[float]) -> bool:
    """A recorded group is usable: a positive single value, or shares in 0-1 that sum to 1."""
    if len(group) == 1:
        return values[0] > 0
    return all(0 <= value <= 1 for value in values) and abs(sum(values) - 1) <= SHARE_SUM_TOLERANCE


def _outlying(group: tuple[str, ...], values: list[float], centre: list[float]) -> bool:
    """A donor value far from the other donors' median: a single value more than
    OUTLIER_FACTOR times above or below it, or shares differing by over half the mix."""
    if len(group) == 1:
        return not centre[0] / OUTLIER_FACTOR <= values[0] <= centre[0] * OUTLIER_FACTOR
    return sum(abs(value - middle) for value, middle in zip(values, centre)) / 2 > OUTLIER_SHARE_DISTANCE


def _estimate(group: tuple[str, ...], peers: list[dict], suspect_rents: set[str]) -> list[float] | None:
    if group == ("commercial_rent_index",):
        peers = [row for row in peers if row["postcode_district"] not in suspect_rents]
    donors = [[_number(row[name]) for name in group] for row in peers]
    donors = [values for values in donors if None not in values and _valid(group, values)]
    if len(donors) < MIN_PEERS:
        return None
    centre = [statistics.median(column) for column in zip(*donors)]
    donors = [values for values in donors if not _outlying(group, values, centre)]
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


def prepare_districts(
    districts: list[dict],
) -> tuple[list[dict], set[str], Counter, Counter, dict[str, tuple[str, str]]]:
    """Return publishable context, unmodified training codes, exclusion counts, estimate counts and audit.

    Estimate counts are keyed ``<group>_<missing|invalid|low>``, one per
    repaired group of a published district. The audit maps every district to
    its status (``recorded``, ``estimated`` or ``excluded``) and its
    ``;``-joined reasons: an exclusion reason first, then the groups needing repair.

    A missing value is estimated only when at least three nearby districts of
    similar mapped supply and geographic size provide that field. Districts
    needing more than two context groups repaired, or lacking donors, are not
    exported. Positive low population is not automatically called erroneous.
    """
    prepared, reliable, excluded, estimated, audit = [], set(), Counter(), Counter(), {}
    positive_rents = [rent for row in districts if (rent := _number(row["commercial_rent_index"])) is not None and rent > 0]
    global_floor = statistics.median(positive_rents) / 10 if positive_rents else 0
    peer_map = {row["postcode_district"]: _peers(row, districts) for row in districts}
    suspect_rents = {
        row["postcode_district"] for row in districts
        if (rent := _number(row["commercial_rent_index"])) is not None
        and rent > 0 and _suspect_low_rent(rent, peer_map[row["postcode_district"]], global_floor)
    }
    for original in districts:
        code = original["postcode_district"]
        if int(original["total_restaurants"]) <= 0:
            excluded["no_restaurants"] += 1
            audit[code] = ("excluded", "no_restaurants")
            continue
        if _unsupported_commercial_core(original):
            excluded["commercial_core_without_footfall"] += 1
            audit[code] = ("excluded", "commercial_core_without_footfall")
            continue
        row = original.copy()
        peers = peer_map[code]
        needs = []
        for group in GROUPS:
            values = [_number(row[name]) for name in group]
            if None in values:
                needs.append((group, "missing"))
            elif not _valid(group, values):
                needs.append((group, "invalid"))
            elif group == ("commercial_rent_index",) and row["postcode_district"] in suspect_rents:
                needs.append((group, "low"))
        reasons = [f"{_group_name(group)}_{reason}" for group, reason in needs]
        if len(needs) > MAX_REPAIRED_GROUPS:
            excluded["too_many_missing_groups"] += 1
            audit[code] = ("excluded", ";".join(["too_many_missing_groups", *reasons]))
            continue
        for group, _ in needs:
            values = _estimate(group, peers, suspect_rents)
            if values is None:
                excluded["no_comparable_peers"] += 1
                audit[code] = ("excluded", ";".join(["no_comparable_peers", *reasons]))
                break
            for name, value in zip(group, values):
                row[name] = round(value) if name == "population" else round(value, 8)
        else:
            prepared.append(row)
            estimated.update(reasons)
            audit[code] = ("estimated", ";".join(reasons)) if needs else ("recorded", "")
            if not needs:
                reliable.add(code)
    return prepared, reliable, excluded, estimated, audit
