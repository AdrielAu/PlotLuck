# Offline geography proof (#114)

## Source and toolchain decision

Use the ONS-published built-up area (BUA) boundaries for settlements, local authority boundaries for administrative choices, and English regions for regional choices. Each feature already carries its GSS code, name, authoritative reference latitude/longitude and boundary. This removes a separate gazetteer-to-boundary name join. A settlement is explicitly labelled as a built-up area; it is never silently substituted with its local authority. These reference points are publisher-provided representative points, not restaurant locations or claims about a traditional town centre.

Pinned releases, queried on 2026-10-17:

| Release | Publisher item | Stable key |
|---|---|---|
| Built Up Areas (December 2022), GB BGG | [ONS item](https://www.arcgis.com/home/item.html?id=ad30b234308f4b02b4bb9b0f4766f7bb) | BUA22CD |
| Local Authority Districts (December 2025), UK BGC | [ONS item](https://www.arcgis.com/home/item.html?id=54b2a8f849f743aea669488cab415c8f) | LAD25CD |
| Regions (December 2025), England BGC | [ONS item](https://www.arcgis.com/home/item.html?id=b5ebf34a5ff3400aa93d4a3688ab38f7) | RGN25CD |

The acquisition command selects E-prefixed English GSS codes. Source features contain no separate country field. No roads or postcodes occur in these three boundary products. English-region membership uses its own boundary, rather than being inferred from a settlement name. Built-up areas crossing the national boundary and future source reclassifications require a reviewed release update.

The sources' licence metadata links to the [ONS geography licence conditions](https://www.ons.gov.uk/methodology/geography/licences): digital boundaries can be reused under OGL v3.0 with ONS and OS attribution. The catalogue carries that attribution; display it when the geography is used. This permission is independent of Tripadvisor training rights and competition eligibility.

All three polygon services use British National Grid (EPSG:27700). Acquisition explicitly requests `outSR=4326`; the publisher's ArcGIS service transforms polygons to WGS84 before caching. [ArcGIS query documentation](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/) specifies output projection and pagination. Published LAT/LONG attributes independently supply WGS84 reference points. Thus no pyproj, GDAL, Shapely or changes to the shared LinuxONE image are required. Downloading needs a network connection; a rebuild from the recorded cache needs only Python's standard library. Runtime lookup and membership need no network.

## Reproduce

Run from the repository root, with a public source cache outside git:

```powershell
python -m plotluck.geography --cache "$env:TEMP/plotluck-geography" --districts web/models/districts.csv --output web/models/geography.json --manifest "$env:TEMP/geography-sources.json" --verify-manifest docs/plans/nn2-geography-sources.json
```

Add `--offline` to disallow downloads. For the initial acquisition, omit `--verify-manifest`; review the result before replacing the committed pin manifest. Each cached response is pinned by exact URL, byte count and SHA256 in [the source manifest](nn2-geography-sources.json). ONS services can change even within a release. A hash mismatch stops publication instead of silently accepting a different boundary. Preserve the source cache to reproduce if the publisher later changes it. The full polygons remain in that external cache; the browser receives none.

## Browser contract

The complete prepared catalogue contains **7,396 places**: 7,091 English built-up areas, 296 English local authorities and nine regions. Actual UTF-8 JSON is **1,325,270 bytes**, or **251,039 bytes** with deterministic gzip (mtime 0). This measures full selected source coverage, rather than extrapolating a small city sample. Browsers may download the plain JSON if hosting does not compress it. Acquisition cached 182,120,172 bytes across 75 public source responses; those polygon responses are excluded from git and browser downloads. No GIS dependency was installed. A cache-only, hash-verified second build produced byte-identical browser output.

`geography.json` version 1 contains `districtGeometrySha256`, `attribution` and `places`. Each place contains `id`, `name`, `aliases`, `type`, `context`, `lat`, `lon` and sorted `districts` codes. Types are `settlement`, `local_authority`, `borough`, `city` and `region`. Settlement context is spatially joined to containing local authorities at its reference point, with both names and GSS IDs; duplicate names remain distinct choices.

Compatibility digest: sort district rows by postcode district, concatenate the exact CSV strings `code<TAB>centroid_lat<TAB>centroid_lon<LF>`, encode UTF-8, SHA256. Geometry changes require rebuilding geography alongside scoring outputs. A later consumer must reject incompatible assets; NN1 weights and numeric inputs are unchanged.

London uses typed choices: E12000007 is labelled Greater London with alias London; E09000001 is City of London with alias London. E09 boroughs are distinct administrative choices. The [ONS methodology](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/articles/townsandcitiescharacteristicsofbuiltupareasenglandandwales/census2021) treats London differently from other settlements; the catalogue retains the source definitions rather than manufacturing a London settlement polygon.

District membership means the district centroid is inside or exactly on the chosen polygon boundary. Polygon holes exclude their interior but include their boundary. Multi-polygons are supported. Bounding boxes avoid testing every district against every polygon edge. A district can overlap the selected area and still be excluded if its centroid lies outside. Scores continue to describe the whole district. Empty memberships remain valid; they must never silently expand to a larger search area.

The prepared data demonstrates why typed choices matter: Manchester local authority E08000003 contains 23 scoring centroids, while Manchester built-up area E63001295 contains 20. The name alone cannot establish equivalent search scopes. Greater London contains 299 scoring centroids; City of London contains 17 in this bundle.

## Independent known answers and limitations

Publisher spatial queries (`geometryType=esriGeometryPoint`, `inSR=4326`, `spatialRel=esriSpatialRelIntersects`) independently verified these published scoring centroids on 2026-10-17:

| District | WGS84 longitude, latitude | Boundary returned |
|---|---|---|
| M1 | -2.23671, 53.477701 | Manchester BUA E63001295 |
| NW5 | -0.144758, 51.551546 | Camden E09000007 |
| EC4V | -0.100219, 51.512628 | City of London E09000001 |

These expectations are retained in a public-source test fixture. Synthetic tests additionally exercise exact outer/hole edges, overlap-with-centroid-outside, invalid projected coordinates and non-English filtering. They do not need a network connection.

BUA boundaries are generalised grid definitions, and LAD/region boundaries are coastline-clipped and generalised at 20m. Source projection, generalisation and the six-decimal scoring centroids bound practical precision; edge-inclusive means the supplied coordinates, not cadastral accuracy. The authoritative reference point may differ from a user's intended near-search origin, so show and confirm the place/radius. A small reviewable alias list covers London; colloquial aliases and fuzzy matching remain the lookup integration's responsibility. This proof does not claim coverage of every colloquial neighbourhood.
