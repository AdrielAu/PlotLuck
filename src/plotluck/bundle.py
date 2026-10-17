"""Sample-source tracer: prepare tables, train NN1, and write the site contract.

The shortcuts here are deliberate seams for the cuisine, label, traits, district
inputs and cross-validation tickets. No source downloads happen during a build.
"""

import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

from plotluck.data import data_dir

VERSION = "1.0"
RESTAURANT_COLUMNS = (
    "postcode_district", "cuisines", "price_band", "is_chain",
    "vegetarian_friendly", "vegan_options", "gluten_free", "avg_rating",
    "total_reviews", "count_excellent", "count_very_good", "count_average",
    "count_poor", "count_terrible", "review_success_label",
)
DISTRICT_COLUMNS = (
    "postcode_district", "centroid_lat", "centroid_lon", "total_restaurants",
    "population", "deprivation_index", "commercial_rent_index",
)
FLAGS = ("is_chain", "vegetarian_friendly", "vegan_options", "gluten_free")
# shortcut: only the current sample tags; replace with the mapping file in #68.
CUISINES = {name: name for name in
            ("British", "Italian", "Indian", "Chinese", "Thai", "Turkish")}
CUISINES["Pizza"] = "Italian"


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def _write_csv(path: Path, columns: tuple[str, ...], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows({name: row.get(name) for name in columns} for row in rows)


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)
                    + "\n", encoding="utf-8", newline="\n")


def _number(value: Any) -> float | None:
    try:
        result = float(value)
    except (ValueError, TypeError):
        return None
    return result if math.isfinite(result) else None


