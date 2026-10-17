# Web

The site is static. The England MVP runs NN1 from exported JSON weights in `models/` using a JavaScript forward pass, and deploys to GitHub Pages from `web/` on every push to `main`.

The first screen accepts one free-text restaurant description over the decorative Three.js kitchen. `free-text.js` loads browser NN2 on submission. Per [the plan's latest amendment](../docs/plans/nn2-integration.md), NN2's validated interpretation pre-fills the review card's pickers, which the user can correct manually and confirms before scoring; until that is wired in, the code asks only for unclear or invalid details and opens results directly. `description-query.js` adapts focused NN2 extraction to a scoring query; `geography.js` checks the offline catalogue and radius membership. Search area and rent band filter districts; they are not NN1 inputs. `interpret.js` retains deterministic helpers and legacy contracts but supplies no silent user-facing fallback. Inference quality and release gates remain open. The results map shows estimated district outlines (`outlines.js` decodes `models/district_outlines.json`; a district without one is a circle of `radius_km`). Bundles before version 4 use the outlines file when one sits beside them. Scores measure expected review-based success, not calibrated probabilities. Clusters, driver chart and cultural demand gap remain after MVP.

Use the agreed [restaurant, district and model-file formats](https://github.com/AdrielAu/PlotLuck/issues/38) once resolved; architecture, preprocessing and JSON layout remain open.

Follow [ADR 0003](../docs/adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md): public outputs are weights, district scores, ranked districts and cuisine/trait pick-lists. Keep raw Tripadvisor restaurant names, locations, ratings, review counts and district aggregates of those raw fields out of the site. Include the ADR's required attribution in the footer and preserve the non-commercial condition.

## Screens

Completion requires area/range, cuisine, menu prices, rent, restaurant type and other requirements. An omitted or unresolved place requires a city choice or a clearer area description; England-wide scope must be explicit. `description-query.js` emits the missing original questions and a completion guard; `free-text.js` collects explicit answers. Failed/malformed NN2 replies offer completion too. The product worker uses `complete:true` to extract literal requirements and recover invalid fields separately; proof callers keep the strict five-field contract. User-confirmed Unknown/Any/None values count as answers, model defaults do not.

The page swaps between description/clarification (`free-text.js`, wired in `app.js`) and results (`results-screen.js`, logic in `results.js`). Desktop Chrome and Edge with WebGPU are required for NN2. Results accept `openResults({ profile, searchArea, searchAreaName })`: a profile in NN1's vocabulary and district codes filtered by resolved area and rent band. Block empty scopes before this call because the results contract treats an empty list as England. Edit description preserves the text and previous results. Descriptions, extracted values and clarification choices stay in tab memory, without address/history changes or browser storage.

## Design skills

Building a page that doesn't exist yet: use taste. That means `design-taste-frontend` for the landing page and `minimalist-ui` for the map app.

Changing a page that already exists: use impeccable, not taste. Run `/impeccable critique` or `/impeccable audit` to find problems and `/impeccable polish` to fix them.

Impeccable is not a required step on every web PR.
