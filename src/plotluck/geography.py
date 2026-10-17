"""Prepare public ONS boundaries into an offline, polygon-free search catalogue.

Only standard-library modules are required. Acquisition asks the publisher to
convert British National Grid polygons to WGS84; cached GeoJSON then builds offline.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen

BASE = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
SOURCES = {
    "settlement": ("BUA_2022_GB", "BUA22CD", "BUA22NM", "OBJECTID"),
    "local_authority": ("Local_Authority_Districts_DEC_2025_Boundaries_UK_BGC", "LAD25CD", "LAD25NM", "FID"),
    "region": ("Regions_December_2025_Boundaries_EN_BGC", "RGN25CD", "RGN25NM", "FID"),
    "metropolitan_county": ("Upper_Tier_Local_Authorities_December_2022_Boundaries_UK_BGC", "UTLA22CD", "UTLA22NM", "FID"),
    "county": ("Counties_and_Unitary_Authorities_December_2025_Boundaries_UK_BGC", "CTYUA25CD", "CTYUA25NM", "FID"),
}
ATTRIBUTION = ("Source: Office for National Statistics licensed under the Open Government Licence v.3.0. "
               "Contains OS data © Crown copyright and database right 2026.")


def district_geometry_digest(districts: list[dict[str, Any]]) -> str:
    """SHA256 of sorted UTF-8 code<TAB>raw_lat<TAB>raw_lon<LF> CSV strings."""
    rows = sorted((str(row["postcode_district"]), str(row["centroid_lat"]),
                   str(row["centroid_lon"])) for row in districts)
    if len({row[0] for row in rows}) != len(rows):
        raise ValueError("Duplicate postcode districts")
    if any(not math.isfinite(float(value)) for row in rows for value in row[1:]):
        raise ValueError("Non-finite district centroid")
    return hashlib.sha256("".join("\t".join(row) + "\n" for row in rows).encode()).hexdigest()


def _ring_position(point: tuple[float, float], ring: list) -> int:
    """Return 0 outside, 1 inside, 2 on edge; caller handles polygon holes."""
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        ax, ay = a[:2]
        bx, by = b[:2]
        cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
        if abs(cross) <= 1e-12 and min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by):
            return 2
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return int(inside)


def _contains(point: tuple[float, float], polygons: list) -> bool:
    for polygon in polygons:
        outer = _ring_position(point, polygon[0])
        if outer == 2:
            return True
        if outer:
            holes = [_ring_position(point, hole) for hole in polygon[1:]]
            if 2 in holes or 1 not in holes:
                return True
    return False


def prepare_catalogue(sources: dict[str, dict], districts: list[dict[str, Any]]) -> dict:
    """Join authoritative feature IDs/names/centres to centroid memberships.

    Names, coordinates and boundaries come from the same feature, never a name
    join to a local authority. E-prefixed GSS codes select English features only.
    """
    digest = district_geometry_digest(districts)
    points = [(row["postcode_district"], (float(row["centroid_lon"]), float(row["centroid_lat"])))
              for row in districts]
    places = []
    ids = set()
    authorities = []
    for kind, collection in sources.items():
        if kind not in SOURCES or collection.get("type") != "FeatureCollection":
            raise ValueError("Unsupported geography source")
        _, code_key, name_key, _ = SOURCES[kind]
        for feature in collection["features"]:
            props = feature["properties"]
            code = props[code_key]
            if not code.startswith("E"):
                continue
            # Unitary authorities already have their own LAD feature. This source
            # adds only the six metropolitan counties, including Greater Manchester.
            if kind == "metropolitan_county" and not code.startswith("E11"):
                continue
            # E06 unitary authorities already exist in the LAD source. Only add
            # the E10 administrative counties, using their own 2025 boundaries.
            if kind == "county" and not code.startswith("E10"):
                continue
            if code in ids:
                raise ValueError(f"Duplicate geography ID: {code}")
            ids.add(code)
            lon, lat = float(props["LONG"]), float(props["LAT"])
            if not (-7 <= lon <= 3 and 49 <= lat <= 57):
                raise ValueError(f"Invalid England reference point: {code}")
            geometry = feature["geometry"]
            if geometry["type"] not in ("Polygon", "MultiPolygon"):
                raise ValueError("Expected polygon boundary")
            polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
            if not polygons or any(not polygon or any(len(ring) < 4 or ring[0] != ring[-1]
                                                       for ring in polygon) for polygon in polygons):
                raise ValueError("Expected closed polygon rings")
            vertices = [p for polygon in polygons for ring in polygon for p in ring]
            if any(len(p) != 2 or not all(math.isfinite(v) for v in p)
                   or not (-180 <= p[0] <= 180 and -90 <= p[1] <= 90) for p in vertices):
                raise ValueError("Expected finite WGS84 coordinates")
            west, east = min(p[0] for p in vertices), max(p[0] for p in vertices)
            south, north = min(p[1] for p in vertices), max(p[1] for p in vertices)
            members = sorted(code for code, point in points
                             if west <= point[0] <= east and south <= point[1] <= north
                             and _contains(point, polygons))
            name = props[name_key].strip()
            aliases = []
            place_type = "borough" if code.startswith("E09") else kind
            if kind == "metropolitan_county":
                place_type = "county"
            if code == "E12000007":
                name, aliases = "Greater London", ["London"]
            if code == "E09000001":
                place_type, aliases = "city", ["London", "City of London"]
            if name == "Brighton and Hove":
                aliases = ["Brighton", "Hove", "Brighton & Hove"]
            if kind == "region":
                if code in {"E12000001", "E12000002", "E12000008", "E12000009"}:
                    aliases.extend([f"{name} England", name.replace(" ", ""),
                                    f"{name.replace(' ', '')} England"])
                if code == "E12000003":
                    # A common-name proposal, not the historic county boundary.
                    aliases.extend(["Yorkshire", "Yorks", "Yorkshire and Humber"])
            if place_type == "county":
                aliases.append(f"{name} county")
            place = {"id": code, "name": name, "aliases": aliases, "type": place_type,
                     "context": "England", "lat": lat, "lon": lon, "districts": members}
            places.append(place)
            if kind == "local_authority":
                authorities.append((place, polygons, (west, south, east, north)))
    for place in places:
        if place["type"] == "settlement":
            point = (place["lon"], place["lat"])
            parents = [authority for authority, polygons, (w, s, e, n) in authorities
                       if w <= point[0] <= e and s <= point[1] <= n and _contains(point, polygons)]
            if parents:
                place["context"] = "; ".join(f"{p['name']} ({p['id']})" for p in parents)
    return {"version": 1, "districtGeometrySha256": digest,
            "attribution": ATTRIBUTION, "places": sorted(places, key=lambda p: p["id"])}


def acquire(cache: Path, offline: bool = False) -> tuple[dict, list[dict]]:
    """Cache deterministic paginated WGS84 queries; return content hashes for pinning."""
    cache.mkdir(parents=True, exist_ok=True)
    collections, manifest = {}, []
    for kind, (service, code, name, order) in SOURCES.items():
        features = []
        offset = 0
        while True:
            prefix = {"metropolitan_county": "E11", "county": "E10"}.get(kind, "E")
            params = {"where": f"{code} LIKE '{prefix}%'", "outFields": f"{code},{name},LAT,LONG",
                      "returnGeometry": "true", "outSR": 4326, "f": "geojson",
                      "orderByFields": order, "resultOffset": offset, "resultRecordCount": 100}
            url = BASE + service + "/FeatureServer/0/query?" + urlencode(params)
            path = cache / f"{kind}-{offset:05}.json"
            if not path.exists():
                if offline:
                    raise FileNotFoundError(f"Missing cached geography: {path}")
                with urlopen(url, timeout=120) as response:
                    raw = response.read()
                page = json.loads(raw)
                if page.get("type") != "FeatureCollection":
                    raise ValueError(f"Publisher returned an invalid geography response: {page}")
                path.write_bytes(raw)
            raw = path.read_bytes()
            page = json.loads(raw)
            if page.get("type") != "FeatureCollection":
                raise ValueError(f"Invalid cached geography: {path}")
            manifest.append({"file": path.name, "url": url, "sha256": hashlib.sha256(raw).hexdigest(),
                             "bytes": len(raw)})
            features.extend(page["features"])
            print(f"{kind}: {len(features)} features", flush=True)
            if not page.get("properties", {}).get("exceededTransferLimit", False) and len(page["features"]) < 100:
                break
            offset += 100
        collections[kind] = {"type": "FeatureCollection", "features": features}
    return collections, manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True, help="Public source cache outside git")
    parser.add_argument("--districts", type=Path, required=True, help="Published scoring district CSV")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--verify-manifest", type=Path, help="Reject any changed source page")
    args = parser.parse_args()
    sources, manifest = acquire(args.cache, args.offline)
    if args.verify_manifest and json.loads(args.verify_manifest.read_text(encoding="utf-8")) != manifest:
        raise ValueError("Geography sources differ from pinned manifest; review before rebuilding")
    with args.districts.open(encoding="utf-8", newline="") as handle:
        catalogue = prepare_catalogue(sources, list(csv.DictReader(handle)))
    raw = json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(raw)
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"places": len(catalogue["places"]), "bytes": len(raw),
                      "gzipBytes": len(gzip.compress(raw, mtime=0)),
                      "districtGeometrySha256": catalogue["districtGeometrySha256"]}))


if __name__ == "__main__":
    main()
