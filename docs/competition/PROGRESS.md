# Progress

Where the build stands right now. Tasks live in [GitHub Issues](https://github.com/AdrielAu/PlotLuck/issues); this page links to them, it does not list them. What we must hand in is in [DELIVERABLES.md](DELIVERABLES.md).

## Updating this page

- A PR that changes a phase's status updates that phase's row in the same PR.
- Blockers, the server operator and next priorities can change in a small PR at any time.
- Status is one of `not started`, `in progress`, `blocked`, `done`.

## Phases

| # | Phase | Status | Issues |
|---|---|---|---|
| 0 | Repo, workflow and server setup | done | #3, #19 |
| 1 | Data ingest: sources → one row per restaurant | done | #43, #42, #65, #68, #82, #101, #77 |
| 2 | Labels: review-based success | done | #36, #47, #69 |
| 3 | NN1 | in progress | #62, #65, #74, #101, #77, #150, #161, #163, #164; [ranking revamp](RANKING.md) |
| 4 | NN2 free-text interpretation (required for competition) | in progress | [spec #110](https://github.com/AdrielAu/PlotLuck/issues/110); one description (#169); latest user amendment has NN2 fill the review card before scoring, not yet wired in; model/release gates remain open; [plan](../plans/nn2-integration.md) |
| 5 | NN1 spatial-CV evaluation | in progress | #74, #77, #161; [ranking revamp](RANKING.md) |
| 6 | Accelerated-inference benchmark on LinuxONE | not started | |
| 7 | Weight export + x86 load check | in progress | #65, #67, #101, #77; bundle v3 pending full-data export |
| 8 | Site: district outlines, pickers, score threshold, ranked list | done | #67, #75, #76; redesign in [spec #127](https://github.com/AdrielAu/PlotLuck/issues/127): #128; outlines drawn from an ONSPD-only `district_outlines.json` beside the v2 bundle until a v4 full-data build replaces it |
| 9 | Evidence screenshots (see [CHECKLIST.md](../evidence/CHECKLIST.md)) | in progress | |
| 10 | Video | not started | |
| 11 | Submission | not started | |

## Now

- **Latest NN2 interface amendment**: one description replaces the routine six-question flow and results pickers. All six inputs must be accounted for before scoring: area/range, cuisine, menu prices, rent, restaurant type and other requirements. An omitted or unresolved place requires a city choice or a clearer area description; England-wide scope must be explicit. Missing/defaulted or invalid inputs prompt Erica's original questions, including after failed inference; complete descriptions go directly to results. The product extends the focused candidate with literal requirements and per-field recovery; historical five-field proof results do not establish this path's quality. Download starts on submission with cancellation. All quality/release gates remain open.
- **Planned review card**: preserve main's documented plan for NN2 to pre-fill editable pickers and require confirmation. That wiring remains separate from this six-field completion fix; current code opens results after completion.
- **Near-city and read-failure amendment (#188)**: bare `near` now uses the chosen place boundary and asks no radius; explicitly stated distances still use straight-line filtering. Failed model reads retain unambiguous literal menu-price/rent cues and explicit no-other-requirements acknowledgements through the same checked product extraction path. This recovery is not model-quality evidence.
- **Place completion amendment (#183)**: `high end`/`high-end` menus are premium. Named boroughs are available, with labelled confirmation of shortened compound names such as Hammersmith. City-only requests retain whole-city choices. Omitted or unresolved locations ask for an English city or another area description; the previous automatic England default is removed from the product. Model and geography coverage gates remain open.
- **NN2 cost and county correction (#180)**: the product now extracts relative rent separately from numeric budgets and menu prices, validates cost evidence by subject, and resolves Greater Manchester using the official metropolitan-county boundary. The reported description works with the existing 0.5B model after the prompt correction; broader quality gates remain open. Six metropolitan counties were added without changing existing place records or scoring centroids.

- **Server operator**: Adriel (@AdrielAu), from 2026-10-17, for the #77 full-data run
- **Scope**: England MVP; clusters, driver chart and cultural demand gap come later.
- **Named-area integration (#117)**: complete; implementation issue closed after confirmation behavior was added. The questions/review flow resolves cities/built-up areas, boroughs and regions from the offline catalogue. Ambiguous names, aliases and one-character spelling proposals need a labelled choice; unknown names, multiple places and exclusions cannot silently become England. Catalogue fields, district references and the exact centroid fingerprint are checked before use in either flow. Boundary membership filters the existing NN1 scores, empty boundaries stay empty, and the product now asks for a city or clearer area when location is blank. If a user explicitly names an on/off dietary trait, it is retained in the review even when NN2 omits it, and the user confirms or edits it before comparison. Near/radius review remains #118; NN2 quality and LinuxONE release gates remain open.
- **NN2 release prerequisites**: model/runtime notices, browser/LinuxONE model gates and offline geography/tooling feasibility. Pretrained-weight permission is [team-confirmed](nn2-eligibility.md) on 2026-10-17. [Spec #110](https://github.com/AdrielAu/PlotLuck/issues/110) is published; see [the plan](../plans/nn2-integration.md) for interview context. The earlier [MVP planning map](https://github.com/AdrielAu/PlotLuck/issues/33) is closed; its NN1 decisions remain in force.
- **Next**:
  1. The cleaned full-data run ([`runs/2026-10-17-train-nn1-cleaned/`](../../runs/2026-10-17-train-nn1-cleaned/)) is in `web/models/`: NN1 MAE 0.0503 against 0.0823 for the baseline over 5 district-grouped folds, and x86 parity passes on the s390x weights. Cleaning ([#148](https://github.com/AdrielAu/PlotLuck/issues/148)) drops 70 rows more than 2 km from a live English postcode and 620 duplicate listings, leaving 142,814 restaurants; the metrics are unchanged from the uncleaned [`runs/2026-10-17-train-nn1/`](../../runs/2026-10-17-train-nn1/). The thresholds come from [`runs/2026-10-17-data-audit/`](../../runs/2026-10-17-data-audit/), and the bundle now carries `radius_km` (#130). VOA was kept (213 districts without rent). 101 of 2,324 districts have no Census match (ONSPD has no active English postcode-to-MSOA link for them) and use the training median.
  2. Accelerated-inference benchmark on LinuxONE (phase 6).
  3. Evidence screenshots for the training run, metrics and x86 load check (phase 9).
  4. NN2 proof tooling is merged in [PR #134](https://github.com/AdrielAu/PlotLuck/pull/134). #115 is merged; #112 records permission; #114 provides the offline England catalogue. [Browser #139](https://github.com/AdrielAu/PlotLuck/issues/139) includes the user's [five-input investigation](../../runs/2026-10-17-nn2-browser-139/focused-extraction.md): 20/20 narrow development cases versus baseline 3/20, warm sample p95 2.038 s; original full-trait scoring remains 13/20 versus 2/20. Explicit menu prices/rent are absent from that fixture, and three separate unlabelled price/rent probes failed validation. The candidate stays experimental behind `?nn2=1`, with three-attempt/manual recovery, preserved manual traits and confirmed place/rent-band filters. Total rent is annualized for review; a person confirms low/mid/high/any rather than inventing a pounds-to-band mapping. Heldout cases remain reserved; #110/#113 and LinuxONE/release gates stay open. All earlier failures are retained. LinuxONE native CPU evidence (#140) is now merged: 0/3 correct with malformed JSON; request times met 60 seconds.
