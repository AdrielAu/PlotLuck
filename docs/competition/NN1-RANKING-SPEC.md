# Revamp NN1 ranking and district-context quality

## Problem Statement

As a prospective restaurant owner, I can receive nearly the same score for very different postcode districts and cuisines, while places such as TD5, TD12 and EC3M can appear near the top despite questionable geographic coverage or district context. I cannot tell whether a high rank reflects evidence about review-based success or an incomplete, misleading input. A low held-out restaurant-row error does not by itself establish that the recommended postcode districts are plausible.

The currently published model groups 115 selectable cuisines into 26 score patterns. Its district scores also occupy a narrow range for many profiles. Missing Census or rent context, unusually low rent-index values, cross-border postcode districts, and tiny residential populations in commercial cores may distort training or display. The review-based success target is a policy proxy for customer satisfaction and review activity, not a measure of profitability or survival.

## Solution

Build a defensible NN1 training and publication path. Use postcode districts with reliable recorded district context for initial training, model selection and district-grouped evaluation. For a requested search area, score a postcode district with estimated district context only when comparable nearby, non-outlying districts support the estimate. Omit an unsupported district from both map and ranked list. Keep recorded values that are plausible, including high commercial rent-index values; let NN1 process the rent index normally. Remove postcode districts with active postcodes in England and another UK country, while retaining districts entirely in England even if they touch the border.

Retain the broad cuisine group and add a distinct cuisine input only where sufficient reliable labelled rows support it. Evaluate whether rankings actually change in useful, credible ways across cuisine, traits and postcode districts. Publish replacement weights and context only after full-data evaluation and browser parity checks; otherwise keep the existing bundle and report why the candidate failed.

## User Stories

1. As a prospective restaurant owner, I want different cuisines to receive distinct rankings when the data supports a difference, so that my selected cuisine matters.
2. As a prospective restaurant owner choosing a rare cuisine, I want the score to use its broader cuisine group, so that a few examples do not create a misleading distinction.
3. As a prospective restaurant owner, I want the same restaurant profile compared consistently across a search area, so that the ranked list is meaningful.
4. As a prospective restaurant owner, I want a postcode district with sound recorded context shown in the results, so that eligible places are not unnecessarily hidden.
5. As a prospective restaurant owner, I want a postcode district with a defensible estimated context value included, so that incomplete public data does not remove every otherwise viable option.
6. As a prospective restaurant owner, I want an unsupported district omitted from the map and ranked list, so that an invented or unreliable score cannot appear as a recommendation.
7. As a prospective restaurant owner, I want missing or zero rent-index values checked against comparable districts, so that a false bargain does not receive an inflated score.
8. As a prospective restaurant owner, I want a genuinely low rent-index value preserved when local evidence supports it, so that the results do not erase affordable locations.
9. As a prospective restaurant owner, I want valid high rent-index values passed through normally, so that the ranking does not apply an arbitrary manual rent penalty.
10. As a prospective restaurant owner, I want a commercial core with almost no resident population withheld when visitor demand cannot be assessed, so that residential context does not falsely make it look attractive.
11. As a prospective restaurant owner, I want no score shown for a district with no mapped restaurant evidence when the model cannot support it, so that an evidence gap is not presented as success.
12. As a prospective restaurant owner searching England, I want postcode districts shared with another UK country removed, so that the displayed geography follows the England-only scope.
13. As a prospective restaurant owner, I want an entirely English district kept even if it touches the national boundary, so that a nearby border is not treated as cross-border coverage.
14. As a prospective restaurant owner, I want the confirmed search area and rent band to filter only publishable districts, so that unsupported districts cannot reappear through another UI path.
15. As a model developer, I want training, early stopping and held-out evaluation to use reliable district context, so that repaired display inputs do not make the initial quality estimate look better than it is.
16. As a model developer, I want cuisine support counted from reliable labelled rows, so that excluded districts cannot decide which cuisines receive a distinct model input.
17. As a model developer, I want each estimated value to come from enough nearby districts of comparable size and mapped restaurant supply, so that a distant or unlike place does not silently supply it.
18. As a model developer, I want a donor flagged as outlying for a field excluded from that field's estimate, so that a bad value is not copied into another district.
19. As a model developer, I want source values preserved separately from prepared output values, so that I can audit each repair without rewriting the evidence.
20. As a model developer, I want counts and reasons for reliable, estimated, excluded and cross-border districts in run metrics, so that coverage losses are visible before publication.
21. As a model developer, I want held-out error and ranking behavior compared with the current bundle, so that a wider numerical score range is not mistaken for improvement.
22. As a model developer, I want representative urban, rural, commercial-core and border examples inspected, including TD5, TD12 and EC3M, so that obvious recommendation failures are caught.
23. As a server operator, I want the complete pipeline to run on full private data on LinuxONE and export browser-readable weights, so that the published results have reproducible evidence.
24. As a server operator, I want the JavaScript scorer to match Python reference scores on the exported bundle, so that the live site uses the evaluated model.
25. As a judge or reviewer, I want the limits of the review-based success score and estimated context stated accurately, so that I do not read it as a probability, survival forecast or profit prediction.

