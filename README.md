# Plotluck

Where in England should your restaurant open? Plotluck is building a tool to score English postcode districts (0 to 1) for the expected review-based success of a restaurant of a given cuisine and traits, helping small independents and under-represented cuisines find their spot. Scores describe customer satisfaction and review activity; they are not survival or profitability predictions or calibrated probabilities.

**Site:** https://adrielau.github.io/PlotLuck/

## Planned MVP

Describe your restaurant idea and location in one text box. NN2 reads it on your device, then asks for any missing cuisine, menu prices, rent, restaurant type or other requirements. Without a location the search is England; unclear places need confirmation. Results open once all six inputs are accounted for. You can explicitly choose unknown prices, any rent or no other requirements. Edit your description to change the search. Explore estimated district outlines, a score threshold and a ranked list. First use downloads about 288 MB; desktop Chrome or Edge with WebGPU is required. NN2's model-quality and release gates remain open. Clusters, driver charts and the cultural demand gap come later.

The build is in progress; see [Progress](docs/competition/PROGRESS.md) for implementation status.

## How it's built

NN1 is trained in Jupyter on IBM LinuxONE (s390x). Exported JSON weights and a JavaScript forward pass run in the browser on a static GitHub Pages site. Accelerated-inference benchmarks run on LinuxONE as part of the competition evidence. Built for the IBM Z Datathon 2026 (Community Impact).

District context includes population, deprivation, commercial rent, restaurant supply, estimated mean age, ethnicity and Census sex shares, and mapped attraction/hotel counts. The site's bundle was trained on LinuxONE with the real Census and OpenStreetMap extracts ([run results](runs/2026-10-17-train-nn1/)); the committed sample in `data/sample/` still uses synthetic demographic and tourism fixtures. See [the feature definitions and geography limitations](docs/adr/0005-district-demographics-and-tourism-context.md).

NN2 uses a browser-based open-source language model, with separate LinuxONE inference/evaluation evidence. Browser interpretation works independently of the VM. See [the current user contract and remaining release gates](docs/plans/nn2-integration.md) and [ADR 0001](docs/adr/0001-open-source-llm-reads-the-restaurant-profile.md).

## Dataset attribution and use

The team selected the Kaggle Tripadvisor-derived source for non-commercial training, accepting the unresolved source-rights risk under [ADR 0003](docs/adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md). Raw restaurant rows remain on LinuxONE; committed restaurant samples are synthetic. Public outputs are limited to model weights, district scores, ranked districts and cuisine/trait pick-lists. Commercial use requires retraining on a permitted source.

Required attribution for the trained model:

> Model trained on a 2021 Tripadvisor-derived dataset published on Kaggle (stefanoleone992). Not affiliated with or endorsed by Tripadvisor. Scores reflect review-based success among restaurants listed in 2021; closed restaurants may be missing.

Census context: Source: Office for National Statistics licensed under the Open Government Licence v.3.0. Tourism counts: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Geography attribution is recorded in [data sources](data/SOURCES.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
