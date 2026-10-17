# NN1 ranking revamp

## Reproduced problem

Run `PYTHONPATH=src python -m plotluck.ranking_audit web/models` against the
published full-data bundle. On 2026-10-17 it reported 2,324 districts, 115
selectable cuisines, and only **26 distinct cuisine score vectors**: every
cuisine folded into the same group produced identical scores and rankings.
The median difference between a group's member cuisines was exactly zero; the
top 20 overlapped 20/20. Across districts, the median cuisine's 10th-to-90th
percentile score span was **0.0205**. For the default Indian profile specifically,
the 10th and 90th percentiles were 0.6338 and 0.6517.

Restaurant-row MAE of 0.0503 is useful but does not show that a district
ranking or a profile-specific recommendation is sound. The existing top-list
examples TD5, TD12 and EC3M need separate review for cross-border coverage,
missing context and extreme residential population. A narrow numerical span
alone is not proof of a bug: the label may contain little predictable district
signal. Stretching 0.63–0.65 to 0–1 would preserve the same ordering and give
false precision.

## Candidate change and release check

The next training bundle keeps the broad cuisine group for sharing evidence
across rare cuisines and also encodes a fine cuisine only when it has at least
50 directly labelled rows in the full run (3 in the small synthetic sample).
This threshold is a candidate to check in held-out evaluation.
Unsupported fine cuisines continue to use their broad group, so an untrained
one-hot weight cannot create a spurious difference. Bundle version
3 makes this change explicit. The browser accepts both version 2 and 3 during
the transition, so the published version 2 weights continue to work until a
validated full-data export is available. The synthetic sample verifies the
new input path and export; its ranking metrics cannot establish real-world
quality.

A supported fine cuisine is labelled by its own name; only a fallback cuisine
reads "(scored as <group>)". The reference scores include a supported fine
cuisine (one outside its own-named group where any exists) and a fallback
cuisine, so the browser parity check covers both input paths. The committed
`data/sample/` bundle is version 3, rebuilt with the quality stage above, so 5
of its 13 synthetic districts remain; `web/models/` stays version 2 until the
full-data export passes (#164).

The LinuxONE operator should retrain from the full private rows, then run
`python -m plotluck.ranking_audit <new-bundle-dir>` and compare the result with
the published baseline above. Check held-out error, rank changes across
cuisines and traits, and the top districts for representative urban, rural,
commercial-core and low-population cases. Omit a district from the map and
ranked list where its inputs remain unreliable or rank stability is inadequate.
Do not publish new weights merely because their numerical spread is wider:
the changed rankings must be supported by held-out evidence and the agreed
data-quality checks. Valid high rent-index values remain as recorded; suspect
low or missing values need comparison with suitable neighbouring districts.

## District data preparation candidate

The new build prepares district context before NN1 trains or exports scores.
Initial training and district-grouped validation use only districts whose
required context needed no repair; cuisine support counts also come from those
districts. At inference, a district with missing
population, deprivation, rent index, age or demographic shares may remain in
the bundle if comparable nearby districts support an estimate. The raw source
values remain in the private extracts; the exported values are the prepared
ones used for scoring. The run metrics count reliable, estimated and excluded
districts (#161).

A required value is repaired when it is missing or invalid: a non-positive
population, deprivation, rent index or average age, or ethnicity or sex shares
outside 0–1 or not summing to 1. `quality.estimated_reasons` counts each
repaired group as `<group>_missing`, `<group>_invalid` or
`commercial_rent_index_low`; `quality.training_with_labels` counts the reliable
districts that contributed labelled rows. The build refuses to train if a
training district still lacks a value, so no training median can stand in for
it. Each CV fold refits the label policy, cuisine groups, fine-cuisine support
and input transforms on its own training rows.

`label_anomalies` counts labelled rows, in every district, whose rating is more than a star from
the star mean of at least 10 default-language reviews, or not a half-star
value. They are flagged for audit only: the ADR 0002 target and its
eligibility are unchanged.

The current conservative rule needs at least three peers within 30 km with
similar mapped restaurant supply and map radius. A clearly anomalous low rent
index can be estimated, while valid high rent values stay recorded and are
passed to the model normally. Rent donors flagged as anomalously low are not
used for rent estimation. The low-rent check compares nearby peers; where too
few peers exist, it flags only values below one tenth of the national median
positive rent index. Districts with
no mapped restaurants, more than two missing context groups, or no suitable
peers are omitted. A commercial core with fewer than 100 residents and at
least 20 restaurants is also omitted because residential population cannot
stand in for visitor demand. Those boundaries are provisional and must be
checked against the full-data coverage and held-out ranking audit. Positive
low population is otherwise preserved rather than automatically rewritten.

The full-data build reads the UK ONSPD archive and removes postcode districts
with active postcodes in England and another UK country. A district entirely
in England remains eligible even when it touches the national boundary.

## Release audit of the #176 bundle (#165)

Run `PYTHONPATH=src python -m plotluck.ranking_audit <candidate> --against <live> --inspect TD5 TD12 EC3M …`.
The result for the #176 run is in
[`runs/2026-10-17-train-nn1-context/ranking_audit.json`](../../runs/2026-10-17-train-nn1-context/ranking_audit.json);
the live bundle is `web/models/` on `main` at `fd14f90`.

| Check | Live | Candidate |
|---|---|---|
| Districts scored | 2,324 | 2,076 (248 dropped, 0 added) |
| Held-out MAE / RMSE | 0.0503 / 0.0655 | 0.0503 / 0.0655 |
| Distinct cuisine score vectors | 26 | 48 |
| Median p10–p90 score spread | 0.0203 | 0.0136 |
| Rank correlation with live, per cuisine group (median / min) | — | 0.60 / 0.45 |
| Top-20 overlap with live (median / min) | — | 10 / 7 |

Representative districts, default Indian profile (rank / districts):
TD5 1st and TD12 16th in live, both omitted as cross-border; EC3M 2,320th in
live, omitted. W1D 2,297th → 779th, SW1A 2,313th → 626th, B1 2,025th → 188th,
LA22 1,086th → 184th, TR18 1,736th → 1,791st, CA1 1,719th → 1,922nd.

**Gate: passed with a known coverage gap; publish the candidate.** Held-out
error is unchanged, so the gain is in input handling rather than accuracy.
Fine cuisines now change scores, and removing the cross-border districts
takes TD5 (the live #1) and TD12 out of the ranking. The live ranking had
those known flaws, so its reordering by the candidate is not evidence against
it.

Of the dropped districts, 199 have no mapped restaurants, including
`W1M W1N W1R W1V W1X W1Y EC3B`, which also have no census values in the live
bundle. The real loss is the 9 districts that the
`commercial_core_without_footfall` rule omits: `EC2N EC2R EC2V EC3A EC3M EC3V
EC4N EC4R` in the City (8 of its 17 districts remain) and `W1C`. Each has 2–50
residents and 21–73 restaurants. The live bundle, without the rule, ranks
them near the bottom (EC3M 2,320th, W1C 2,286th) because NN1 reads residential
population as demand. Omitting them hides a known input weakness instead of
showing misleading scores. Restoring them needs a worker or visitor demand
input, not a different threshold.
