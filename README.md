# Plotluck

Where in England should your restaurant open? Plotluck is building a tool to score English postcode districts (0 to 1) for the expected review-based success of a restaurant of a given cuisine and traits, helping small independents and under-represented cuisines find their spot. Scores describe customer satisfaction and review activity; they are not survival or profitability predictions or calibrated probabilities.

**Site:** https://adrielau.github.io/PlotLuck/

## Planned MVP

Choose a cuisine and supported traits from searchable fixed lists. Explore district centroid circles on a zoomable map, set a score threshold, and compare a ranked list of districts above it. Free-text input, clusters, driver charts and the cultural demand gap come after the MVP.

The build is in progress; see [Progress](docs/competition/PROGRESS.md) for implementation status.

## How it's built

NN1 is trained in Jupyter on IBM LinuxONE (s390x). Exported JSON weights and a JavaScript forward pass run in the browser on a static GitHub Pages site. Accelerated-inference benchmarks run on LinuxONE as part of the competition evidence. Built for the IBM Z Datathon 2026 (Community Impact).

A later browser-based open-source LLM will read cuisine and traits from free text; see [ADR 0001](docs/adr/0001-open-source-llm-reads-the-restaurant-profile.md). The [model/data formats](https://github.com/AdrielAu/PlotLuck/issues/38) remain an open decision.

## Dataset attribution and use

The team selected the Kaggle Tripadvisor-derived source for non-commercial training, accepting the unresolved source-rights risk under [ADR 0003](docs/adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md). Raw restaurant rows remain on LinuxONE; committed restaurant samples are synthetic. Public outputs are limited to model weights, district scores, ranked districts and cuisine/trait pick-lists. Commercial use requires retraining on a permitted source.

Required attribution for the trained model:

> Model trained on a 2021 Tripadvisor-derived dataset published on Kaggle (stefanoleone992). Not affiliated with or endorsed by Tripadvisor. Scores reflect review-based success among restaurants listed in 2021; closed restaurants may be missing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
