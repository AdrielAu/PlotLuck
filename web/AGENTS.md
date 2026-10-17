# Web

The site is static. The England MVP runs NN1 from exported JSON weights in `models/` using a JavaScript forward pass, and deploys to GitHub Pages from `web/` on every push to `main`.

Current inputs are searchable cuisine and trait pickers. Required competition scope adds browser NN2 interpretation into an editable profile and search area, confirmed before NN1 updates the map/list. Read [the plan's status and contracts](../docs/plans/nn2-integration.md) before implementing. See [ADR 0001](../docs/adr/0001-open-source-llm-reads-the-restaurant-profile.md) and [ADR 0006](../docs/adr/0006-nn2-proposes-a-profile-and-search-area.md). Show district centroid circles on a Leaflet map, a score threshold and a ranked list within the confirmed scope. Scores measure expected review-based success, not calibrated probabilities. Clusters, driver chart and cultural demand gap remain after MVP.

Use the agreed [restaurant, district and model-file formats](https://github.com/AdrielAu/PlotLuck/issues/38) once resolved; architecture, preprocessing and JSON layout remain open.

Follow [ADR 0003](../docs/adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md): public outputs are weights, district scores, ranked districts and cuisine/trait pick-lists. Keep raw Tripadvisor restaurant names, locations, ratings, review counts and district aggregates of those raw fields out of the site. Include the ADR's required attribution in the footer and preserve the non-commercial condition.

## Design skills

Building a page that doesn't exist yet: use taste. That means `design-taste-frontend` for the landing page and `minimalist-ui` for the map app.

Changing a page that already exists: use impeccable, not taste. Run `/impeccable critique` or `/impeccable audit` to find problems and `/impeccable polish` to fix them.

Impeccable is not a required step on every web PR.
