# District features across the four UK nations

Research for [Which district features cover all four UK nations comparably?](https://github.com/AdrielAu/PlotLuck/issues/45). Checked 17 October 2026. This is evidence and a proposed policy, not a settled data contract or implementation.

## Findings

Population is available for all four nations at postcode level or directly by postcode district. The latest censuses refer to 2021 in England, Wales and Northern Ireland, and 2022 in Scotland. Comparable definitions therefore do not imply a common reference date. Deprivation indices exist everywhere, but their ranks do not form a comparable UK scale. OSM offers a common collection method rather than guaranteed uniform completeness. Ethnicity requires both category harmonisation and, outside England and Wales, a geographical allocation method. Sources and limits follow.

### Population

| Nation | Official source and reference year | Geography and district construction | Licence |
|---|---|---|---|
| England | [Nomis postcode resident estimates, P004](https://www.nomisweb.co.uk/sources/census_2021_pc), Census Day 21 March 2021 | Published postcode-district totals; May 2021 postcode geography; districts with at least one usual resident. P001 provides postcode counts if national components are needed. | Census statistics under OGL; retain source acknowledgement. |
| Wales | [Same Nomis release](https://www.nomisweb.co.uk/sources/census_2021_pc), 2021 | Same publication and definition as England. A cross-border district can contain residents from both nations; do not infer country from the outward code. | Same as England. |
| Scotland | [NRS 2022 Census Geography Products](https://www.nrscotland.gov.uk/publications/2022-census-geography-products/), postcode population lookup released August 2024 | Usual resident population for each 2022 postcode. Sum population counts by outward code; this does not require allocating OA population equally among postcodes. | Census indexes/lookups supplied under OGL with NRS and applicable PAF acknowledgements; see [NRS licensing](https://www.nrscotland.gov.uk/publications/geography-products-licensing-and-pricing/). |
| Northern Ireland | [NISRA person and household estimates for postcodes](https://www.nisra.gov.uk/publications/census-2021-person-and-household-estimates-postcodes-northern-ireland), Census 2021; published 29 February 2024 | Published unit postcode, sector and district estimates of usual residents by sex and households. Prefer the published district total. | NISRA describes released census tables as OGL in its [outputs prospectus](https://www.nisra.gov.uk/statistics/outputs-prospectus/release-plans). |

These are resident populations, not restaurant catchments, daytime footfall or current-year population estimates. The source definitions identify the resident population; treating it as demand is a modelling assumption. Nomis defines usual residence using the twelve-month residence/intention rule, not everyone present at a location. [Nomis definitions](https://www.nomisweb.co.uk/sources/census_2021_pc).

NRS publishes a frozen postcode-to-OA index as well as population counts. Its April 2022 frozen postcode geography and current postcodes are different vintages. Scottish postcode products can contain split postcodes: the official Scottish Statistics Postcode Lookup sums the split components when making a unique whole-postcode record. Follow the selected product's representation and never count both a whole record and its split components. [NRS geography construction](https://www.nrscotland.gov.uk/publications/geography-census-2022-how-the-census-geographies-were-created-information-note/), [NRS postcode lookup methodology](https://www.nrscotland.gov.uk/publications/geography-scottish-statistics-postcode-lookup-information-note/).

**Verification limit:** the Scottish CSV is linked publicly, but its row contents and accompanying statistical disclosure notes were not inspected in this investigation. Do not describe the summed result as an exact unperturbed census district total until ingestion checks missing/suppressed values, split handling and reconciliation against published population controls. Do not turn a suppression marker or a missing postcode into zero.

### Deprivation

| Nation | Official index | Native geography | Interpretation |
|---|---|---|---|
| England | [English Indices of Deprivation 2025](https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025/english-indices-of-deprivation-2025-statistical-release) | 2021 LSOAs; 33,755 areas | Relative deprivation within England. |
| Wales | [WIMD 2025](https://www.gov.wales/welsh-index-multiple-deprivation-wimd-2025-results-report-overall-index-html) | LSOAs; 1,917 areas | Relative deprivation within Wales. |
| Scotland | [SIMD 2020v2](https://www.gov.scot/collections/scottish-index-of-multiple-deprivation-2020/) | 2011 data zones; 6,976 areas | Use revised v2 ranks, not the superseded original overall ranks. |
| Northern Ireland | [NIMDM 2017](https://www.nisra.gov.uk/statistics/people-and-communities/deprivation-and-poverty) | 2011 super output areas | Remains the official NI measure on the checked source; it is not based on 2021 Data Zones. |

Index years are publication vintages, not a promise that every underlying indicator was measured in that year. The English release explicitly rules out comparison with other UK countries; the [Welsh usage guide](https://www.gov.wales/sites/default/files/statistics-and-research/2025-12/welsh-index-of-multiple-deprivation-wimd-2025-infographic_1.pdf) does likewise. Turning ranks into within-nation percentiles creates comparable *positions in each nation's distribution*, not comparable absolute deprivation. Pooling them as one UK severity measure would be a policy choice unsupported by those indices.

**Correction to the London-source assumption:** ONSPD deprivation is not inherently England-only. The [February 2025 ONSPD guide](https://www.ons.gov.uk/file?uri=%2Faboutus%2Ftransparencyandgovernance%2Ffreedomofinformationfoi%2Fukpostcodesandcorrespondinglocalauthorityfebruary2025%2Fonspduserguidefeb2025.pdf), section 41 and the IMD field specification, documents England 2019, Wales 2019, Scotland 2020 and NI 2017 ranks in one `IMD` field. Ranks are unique within country, and zero can mean no information. A later field named `imd25ind` must be checked against its own edition's dictionary; it must not be assumed to contain England 2025 values everywhere or to be interchangeable with the earlier field. Existing cross-nation coverage does not solve comparability.

The publications are government data under OGL, subject to stated exceptions and attribution: [GOV.WALES copyright](https://www.gov.wales/copyright-statement), the English release footer, [Scottish Government information policy](https://www.gov.scot/publications/public-sector-information-regulations-statement-of-public-task/), and NISRA publication notices. Geographic lookup products can have separate third-party restrictions; a statistics licence does not license every postcode boundary or coordinate product.

### OSM supply

OSM is one source across all four nations, with shared tags and ODbL licensing. A common snapshot is obtainable through [Geofabrik's Britain and Ireland extract](https://download.geofabrik.de/europe/britain-and-ireland.html); its [Europe catalogue](https://download.geofabrik.de/europe.html) distinguishes Great Britain from Ireland and Northern Ireland. Using only a Great Britain extract misses NI. Using Britain and Ireland requires excluding the Republic of Ireland and other out-of-scope territories.

The OSM community itself treats completeness, tagging, temporal consistency and positional accuracy as quality concerns. No source inspected establishes equal restaurant completeness in all four nations. Consequently a zero count means no qualifying *mapped* object was found, not proven absence of restaurants. [OSM quality assurance](https://wiki.openstreetmap.org/wiki/Quality_assurance), [Humanitarian OSM Team quality aspects](https://wiki.openstreetmap.org/wiki/Humanitarian_OSM_Team/top_10_data_quality_aspects).

**Proposed collection policy:** freeze one snapshot and one inclusion/tag vocabulary across nations; deduplicate nodes/ways/relations representing the same business; report postcode assignment and cuisine-tag completeness separately. Prefer an object's valid postcode where present. Any coordinate-to-district fallback needs an explicit, licensed allocation method; nearest postcode centroid is an approximation, not a postcode boundary lookup. Track unmatched objects rather than silently discarding them. Derive raw supply and, only with a valid nonzero population denominator, supply per resident. These are design recommendations, not verified properties of the extract.

OSM data is ODbL, not OGL. Retain source/licence notices and visible attribution for publicly used maps or outputs, and assess redistribution of the derived database under the applicable ODbL terms. [OSM copyright](https://www.openstreetmap.org/copyright), [OSMF attribution guidance](https://osmfoundation.org/wiki/Attribution_Guidelines).

### Ethnicity: available, but not an interchangeable district feature

| Nation | Source | Reference and geography | Outstanding work |
|---|---|---|---|
| England and Wales | [ONS CT21_0360](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/adhocs/2556ct210360census2021) | Census 2021; published January 2025; postcode districts; five broad ethnic groups crossed with sex and age | **Adults aged 18+ only.** It is not the ethnic composition of all residents. Sum disjoint categories, avoiding published subtotal double counting. |
| Scotland | [2022 OA topic tables](https://www.scotlandscensus.gov.uk/documents/2022-output-area-data/) | Census 2022; ethnicity published at OA geography | Category crosswalk and OA-to-district allocation; this investigation did not verify a directly equivalent published district table. |
| Northern Ireland | [NISRA MS-B01 flexible table](https://build.nisra.gov.uk/en/custom/data?d=PEOPLE&v=DZ21&v=ETHNIC_GROUP_INTERMEDIATE) | Census 2021; Data Zones; all usual residents | Category crosswalk and Data Zone-to-district allocation, plus the same age universe if compared to CT21_0360. |

ONS explicitly describes ethnicity across the nations as broadly comparable and warns that different categories prevent direct comparison. For example, the NI output lists Irish Traveller and Roma separately from White and includes Filipino; a five-group England/Wales column layout cannot simply be copied onto that output. [ONS ethnic-group comparability](https://www.ons.gov.uk/census/census2021dictionary/variablesbytopic/ethnicgroupnationalidentitylanguageandreligionvariablescensus2021/ethnicgroup), [NI actual categories](https://build.nisra.gov.uk/en/custom/data?d=PEOPLE&v=DZ21&v=ETHNIC_GROUP_INTERMEDIATE).

Census public outputs are under OGL: see the ONS table footer, [Scotland's census reuse statement](https://www.scotlandscensus.gov.uk/documents/data-protection-impact-assessment/html), and NISRA prospectus above. Scottish multivariate outputs are perturbed, so cells may not sum to totals; published disclosure controls must be retained rather than reverse engineered. [NRS disclosure notice](https://www.scotlandscensus.gov.uk/documents/bulk-download-files-multivariate-data/).

## Aggregation and cross-border rules to decide

These are proposed safeguards inferred from the sources, not a ready-made official district methodology:

1. Key postal districts by normalised outward code, retaining national components where needed. A district is a postal geography, not an administrative country. Never assign country from area letters or from its displayed centroid. The ONSPD guide documents postal/administrative boundary straddling and single-point assignments.
2. Use published district counts or actual postcode population counts for population. Combine nonoverlapping national contributions to shared outward codes; do not overwrite one with another. Retain census year by component, particularly for any England/Scotland crossing.
3. An OA/LSOA/Data Zone lookup is not a population-weighted crosswalk. Never divide its population equally by its number of postcodes: postcode populations differ, and this can count a small area's entire population several times. Allocate only with documented weights and label results estimates. For ethnicity, even weighting by postcode total population assumes ethnic composition is uniform inside the source area; it does not reveal postcode ethnic counts.
4. For deprivation, use the correct nation's source geography and vintage. If retained later, first define the intended district summary (for example population share living in a nationally defined most-deprived group). Explain it as national-relative context; neither averaging ranks nor averaging national percentiles makes a UK absolute index.
5. Match census geography to the correct frozen lookup before joining contemporary restaurant postcodes. Retired/new postcodes and missing matches require coverage reporting. Statistical best-fit and direct point-in-polygon lookups differ; choose deliberately. [ONS geography methods](https://onsgeo.github.io/geospatial-training/docs/practical_geog_and_stats).
6. Keep statistical data separate from restricted spatial products. NRS frozen postcode boundaries/grid references have PSGA/INSPIRE restrictions although its census lookups are OGL. NISRA's [Central Postcode Directory](https://www.nisra.gov.uk/support/geography/central-postcode-directory) requires NIMA eligibility or a product licence; its public description does not make it an unrestricted OGL dependency for a static website.

## Recommended MVP policy (requires the ticket owner's decision)

Use resident population and consistently extracted OSM supply as the initial UK-wide district context, with population reference year and coverage metadata. UK-wide district context is feasible in principle, but comparable definitions do not establish equal measurement quality; check match rates and evaluation by nation before claiming equivalent performance. Restaurant training coverage is not established by this research.

Omit deprivation from the pooled MVP predictor contract rather than inventing a UK absolute scale or imputing England values for other nations. A later decision can admit an explicitly national-relative measure with its aggregation rule and country context. This recommendation prioritises a defensible shared meaning over a larger input list.

Keep ethnicity and the cultural demand gap after the MVP. CT21_0360 is geographically convenient only for England/Wales and describes adults; Scotland/NI require a harmonised age universe, group crosswalk and disclosed geographical estimation. None of these census tables alone establishes a mapping from ethnicity to cuisine demand. This recommendation matches the glossary's current exclusion of the cultural demand gap from MVP; it is not a finding that ethnicity data is unavailable elsewhere.

Before implementation, settle three concrete choices: acceptance of mixed 2021/2022 population vintages; the district/country-component key for cross-border records; and whether OSM coverage is adequate for the selected supply fields. The research establishes sources and constraints; it does not claim downloads have been profiled or district coverage validated.
