# Web

The site is static. The England MVP runs NN1 from exported JSON weights in `models/` using a JavaScript forward pass, and deploys to GitHub Pages from `web/` on every push to `main`.

The first screen asks six questions (search area, cuisine, venue type, price band, rent band, other traits) over a decorative Three.js voxel kitchen. Answers reach a draft only through `interpret(answers)` in `interpret.js`: NN2 (`nn2.js`, its worker `nn2-worker.js`) once the user downloads it from the questions screen's download line, otherwise, or when NN2 fails or replies invalidly, a deterministic fallback (#136); keep the questions screen unaware of which one runs. The search area is still read locally from the location answer until the place catalogue lands (#117/#118). A review card confirms the draft, and the results screen keeps the cuisine and trait pickers. The search area and rent band filter districts; they are not NN1 inputs. Required competition scope adds browser NN2 interpretation into an editable profile and search area, confirmed before NN1 updates the map/list. Read [the plan's status and contracts](../docs/plans/nn2-integration.md) before implementing. See [ADR 0001](../docs/adr/0001-open-source-llm-reads-the-restaurant-profile.md) and [ADR 0006](../docs/adr/0006-nn2-proposes-a-profile-and-search-area.md). Show district centroid circles on a Leaflet map, a score threshold and a ranked list within the confirmed scope. Scores measure expected review-based success, not calibrated probabilities. Clusters, driver chart and cultural demand gap remain after MVP.

Use the agreed [restaurant, district and model-file formats](https://github.com/AdrielAu/PlotLuck/issues/38) once resolved; architecture, preprocessing and JSON layout remain open.

Follow [ADR 0003](../docs/adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md): public outputs are weights, district scores, ranked districts and cuisine/trait pick-lists. Keep raw Tripadvisor restaurant names, locations, ratings, review counts and district aggregates of those raw fields out of the site. Include the ADR's required attribution in the footer and preserve the non-commercial condition.

## Screens

The page has two screens, swapped in place: questions (`questions.js`, wired in `app.js`) and results (`results-screen.js`, logic in `results.js`; spec [#127](https://github.com/AdrielAu/PlotLuck/issues/127)). Desktop Chrome and Edge only. The results screen only formats NN1's scores for a confirmed query, through the one entry point `setUpResultsScreen` returns: `openResults({ profile, searchArea, searchAreaName })`. That shape is NN2's confirmed output (#110): a profile in NN1's vocabulary, and a search area listing postcode district codes, where empty means all England. `app.js` fills the search area with the confirmed area's districts in the chosen rent band. Neither screen writes answers to the address, history or browser storage.

## Design skills

Building a page that doesn't exist yet: use taste. That means `design-taste-frontend` for the landing page and `minimalist-ui` for the map app.

Changing a page that already exists: use impeccable, not taste. Run `/impeccable critique` or `/impeccable audit` to find problems and `/impeccable polish` to fix them.

Impeccable is not a required step on every web PR.
