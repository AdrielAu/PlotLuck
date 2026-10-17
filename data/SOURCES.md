# Data sources

One row per dataset, added in the same PR as the data (see [`AGENTS.md`](AGENTS.md)).

`python -m plotluck.sources` pulls each raw file to `data/full/raw/` on the server, writes `raw/<name>.provenance.json` (URL, edition, retrieval time, bytes, SHA-256, licence, attribution), extracts England to `<name>_england.csv` and cuts the sample. The runbook is [`docs/server.md`](../docs/server.md#6-where-datafull-comes-from); the code is `src/plotluck/sources.py`. Each sample folder keeps a copy of the provenance files in `data/sample/raw/`.

| Dataset | Path under data/ | Source URL | Licence | Sample cut |
|---|---|---|---|---|
| TripAdvisor European restaurants, England rows | `tripadvisor_england.csv` | [Kaggle](https://www.kaggle.com/datasets/stefanoleone992/tripadvisor-european-restaurants) | CC0 1.0 as listed on Kaggle; see caveat | Sample box |
| ONS Postcode Directory, August 2026, England | `onspd_england.csv` | [ONS Geoportal](https://www.arcgis.com/home/item.html?id=9e5a92a3cfb14dc7ad43d6ea7a7b8c7f) | OGL v3.0 | Sample box |
| Census 2021 P004, usual residents by postcode district | `p004_england.csv` | [Nomis](https://www.nomisweb.co.uk/sources/census_2021_pc) | OGL v3.0 | Districts in the ONSPD sample |
| OpenStreetMap restaurants and fast food, England | `osm_england.csv` | [Overpass API](https://overpass-api.de/) | ODbL 1.0 | Sample box |

**Sample box**: every row with coordinates inside latitude 51.49–51.51, longitude −0.12 to −0.08 (Southwark, the City and around; constant `SAMPLE_BBOX`). It has no randomness, so the files still join on district and location. Retrieval date for all four: 2026-10-17, by a laptop run of the same code. The server pull will replace these values.

Known data issue: some TripAdvisor rows are mis-geocoded. In the sample, `Waterloo Kitchen` has a Blackpool address but London coordinates.

## TripAdvisor European restaurants

- **Edition**: Kaggle `stefanoleone992/tripadvisor-european-restaurants`, version 1, updated 2021-05-18; scraped from tripadvisor.com in early May 2021. Raw: `raw/tripadvisor.zip` (one 680 MB CSV, 1,083,397 rows).
- **England filter**: `country == "England"`, giving 144,681 rows; 956 rows in the sample.
- **Kept columns**: `restaurant_link` (source ID), name, address, city, latitude, longitude, cuisines, `avg_rating`, `total_reviews_count`, `reviews_count_in_default_language`, the five category counts, `features`, `price_level`, `special_diets`, `vegetarian_friendly`, `vegan_options`, `gluten_free`. Values are copied unchanged: counts are strings like `347.0`, and `price_level` uses `€` symbols.
- **Review counts** (checked 2026-10-17 on the England rows, for #42): 133,252 rows have all five category counts, and in every one their sum equals `reviews_count_in_default_language`, but only 89,367 match `total_reviews_count`; 11,653 rows lack `avg_rating` or `total_reviews_count`.
- **Licence caveat**: Kaggle lists the dataset as CC0, but the content was scraped from TripAdvisor, whose terms restrict reuse. The team accepted this for a small committed sample (2026-10-17). Do not publish the full file or redistribute names and addresses beyond the sample.
- **Attribution**: TripAdvisor European restaurants, Stefano Leone (Kaggle).

## ONS Postcode Directory (ONSPD)

- **Edition**: August 2026. Raw: `raw/onspd.zip` (254 MB); the extract reads only `Data/ONSPD_AUG_2026_UK.csv`.
- **England filter**: country code `E92000001`, giving 2,279,344 postcodes, terminated ones included; 5,281 in the sample, across 13 districts.
- **Columns**: `pcds`, `district` (the outward code, `pcds` before the space), `lat`, `long`, `country_code`, `region_code`, `doterm` (blank while live), `imd25ind` (English IMD 2025 rank). ONSPD names columns by edition (`ctry26cd`); the extract finds them by pattern and writes fixed names.
- **Attribution** (required): Contains OS data © Crown copyright and database right 2026. Contains Royal Mail data © Royal Mail copyright and database right 2026. Source: Office for National Statistics licensed under the Open Government Licence v.3.0.

## Census 2021 P004

- **Edition**: Census 2021, census day 2021-03-21, postcode-district geography as published by Nomis. Raw: `raw/p004.csv` (`pcdd_p004.csv`, England and Wales).
- **England filter**: districts with at least one English postcode in the ONSPD extract, giving 2,116 districts; 11 in the sample (EC3P and SE1P have no residents row). Cross-border districts stay, and their counts include Welsh residents.
- **Columns**: `district`, `residents`.
- **Attribution**: Source: Office for National Statistics licensed under the Open Government Licence v.3.0.

## OpenStreetMap restaurants

- **Edition**: live OSM through the public Overpass API, queried inside the `GB-ENG` area in the 34 one-degree tiles that hold an English postcode. `snapshot` in the provenance is the oldest tile's `timestamp_osm_base`. Raw: `raw/osm.json` (merged tiles).
- **Filter**: `amenity=restaurant` or `amenity=fast_food` (no other district-level OSM counts are agreed yet); nodes, ways and relations, with ways and relations at their centre point. The England row count is set by the first server pull: the public Overpass server was too busy to finish a full pull on 2026-10-17. The sample's 452 rows came from one query of the sample box alone, which gives the same rows as filtering the full pull (its provenance says `"tiles": 1`).
- **Columns**: `osm_type`, `osm_id`, `amenity`, `cuisine` (blank when untagged), `name`, `lat`, `lon`.
- **Attribution** (required): © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