## Implementation Decisions

- Keep the restaurant-row review-based success target from ADR 0002. Audit its label eligibility and input validity in the full run. A target-policy change requires a separate recorded decision, relabelling and retraining.
- Use one district-preparation boundary between source aggregation and NN1 training/export. It returns prepared, publishable district context; the set of districts eligible for training; and counts of excluded districts by reason. Keep source extracts intact.
- Train and perform district-grouped cross-validation on reliable districts only. Estimated districts are eligible for inference and display only. Fit label policy, cuisine support and input transforms without letting held-out districts or excluded context influence the fitted values.
- Treat a missing or invalid required district-context field as a candidate for estimation. Use at least three nearby, comparable district donors; reject donors whose value for that field is itself invalid or flagged as an outlier. Omit the target when the evidence is insufficient or too many context groups need repair. Record the accepted donor and threshold policy in the run evidence and reassess provisional thresholds against full-data coverage.
- Treat commercial rent as an index, not a quoted property cost. Check unusually low positive values against comparable neighbours, and use a conservative wider reference only when local evidence is sparse. Preserve plausible low values. Preserve valid high values and apply no manual high-rent score adjustment.
- Preserve plausible positive low population, but withhold dense commercial cores where resident population is too small to represent the relevant demand and visitor evidence is unavailable. Do not substitute residential population for footfall.
- Exclude a postcode district only when active postcode records place it in England and at least one other UK country. Geography must be decided from the UK postcode directory before district aggregation and output.
- Keep the broad cuisine group. Add a fine cuisine input only when a minimum number of labelled rows from reliable districts supports it; the current candidate minimum is 50 on full data. Unsupported fine cuisines fall back to their broad group. The threshold is subject to held-out evaluation.
- Keep the existing profile inputs, review-based score semantics and search-area/rent-band filtering contract. A selected search area filters the prepared exported districts; it does not trigger a new local model fit or a new estimate in the browser.
- Export only publishable districts and their prepared context. The browser map, ranked list and any search-area filter must all derive from that same bundle, so unsupported districts cannot appear through one view but not another.
- Maintain compatibility with the currently published bundle until a validated replacement is ready. Replacing the live bundle requires full-data retraining, rank audit, coverage audit and Python-to-JavaScript score parity.
- Follow ADR 0003: Tripadvisor-derived rows and raw review aggregates remain private on LinuxONE; the public site contains only the permitted model outputs and supply inputs, with attribution.

## Testing Decisions

- Test externally observable behavior at the highest useful seam: feed representative source/sample data into the complete build and inspect the exported bundle, run metrics and reference scores. A district with reliable context should be present in training and output; an estimable district should be present only in output; an unsupported or cross-border district should be absent from output.
- Use small focused quality tests for donor selection and numeric edge cases that a full sample cannot reliably exercise: missing and zero context, genuinely low versus anomalously low rent, high rent preservation, outlying donors, lack of comparable peers, and commercial cores. Assert the resulting prepared values or exclusion, not internal helper calls.
- Use the existing browser scorer and results tests to verify that the exported bundle loads, fine cuisine changes model input only when supported, search-area filtering cannot resurrect omitted districts, and Python reference scores match JavaScript within the established tolerance.
- Use the existing synthetic sample build tests as prior art for end-to-end export and schema validation; use existing JavaScript scoring tests for browser compatibility. Synthetic outcomes establish mechanics only.
- On the full private dataset, compare district-grouped held-out MAE/RMSE with the published baseline, report usable district coverage and estimate/exclusion counts, run a ranking audit across cuisines and traits, and inspect top results and rank stability for representative cases. A larger score spread alone is not a pass condition.
- Check that full-data export from LinuxONE loads on x86 and yields matching reference predictions before replacing the live bundle. Preserve the previous bundle if any release gate fails.

## Out of Scope

- Predicting restaurant survival, profitability, actual rent cost, visitor footfall or a calibrated probability of success.
- Manually forcing TD5, TD12, EC3M or any other named postcode district up or down the ranking. They are diagnostic examples; the same rules apply across England.
- Replacing the review-based success label weights without an explicit new target decision.
- Stretching scores to fill 0–1 merely to make the display look more sensitive.
- NN2 free-text interpretation, new restaurant traits, cultural demand-gap scores, clusters and driver charts.
- Publishing Tripadvisor-derived raw rows, ratings, review counts or aggregates outside ADR 0003's permitted supply inputs.

## Further Notes

- The present published bundle is version 2. The candidate fine-cuisine and quality path is staged in the workspace, with sample tests passing, but it has not been evaluated on the full private data or published. Full-data results may require adjustment to the provisional quality thresholds or may show that the available data cannot support a credible ranking.
- The 2026-10-17 baseline audit found 2,324 published districts, 115 selectable cuisines but 26 distinct cuisine score vectors. The median cuisine's district score span from the 10th to 90th percentile was 0.0205. These are diagnosis figures, not release targets.
- This specification supersedes the earlier idea of showing unreliable districts in grey: an unsupported district is omitted from the user-facing map and ranked list.
