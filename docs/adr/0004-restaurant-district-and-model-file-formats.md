# Restaurant, district and model-file formats and split policy

On 2026-10-17 the team fixed the data schemas for the `restaurants` table, the `districts` table, the model-file export contract, and the evaluation split policy for the Plotluck MVP.

## Decisions

### 1. File formats and privacy
- Tables are stored as clean UTF-8 CSV files (`data/sample/restaurants.csv` and `data/sample/districts.csv` with full versions under `data/full/`).
- Per [ADR 0003](0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md), raw Tripadvisor rows stay server-only on LinuxONE. The committed sample is synthetic.
- All individual identifying fields (restaurant name, source link/id, full street address, and full postcode) are stripped. The sole geographic identifier retained on restaurant rows is the outward code `postcode_district` (e.g. `SE15`).

### 2. Schema: `restaurants.csv` (15 columns)
- `postcode_district`: string outward postcode code (e.g. `SE15`, `E1`).
- `cuisines`: raw comma-separated cuisine descriptors from the source (e.g. `"Italian, Pizza"`).
- `price_band`: string trait (e.g. `"$"`, `"$$"`, `"$$$"` or empty if unknown).
- `is_chain`: 0/1 trait, 1 when the restaurant's name appears 3 or more times in England. Computed at ingest on LinuxONE before names are stripped.
- `vegetarian_friendly`, `vegan_options`, `gluten_free`: 0/1 diet-flag traits from the source, empty when the source doesn't say.
- `avg_rating`: float star rating (1.0 to 5.0).
- `total_reviews`: integer total review count ($n_{total}$).
- `count_excellent`, `count_very_good`, `count_average`, `count_poor`, `count_terrible`: integer category counts summing to $n_{default}$ per [Issue #47](https://github.com/AdrielAu/PlotLuck/issues/47).
- `review_success_label`: float in $[0, 1]$ computed via the [ADR 0002](0002-review-based-success-label.md) formula.

### 3. Schema: `districts.csv` (7 mandatory columns, extensible)
- `postcode_district`: string primary key outward code (e.g. `SE15`).
- `centroid_lat`: float mean latitude of the district's postcodes.
- `centroid_lon`: float mean longitude of the district's postcodes.
- `total_restaurants`: integer count of restaurants located in that district (derived from `restaurants.csv`).
- `population`: integer usual residents (Census 2021 P004).
- `deprivation_index`: float mean IMD deprivation rank (ONSPD `imd25ind`).
- `commercial_rent_index`: float commercial cost proxy (median VOA rateable value per square metre for retail/food premises).
- Additional economic or demographic columns may be appended as research settles.

Amended 2026-10-17: [ADR 0005](0005-district-demographics-and-tourism-context.md) adds average age, five ethnicity shares, two Census sex shares, separate attraction/hotel counts and most-common-category summaries. Bundle version 2 declares the expanded numeric input order; summaries are not neural-network inputs.

Amended 2026-10-17 ([#130](https://github.com/AdrielAu/PlotLuck/issues/130)): `radius_km` is appended as the last column, a positive float giving the radius of the map circle that roughly covers the district. It is the distance from the centroid within which 90% of the district's ONSPD postcode points lie, on a flat map local to the district, and at least 0.3 km. It is a display value, not an NN1 input, so the model and scores are unchanged, and the bundle version stays 2 (the site ignores extra CSV columns). No district polygons are shipped. No permitted OS/ONS postcode-district boundary exists (OS Code-Point with Polygons is a licensed product), so the radius comes from ONSPD points already used for the centroid.

Cuisine supply per district is aggregated from `restaurants.csv` on LinuxONE and published as `district_cuisine_supply.csv` (`postcode_district`, `cuisine_group`, `restaurants`), because the browser cannot read `restaurants.csv`. [ADR 0003](0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md) allows publishing these counts and `total_restaurants`.

### 4. Model export interface: `model.json`
- Saved as JSON containing `features` (restaurant input names and district input names), `transforms` (numeric normalization means/stds and categorical vocabularies), `layers` (nested weight matrices and bias vectors), and `activations`.
- Sized and evaluated by a ~25-line pure JavaScript forward pass running client-side in the browser on GitHub Pages.
- Layer topology for the MVP: inputs → Dense 64 ReLU → Dense 32 ReLU → Dense 1 sigmoid. Dropout and weight decay are used in training only, so the forward pass is plain dense layers. See [Choose NN1's architecture for the MVP](https://github.com/AdrielAu/PlotLuck/issues/62#issuecomment-6233523453) for inputs, transforms and training.

### 5. Evaluation splitting policy
- Train/test validation splits must be grouped strictly by `postcode_district` (spatial Group-KFold).
- All restaurants belonging to a given postcode district must sit entirely within the training split or entirely within the test/validation split to prevent spatial data leakage.

## Consequences

- An upstream mapping ticket must be created to collapse raw descriptors (e.g. "Pizza", "Pasta" -> "Italian") before NN1 feature vectorization.
- Ingestion, baseline feature creation, and frontend map rendering can immediately develop against the committed synthetic stubs in `data/sample/`.

Decided in [Fix the restaurant, district and model-file formats](https://github.com/AdrielAu/PlotLuck/issues/38). The trait columns, published supply counts and layer topology were added in [Choose NN1's architecture for the MVP](https://github.com/AdrielAu/PlotLuck/issues/62).