def _count(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None and number >= 0 and number.is_integer() else None


def _prepare(data: Path) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    postcodes = _read_csv(data / "onspd_england.csv")
    postcodes = [p for p in postcodes if p["country_code"] == "E92000001"]
    if not postcodes:
        raise ValueError("No England postcodes in the input")
    points = np.array([[float(p["lat"]), float(p["long"])] for p in postcodes])
    if not np.isfinite(points).all():
        raise ValueError("Postcode coordinates must be finite")
    residents = {r["district"]: _number(r["residents"])
                 for r in _read_csv(data / "p004_england.csv")}
    raw = _read_csv(data / "tripadvisor_england.csv")
    name_counts = Counter(r["restaurant_name"] for r in raw)
    restaurants, profiles = [], []
    for row in raw:
        tags = [t.strip() for t in row["cuisines"].split(",") if t.strip()]
        unknown = set(tags) - CUISINES.keys() - {"Cafe"}
        if unknown:
            raise ValueError(f"Unmapped cuisine tag(s): {', '.join(sorted(unknown))}")
        rating = _number(row["avg_rating"])
        total = _count(row["total_reviews_count"])
        lat, lon = _number(row["latitude"]), _number(row["longitude"])
        if (rating is None or not 1 <= rating <= 5 or total is None or total <= 0
                or lat is None or lon is None):
            continue
        # shortcut: brute-force nearest postcode for the small sample; replace
        # with the scalable district assignment in #71 before a full-data run.
        distance = ((points[:, 0] - lat) ** 2
                    + ((points[:, 1] - lon) * math.cos(math.radians(lat))) ** 2)
        district = postcodes[int(np.argmin(distance))]["district"]
        cuisine = next((CUISINES[t] for t in tags if t in CUISINES), "Unspecified")
        price = {"€": "$", "€€-€€€": "$$", "€€€€": "$$$"}.get(
            row["price_level"], "")
        flags = {name: {"Y": 1, "N": 0}.get(row[name]) for name in FLAGS[1:]}
        flags["is_chain"] = int(name_counts[row["restaurant_name"]] >= 3)
        # shortcut: rating-only target for this tracer; #69 supplies the actual
        # review label with fitted per-fold references and repair/exclusion rules.
        label = (rating - 1) / 4
        restaurants.append({
            "postcode_district": district, "cuisines": row["cuisines"],
            "price_band": price, **flags, "avg_rating": rating,
            "total_reviews": int(total),
            **{f"count_{name}": _count(row[name]) for name in
               ("excellent", "very_good", "average", "poor", "terrible")},
            "review_success_label": label,
        })
        profiles.append({"cuisine_group": cuisine,
                         "venue_type": "Café" if "Cafe" in tags else "Restaurant",
                         "price_band": price or "unknown", **flags})
    if not restaurants:
        raise ValueError("No eligible restaurant rows in the input")
    supply_counts = Counter((r["postcode_district"], p["cuisine_group"])
                            for r, p in zip(restaurants, profiles))
    total_counts = Counter(r["postcode_district"] for r in restaurants)
    by_district: dict[str, list[dict]] = defaultdict(list)
    for postcode in postcodes:
        by_district[postcode["district"]].append(postcode)
    districts = []
    for code, rows in sorted(by_district.items()):
        imd = [v for p in rows if (v := _number(p["imd25ind"])) is not None]
        districts.append({
            "postcode_district": code,
            "centroid_lat": float(np.mean([float(p["lat"]) for p in rows])),
            "centroid_lon": float(np.mean([float(p["long"]) for p in rows])),
            "total_restaurants": total_counts[code], "population": residents.get(code),
            "deprivation_index": float(np.mean(imd)) if imd else None,
            # shortcut: VOA is not yet acquired; #72 adds it. Keep the schema
            # column missing, and drop it from model inputs rather than fake it.
            "commercial_rent_index": None,
        })
    supply = [{"postcode_district": code, "cuisine_group": group, "restaurants": n}
              for (code, group), n in sorted(supply_counts.items())]
    return restaurants, profiles, districts, supply


def encode_inputs(model: dict, profile: dict, district: dict,
                  same_cuisine_supply: int) -> list[float]:
    """Encode one group-resolved profile using the exported transform contract.

    Fine cuisine to group lookup belongs to vocabulary.json's cuisine entries.
    Missing categorical values use the trait default; unseen values encode zero.
    """
    values = {**profile, **district, "same_cuisine_supply": same_cuisine_supply}
    transforms = model["transforms"]
    vector: list[float] = []
    for name in model["features"]["restaurant_inputs"] + model["features"]["district_inputs"]:
        if name in transforms["categorical_vocabs"]:
            value = values.get(name, transforms["defaults"][name])
            vector.extend(float(value == option)
                          for option in transforms["categorical_vocabs"][name])
        else:
            transform = transforms["numeric"][name]
            value = _number(values.get(name))
            if value is None:
                value = transform["median"]
            if transform["log1p"]:
                if value < 0:
                    raise ValueError(f"{name} must be nonnegative")
                value = math.log1p(value)
            vector.append((value - transform["mean"]) / transform["std"])
    return vector


def _model_contract(profiles: list[dict], districts: list[dict]) -> tuple[dict, dict]:
    groups = sorted({p["cuisine_group"] for p in profiles} | {"Unspecified"})
    venues = ["Restaurant", "Café"]
    prices = ["$", "$$", "$$$", "unknown"]
    categories = {"cuisine_group": groups, "venue_type": venues, "price_band": prices}
    defaults: dict[str, Any] = {"venue_type": "Restaurant", "price_band": "unknown",
                                "cuisine_group": "Unspecified", **dict.fromkeys(FLAGS, 0)}
    model: dict[str, Any] = {
        "version": VERSION,
        "features": {"restaurant_inputs": list(categories) + list(FLAGS),
                     "district_inputs": ["population", "deprivation_index",
                                         "total_restaurants", "same_cuisine_supply"]},
        "transforms": {"categorical_vocabs": categories, "numeric": {},
                       "defaults": defaults},
        "layers": [], "activations": ["relu", "relu", "sigmoid"],
    }
    for name in FLAGS:
        model["transforms"]["numeric"][name] = {
            "log1p": False, "median": 0, "mean": 0, "std": 1}
    # shortcut: tracer transform fits district context; #71 fits each training
    # fold, imputes correctly there, and removes each row from supply features.
    for name in model["features"]["district_inputs"]:
        source = "total_restaurants" if name == "same_cuisine_supply" else name
        values = np.array([v for d in districts if (v := _number(d[source])) is not None])
        if not len(values):
            raise ValueError(f"No finite values for district input {name}")
        log = name != "deprivation_index"
        transformed = np.log1p(values) if log else values
        model["transforms"]["numeric"][name] = {
            "log1p": log, "median": float(np.median(values)),
            "mean": float(transformed.mean()), "std": float(transformed.std()) or 1.0,
        }
    traits = [{"name": name, "kind": "single_choice", "values": values,
               "default": defaults[name]} for name, values in categories.items()
              if name != "cuisine_group"]
    traits += [{"name": name, "kind": "on_off", "values": [0, 1], "default": 0}
               for name in FLAGS]
    vocabulary = {"version": VERSION,
                  "cuisines": [{"cuisine": name, "cuisine_group": name, "label": name}
                               for name in groups], "traits": traits}
    return model, vocabulary


def build_bundle(output_dir: Path, *, epochs: int = 3, seed: int = 0,
                 run_dir: Path | None = None) -> Path:
    """Build the tracer from data_dir(); return the site folder.

    The public folder contains only district context, counts, vocabulary, weights
    and synthetic-profile reference scores. Prepared restaurant rows and loss
    output go to a separate run folder (by default <output-name>-run).
    """
    if epochs < 1:
        raise ValueError("epochs must be positive")
    output = Path(output_dir).resolve()
    run = (Path(run_dir).resolve() if run_dir is not None
           else output.with_name(output.name + "-run"))
    source = data_dir().resolve()
    if output == source or source.is_relative_to(output):
        raise ValueError("The site bundle cannot contain or replace the source folder")
    if run == output or run.is_relative_to(output):
        raise ValueError("Private run output must be outside the site bundle")
    if source == data_dir(choice="full").resolve():
        raise ValueError("Tracer is sample-only; complete the full-data stages before LinuxONE use")
    restaurants, profiles, districts, supply = _prepare(source)
    model, vocabulary = _model_contract(profiles, districts)
    context = {d["postcode_district"]: d for d in districts}
    counts = {(s["postcode_district"], s["cuisine_group"]): s["restaurants"] for s in supply}
    vectors = [encode_inputs(model, p, context[r["postcode_district"]],
                             counts[(r["postcode_district"], p["cuisine_group"])])
               for r, p in zip(restaurants, profiles)]
    inputs = torch.tensor(vectors, dtype=torch.float32)
    targets = torch.tensor([[r["review_success_label"]] for r in restaurants],
                           dtype=torch.float32)
    # fork_rng preserves the caller's RNG state while making this build repeatable.
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(seed)
        network = nn.Sequential(nn.Linear(inputs.shape[1], 64), nn.ReLU(),
                                nn.Linear(64, 32), nn.ReLU(), nn.Linear(32, 1), nn.Sigmoid())
        optimizer = torch.optim.Adam(network.parameters(), lr=1e-3, weight_decay=1e-4)
        losses = []
        for _ in range(epochs):
            optimizer.zero_grad()
            loss = nn.functional.mse_loss(network(inputs), targets)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
    network.eval()
    model["layers"] = [{"weights": layer.weight.detach().tolist(),
                        "biases": layer.bias.detach().tolist()}
                       for layer in network if isinstance(layer, nn.Linear)]
    reference: dict[str, Any] = {"version": VERSION, "tolerance": 1e-6, "profiles": []}
    for index, cuisine in enumerate(vocabulary["cuisines"][:3]):
        profile = {"cuisine": cuisine["cuisine"], **model["transforms"]["defaults"]}
        profile.pop("cuisine_group")
        if index == 1:
            profile.update(venue_type="Café", price_band="$$$", **dict.fromkeys(FLAGS, 1))
        scores = []
        for district in districts:
            code = district["postcode_district"]
            vector = encode_inputs(model, {**profile, "cuisine_group": cuisine["cuisine_group"]},
                                   district, counts.get((code, cuisine["cuisine_group"]), 0))
            with torch.no_grad():
                score = float(network(torch.tensor(vector, dtype=torch.float32))[0])
            scores.append({"postcode_district": code, "score": score})
        reference["profiles"].append({"profile": profile, "scores": scores})
    output.mkdir(parents=True, exist_ok=True)
    run.mkdir(parents=True, exist_ok=True)
    _write_csv(output / "districts.csv", DISTRICT_COLUMNS, districts)
    _write_csv(output / "district_cuisine_supply.csv",
               ("postcode_district", "cuisine_group", "restaurants"), supply)
    for name, value in (("model", model), ("vocabulary", vocabulary), ("reference", reference)):
        _write_json(output / f"{name}.json", value)
    _write_csv(run / "restaurants.csv", RESTAURANT_COLUMNS, restaurants)
    _write_json(run / "metrics.json", {"stage": "tracer", "seed": seed, "epochs": epochs,
                                      "restaurants": len(restaurants), "districts": len(districts),
                                      "loss": losses, "dropped_inputs": ["commercial_rent_index"],
                                      "limitations": ["placeholder label", "no CV", "stub mapping",
                                                      "unadjusted training supply", "no trait ship rule"]})
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--run-dir", type=Path)
    parser.add_argument("--epochs", type=int, default=3)
    args = parser.parse_args()
    build_bundle(args.output, epochs=args.epochs, run_dir=args.run_dir)


if __name__ == "__main__":
    main()
