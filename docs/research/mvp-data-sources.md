# Which source gives one row per London restaurant, and which district features join fast?

Issue: #34. Researched 2026-10-17. Facts come from first-party pages, APIs and files, which I fetched or queried directly. Counts marked *(queried)* come from live queries run on 2026-10-17. Docs read through a summarising fetcher are marked *(docs)*. Nothing here has been built yet.

## Short answer

- **Restaurant rows: OSM.** It is the only source that gives cuisine and location in one free pull, under 2 minutes with no sign-up. One Overpass query returns about 15.4k `restaurant` + `fast_food` places in Greater London, and about 11.9k of them carry `cuisine=` *(queried)*.
- **The label: no source gives a fast one.** OSM has no open or close dates. Only Companies House (incorporation and dissolution dates, no cuisine) and Foursquare OS Places (`date_created` and `date_closed`, cuisine via category) carry lifecycle fields. Each costs more than the 2-hour budget to join (see [Label fields](#label-relevant-fields)).
- **Postcode district: derive it from ONSPD.** Snap each restaurant's lat/long to its nearest live ONSPD postcode, then take the outward code (`pcds` up to the space). OSM `addr:postcode` alone covers only about 71% of rows.
- **Fastest district features, in order:**
  1. Census 2021 usual residents per postcode district (Nomis P004, a 24 KB CSV keyed by district).
  2. IMD 2025 rank, which ONSPD already carries per postcode (`imd25ind`), so no extra file is needed. Aggregate it to districts.
  3. Restaurant supply per district, counted from the OSM pull itself (total and per cuisine, per capita).
  4. Census 2021 adults by 5 ethnic groups per postcode district (ONS CT21_0360, a 248 KB xlsx), as the cultural-demand feature.

  TfL entries and exits are slower: the station file has no coordinates or postcodes.

## Sources

### OpenStreetMap (`amenity=restaurant|fast_food`, `cuisine=`)

- **Licence:** ODbL ([osm.org/copyright](https://www.openstreetmap.org/copyright)). Attribution is required, and a derived database must stay under ODbL.
- **Access:** an Overpass API query, or the Geofabrik extract `greater-london-latest.osm.pbf` (123 MB; the gpkg is 203 MB; updated daily) ([Geofabrik](https://download.geofabrik.de/europe/united-kingdom/england/greater-london.html)).
- **Greater London counts** *(queried, Overpass, area `name=Greater London`, admin_level 5)*:

  | Filter | Count |
  |---|---|
  | `amenity=restaurant` | 9,127 |
  | `restaurant` with `cuisine` | 6,649 |
  | `amenity=fast_food` | 6,280 |
  | `fast_food` with `cuisine` | 5,253 |
  | `restaurant\|fast_food` with `addr:postcode` | 10,888 |
  | `restaurant\|fast_food` with `brand:wikidata` | 3,030 |
  | `restaurant\|fast_food` with `takeaway` | 3,794 |
  | `restaurant\|fast_food` with `start_date` | 62 |

  The area `ISO3166-2=GB-LND` matches only the City of London (296 restaurants), so use the Greater London admin boundary.
- **Cuisine values:** lowercase and singular. Multiple values are separated by `;`, for example `italian;pizza` ([Key:cuisine](https://wiki.openstreetmap.org/wiki/Key:cuisine)). Greater London has 323 distinct values. The top ones are pizza 1264, indian 1189, chicken 1100, chinese 961, sandwich 833, burger 824, italian 745, kebab 587, fish_and_chips 559, japanese 405, then thai, turkish, caribbean, lebanese, vietnamese and korean (each 150–280) *(queried)*. A small mapping to about 15–25 cuisine classes is needed.
- **Postcode district:** derived from lat/long by nearest ONSPD postcode (see below).
- **Dates and status:** none in practice (`start_date` is on 62 places). A current snapshot only shows survivors.
- **Traits:** `takeaway=*`, `delivery=*` and `diet:*` ([Key:cuisine](https://wiki.openstreetmap.org/wiki/Key:cuisine)), `brand`/`brand:wikidata` as a chain flag, and `amenity=fast_food` vs `restaurant` as a format flag.

### FSA Food Hygiene Rating Scheme

- **Licence:** OGL v3.0. FHRS images and logos are excluded ([FSA about our services](https://www.gov.uk/government/organisations/food-standards-agency/about/about-our-services)).
- **Access:**
  - Daily XML per local authority: `https://ratings.food.gov.uk/api/open-data-files/FHRS<code>en-GB.xml`. The London region has 33 authorities, and Westminster is code 533.
  - One all-UK CSV: `https://safhrsprodstorage.blob.core.windows.net/opendatafileblobstorage/FHRS_All_en-GB.csv` ([FSA open data](https://ratings.food.gov.uk/open-data)).
  - The API needs the header `x-api-version: 2` and no key ([API help](https://api.ratings.food.gov.uk/help)).
  - The old `www.food.gov.uk/api/open-data-files/...` path now returns 404 *(queried)*.
- **Fields** (from the Westminster file, extract 2026-10-16, 5,762 rows, 5.7 MB) *(queried)*: `FHRSID`, `BusinessName`, `BusinessType`, `BusinessTypeID`, `AddressLine1-3`, `PostCode`, `RatingValue`, `RatingDate`, `Scores/{Hygiene,Structural,ConfidenceInManagement}`, `NewRatingPending`, `Geocode/{Longitude,Latitude}`.
- **Cuisine:** none.
- **Postcode:** yes, a full postcode, so the district is the outward code.
- **Dates:** `RatingDate` is the last inspection only. There is no opening date. Closed premises drop out of the file, so a single snapshot gives no closures.
- **Traits:** `BusinessType` splits Restaurant/Cafe/Canteen (3,531 in Westminster) from Takeaway/sandwich shop (293) and Pub/bar/nightclub (159). That is a sit-in vs takeaway signal. The hygiene rating could also be a feature.

### Companies House (SIC 56101/56102/56103)

- **Licence:** the bulk page says only that the data is "provided free of charge and will not be supported". I found no named licence on it.
- **Access:**
  - The monthly "Free Company Data Product" is a ZIP of CSV: one 471 MB file, or 7 parts of 50–70 MB. The 2026-10-01 edition is current ([download page](https://download.companieshouse.gov.uk/en_output.html)).
  - Dissolved companies need the REST API advanced search (`/advanced-search/companies`, with an API key). It takes the filters `sic_codes`, `company_status`, `location`, `incorporated_from/to` and `dissolved_from/to`, returns at most 5,000 per request, and pages with `start_index` ([API spec](https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/search/advanced-company-search)).
- **Fields** *(queried, part 7 header)*: `CompanyName`, `CompanyNumber`, `RegAddress.PostCode`, `CompanyCategory`, `CompanyStatus`, `DissolutionDate`, `IncorporationDate`, `SICCode.SicText_1..4` (formatted `56101 - Licensed restaurants`), `Accounts.*`, `URI`, `PreviousName_*`.
- **Live companies only:** the statuses seen in part 7 were Active, Active - Proposal to Strike off, Liquidation, In Administration and similar. None was "Dissolved" *(queried)*. A survival label therefore needs the API for dissolved companies.
- **Size:** part 7 (one of the 7 parts) holds 20,923 SIC 5610x rows across the UK, of which 3,243 have an inner-London-area postcode (E/EC/N/NW/SE/SW/W/WC) *(queried)*. London-wide live 5610x is likely in the low tens of thousands. That is an extrapolation and has not been counted.
- **Cuisine:** none. You could only guess it from the company name.
- **Postcode:** the registered office, which is often an accountant's address rather than the restaurant's premises. This is a known weakness for district features.
- **Dates and status:** this is the only source with a true incorporation date and dissolution date, plus distress statuses such as strike-off proposal, liquidation and administration.
- **Traits:** `56101` licensed vs `56102` unlicensed vs `56103` takeaway. One company may also run several sites, which is a weak chain signal.

### Foursquare OS Places

- **Licence:** Apache 2.0 ([access docs](https://docs.foursquare.com/data-products/docs/access-fsq-os-places)).
- **Access:**
  - A gated Hugging Face dataset (login plus accepting the contact-sharing terms). It is Parquet under `release/dt=YYYY-MM-DD/places/`, 263 GB in total ([HF](https://huggingface.co/datasets/foursquare/fsq-os-places)).
  - Alternatively, the Foursquare Places Portal Iceberg catalogue (sign up, then use a token with DuckDB, Spark or PyIceberg) *(docs)*.
- **Schema:** 26 columns, including `name`, `latitude`/`longitude`, `postcode`, `locality`, `country`, `date_created`, `date_refreshed`, `date_closed`, `fsq_category_ids`, `fsq_category_labels` and `unresolved_flags`. There is no `chains` column ([schema](https://docs.foursquare.com/data-products/docs/places-os-data-schema)).
- **Caveats on the dates:** `date_created` is when the place entered the database, "not necessarily" its opening date. `date_closed` is when Foursquare marked it closed, which may differ from the real closing date *(docs)*.
- **Cuisine:** via category labels. Restaurant categories are cuisine-specific in the Foursquare taxonomy, but I did not inspect the label strings.
- **Postcode:** yes.
- **Dates and status:** `date_created`, `date_closed` and `date_refreshed`. This is the only source with cuisine and a closure signal in one row.
- **Cost:** it is gated, and filtering the UK out of 263 GB is unlikely to fit in 2 hours. Remote DuckDB reads over HF could work but are untested.

### ONS Postcode Directory (ONSPD)

- **Licence:** ONS geography licences ([ons.gov.uk/methodology/geography/licences](https://www.ons.gov.uk/methodology/geography/licences)). The product contains Royal Mail, OS and ONS IP; GB postcode data is free under OGL with attribution.
- **Access:**
  - A CSV zip of about 235 MB for the May 2026 edition ([data.gov.uk](https://ckan.publishing.service.gov.uk/dataset/ons-postcode-directory-may-2026)).
  - An ArcGIS hosted table, August 2026 edition, which is the newest *(queried)*: `https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/ONS_Postcode_Directory_(August_2026)_(Hosted_Table)/FeatureServer/0`. It returns at most 1,000 records per query.
- **Fields** *(queried)*: `pcd7`, `pcd8`, `pcds`, `dointr`, `doterm`, `lad26cd`, `rgn26cd`, `lsoa21cd`, `msoa21cd`, `oa21cd`, `lat`, `long`, `imd20ind`, `imd25ind` and more. For example, SE1 7PB has `lsoa21cd=E01003013` and `imd25ind=23019` (a rank).
- **London postcodes:** 180,965 live ones (`rgn26cd='E12000007'`, `doterm IS NULL`) *(queried)*.
- **Use:**
  - Postcode district = `pcds.split(' ')[0]`.
  - District centroid = mean lat/long of its live postcodes.
  - Restaurant-to-district = nearest live postcode (a KD-tree over about 181k points).

### ONS Census 2021

- **Licence:** OGL v3.0 ([CT21_0360 page](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/adhocs/2556ct210360census2021)).
- **P004, usual residents by postcode district:** `https://www.nomisweb.co.uk/output/census/2021/pcdd_p004.csv` ([Nomis source page](https://nmweb.dur.ac.uk/sources/census_2021_pc)).
  - 2,302 districts, 24 KB, columns `Postcode Districts,Count`. For example, E1 has 78,961, CR0 170,304 and W1D 933 *(queried)*.
  - It joins directly on the district key. P001/P002 (residents and households per full postcode, 51 MB and 15 MB) also exist.
- **CT21_0360:** usual residents aged 18+ by sex, 4 age bands and 5 main ethnic groups, for postcode districts in England and Wales. Released 2025-01-08 as one 248 KB xlsx: `https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/populationestimates/adhocs/2556ct210360census2021/ct210360census2021.xlsx`. Five broad groups are coarse for cuisine demand, but they are already at district level.
- **Finer data:** ethnic group or country of birth at finer levels only come at OA/LSOA/MSOA. Reaching them means joining through ONSPD `lsoa21cd`, which is slower.

### English Indices of Deprivation

- **Licence:** OGL v3.0.
- **IoD 2025:** published 2025-10-30 (updated 2025-11-17) and covers 33,755 LSOAs, the LSOA 2021 count. File 7 is a 9.44 MB CSV of all ranks, scores and deciles; File 1 is the IMD xlsx ([gov.uk IoD2025](https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025)).
- **Prefer 2025 over 2019:** IoD 2019 ([gov.uk](https://www.gov.uk/government/statistics/english-indices-of-deprivation-2019)) is superseded and sits on 2011 LSOAs.
- **Fastest route:** skip the file. ONSPD `imd25ind` already gives the IMD 2025 rank per postcode, so the district feature is the mean (or median) of that rank over the district's postcodes, ideally population-weighted with P001. Domain scores, such as income, need File 7 joined on `lsoa21cd`.

### TfL station entries and exits

- **Access:** annual xlsx files under `https://s3-eu-west-1.amazonaws.com/crowding.data.tfl.gov.uk/Annual Station Counts/<year>/`. The latest is `2025/AC2025_AnnualisedEntryExit_public.xlsx` (106 KB, LU/LO/DLR/Elizabeth line) *(queried)*.
- **Columns:** Mode, MNLC, MASC, Station, Coverage, Source, then day-type and annualised entries and exits. There are no coordinates or postcodes.
- **Licence:** © TfL. TfL open data is normally reused under the TfL transport data terms, which I did not verify.
- **Cost:** joining to a district needs station coordinates from somewhere else (TfL StopPoint API or NaPTAN), then nearest-district matching or a buffer. It is the slowest of the feature options.

## Label-relevant fields

| Source | Opening | Closing / status | Inspection | Cuisine |
|---|---|---|---|---|
| OSM | (`start_date` on 62) | none (snapshot) | none | yes |
| FSA | none | none (closed premises vanish) | `RatingDate` (last only) | none |
| Companies House | `IncorporationDate` | `CompanyStatus`, `DissolutionDate` (dissolved only via API) | none | none (SIC class only) |
| Foursquare OS | `date_created` (DB entry, not opening) | `date_closed`, `unresolved_flags=closed`, `date_refreshed` | none | via category |

## Observable traits

| Trait | Where |
|---|---|
| Takeaway vs sit-in | OSM `amenity=fast_food` vs `restaurant` and `takeaway=*`; FSA `BusinessType`; CH 56103 vs 56101/56102 |
| Licensed (alcohol) | CH 56101 vs 56102 |
| Chain vs independent | OSM `brand:wikidata` (3,030 places); otherwise name frequency across rows |
| Diet (vegan, halal) | OSM `diet:*` |
| Price band | not found in any source checked |

## Recommended MVP build (about 2 hours)

1. Run one Overpass query for Greater London `restaurant|fast_food` with `out center tags`, keeping `cuisine`, `takeaway`, `brand:wikidata` and lat/long. Drop places with no cuisine and map cuisine values to classes (about 20 minutes).
2. Pull London live postcodes from ONSPD (`pcds`, `lat`, `long`, `lsoa21cd`, `imd25ind`). Paging the ArcGIS table at 1,000 rows per call takes about 181 calls, so the CSV zip filtered on `rgn26cd` is probably faster on the server. Derive the district (about 20 minutes).
3. Snap restaurants to their nearest postcode to get the district, and build the district table (about 30 minutes):
   - P004 population
   - mean `imd25ind`
   - OSM restaurant count per capita, total and for the same cuisine
   - CT21_0360 ethnic shares
   - centroid lat/long
4. Label: the MVP has no real survival label in this budget. Options, fastest first:
   - **(a)** A placeholder label or self-supervised target, so the pipeline runs end to end. Swap in the real label later.
   - **(b)** Foursquare `date_closed` for London restaurants, if the gated access and a remote DuckDB filter work quickly. This is the best cuisine-plus-closure source.
   - **(c)** Companies House 5610x dissolved and live companies via the API. This gives a true survival label but has no cuisine and uses registered-office postcodes.

   Fuzzy name-plus-postcode joins between sources (OSM↔FSA↔CH) are possible but won't fit inside 2 hours.

Untested: Foursquare category label strings, and how Foursquare's `date_closed` coverage looks in London.
