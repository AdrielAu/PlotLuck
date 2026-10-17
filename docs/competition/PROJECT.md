# Plotluck – handover (updated 2026-10-17)

The planning index is [Plan the Plotluck MVP as a vertical slice](https://github.com/AdrielAu/PlotLuck/issues/33); its tickets hold detailed resolutions. Build status is in [PROGRESS.md](PROGRESS.md), and submission requirements are in [DELIVERABLES.md](DELIVERABLES.md). The abstract and design doc below preserve the initial concept, not the current build specification.

## Context

- IBM Z Datathon 2026. Theme: Wildcard → sub-challenge **Community Impact**. Team of 5, working in person.
- Rules: project doc `Participant Guidebook_IBM Z Datathon 2026.md`. Build window **Oct 17–18**. All code from scratch in the window, so create the repo on the 17th. Final submission: ≤3-min video showing the LinuxONE instance and the model, GitHub repo, title containing the team name. Judges score community value, novelty, LinuxONE + AI/ML use (with screenshots), and pitch.
- The IBM labs are learning prerequisites only. The solution does not need to follow them.
- The abstract and design doc are an **initial concept** only; anything in them may change during the build. Next: the build.

## Product (current MVP)

- Scope: **England**, replacing the earlier London and UK scopes. The target is to score every English postcode district; country filtering and cross-border district handling belong to the formats decision.
- Inputs: current searchable cuisine/trait pickers; required competition scope adds NN2 free text proposing an editable profile and search area, confirmed before comparison. A candidate trait ships only if populated on at least 50% of England restaurant rows; see [Which traits does the MVP offer?](https://github.com/AdrielAu/PlotLuck/issues/37).
- Output: a 0–1 **score** for expected **review-based success**, covering customer satisfaction and accumulated review activity. It is not survival, profitability or a calibrated probability. The review-count policy is settled in [ADR 0002](../adr/0002-review-based-success-label.md).
- Display: Leaflet map with one circle per district centroid, a score threshold slider and a ranked list of districts above it. Clusters, driver chart and cultural demand gap are after the MVP.
- Motivation: a teammate's father's restaurant closed in COVID; help small independents; widen under-represented cuisines.
- Training unit: one row per **restaurant**, joined to its postcode-district context. NN1 scores the selected cuisine and traits in each district. Its MVP architecture (a 64 → 32 ReLU MLP with a sigmoid output, trained in PyTorch with district-grouped 5-fold CV) is in [Choose NN1's architecture for the MVP](https://github.com/AdrielAu/PlotLuck/issues/62).
- District context also includes estimated mean age, five broad Census ethnicity shares, female/male Census sex shares and separate mapped attraction/hotel counts. See [ADR 0005](../adr/0005-district-demographics-and-tourism-context.md) for allocation, missingness and limitations. The sample uses synthetic context; the full-data LinuxONE bundle is now in `web/models/`, with results in [the training run](../../runs/2026-10-17-train-nn1/).
- [ADR 0001](../adr/0001-open-source-llm-reads-the-restaurant-profile.md) supersedes the team's initial no-LLM and mandatory two-NN-hybrid choices. The 2026-10-17 interview makes NN2 required for competition, with free text continuing after the VM expires. [Spec #110](https://github.com/AdrielAu/PlotLuck/issues/110) is the implementation contract; the [integration plan](../plans/nn2-integration.md) retains interview context. [ADR 0006](../adr/0006-nn2-proposes-a-profile-and-search-area.md) defines review and scope filtering; model performance and geography tooling remain unverified. Pretrained-weight competition permission is [team-confirmed](nn2-eligibility.md) on 2026-10-17; final artifact licences/notices remain required.

## Data (current candidates)

- Kaggle TripAdvisor European Restaurants supplies England training rows and review fields. [Source/schema verification](https://github.com/AdrielAu/PlotLuck/issues/42) establishes technical feasibility. The team accepted source-rights risk for non-commercial training under [ADR 0003](../adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md); this is not unrestricted permission. Raw rows stay on LinuxONE, restaurant samples are synthetic, and public outputs are limited to weights, district scores, rankings and pick-lists. Use the attribution in ADR 0003. Closed status is unknown and survivorship bias remains a limitation.
- OSM supplies district-level restaurant aggregates, not individual restaurant matches to TripAdvisor.
- ONS Postcode Directory supplies postcode geography and country codes; Census 2021 P004 supplies population. Exact district features, aggregation, geography vintages and border handling remain under the formats decision.
- [Pull and document the datasets for the Plotluck MVP](https://github.com/AdrielAu/PlotLuck/issues/43) tracks acquisition. Full data stays on LinuxONE; committed samples need provenance and permission.

## Platform facts (LinuxONE Community Cloud)

- 1 VM shared by the whole team. Jupyter Lab runs in **Docker** (not Podman) on port 38888, with one shared token. Shared folder `/home/linux1/shared` ↔ `/home/ibm-user/shared`.
- Image includes PyTorch, TensorFlow/Keras, XGBoost, scikit-learn; ONNX export supported. Upload limit 200 MB. s390x.
- Setup repo: github.com/linuxone-community-cloud/jupyter-lab-ml

## Deployment (current plan)

- Train and evaluate NN1 in **Jupyter notebooks** (IBM's Jupyter Lab container) on LinuxONE, and **benchmark accelerated inference** there. Benchmark, video and submission remain competition work outside the MVP planning map.
- Export **raw JSON weights with a small JavaScript forward pass**. A static **GitHub Pages** site runs them in-browser after the event. Exact input encoding, preprocessing and weight layout await the formats decision. Test the export early: s390x is big-endian, so check x86 loading and prediction agreement with the training implementation.
- Driver chart attribution and style are later decisions.
- Fallback: precompute scores to JSON on LinuxONE. Stretch: live LinuxONE API during judging.

## Team workflow (current plan)

1. GitHub issue → local branch → test locally on a **data sample** → PR → merge to main.
2. **Server operator** (one person at a time; clear in person) pulls main and runs/tests on the full data.
3. Linux-only errors (pass on Windows, fail on server): open a `linux-only` issue; operator hotfixes on the server → `fix/linux-*` branch → PR to main.
- Locally, everyone runs the same notebooks/scripts on sample data in their own Python or Jupyter (no Docker needed on laptops).
- Pin `requirements.txt` to the IBM image versions.
- Avoid Windows-isms: `pathlib`, `.gitattributes` (LF), consistent filename case.

## Evidence (current plan)

- `docs/evidence/CHECKLIST.md` in the repo. Shots named by step.
- Capture: SSH login + `lscpu` (s390x), `docker ps`, Jupyter Lab, data ingest, NN1 training (loss curves), metrics, accelerated inference benchmark, weight export/x86 load check, live site.

## Abstract (historical initial concept text)

This text predates the England scope and review-based target; it is not the current product specification.

- Problem (176/200): COVID closed many of London's small restaurants. New owners still pick sites on gut feel, and the city's under-represented cuisines rarely reach the communities that want them.
- Solution (192/200): An AI tool on IBM LinuxONE: enter a cuisine and restaurant traits, and models trained on how long London restaurants survived score every postcode district 0-1 and show what drives each score.
- Audience: 1 independent/first-time restaurateurs (primary), 2 under-represented food entrepreneurs, 3 diverse residents/students, 4 councils/BIDs, 5 small-business lenders/advisers.
- Datasets: OSM, Foursquare Open Places, FSA hygiene register, Companies House, ONS Census 2021, TfL entries/exits, VOA rateable values, IMD, ONS Postcode Directory. Excluded: police crime data, Google reviews.

## Design doc (historical initial concept)

- `Plotluck_Design_Doc.pdf` (2 pages A4), built by `claude/plotluck_build_doc.py` in this project: `python3 plotluck_build_doc.py out.pdf` (DejaVu fonts).
- Describes the earlier hybrid model, ONNX candidate and clustered map. It is not the current MVP contract; use the map and decisions linked above.
- User prefs: keep TBD items general; check diagram labels fit their boxes after edits; keep handovers token-lean.

## Open

- The [MVP planning map](https://github.com/AdrielAu/PlotLuck/issues/33) is closed. Next: `/to-spec` from its decisions, then `/to-tickets` for the implementation issues.
- Implement NN2 from spec #110, beginning with eligibility and technical feasibility. Post-MVP map/driver design remains later work.
