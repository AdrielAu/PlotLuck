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
| 3 | NN1 | done | #62, #65, #74, #101, #77 |
| 4 | NN2 free-text interpretation (required for competition) | in progress | [spec #110](https://github.com/AdrielAu/PlotLuck/issues/110); #115 draft/confirmation foundation; #136 questions screen reads answers with NN2 after an explicit download, fallback otherwise; #35; [plan](../plans/nn2-integration.md) |
| 5 | NN1 spatial-CV evaluation | done | #74, #77 |
| 6 | Accelerated-inference benchmark on LinuxONE | not started | |
| 7 | Weight export + x86 load check | done | #65, #67, #101, #77 |
| 8 | Site: district circles, pickers, score threshold, ranked list | done | #67, #75, #76; redesign in [spec #127](https://github.com/AdrielAu/PlotLuck/issues/127): #128 |
| 9 | Evidence screenshots (see [CHECKLIST.md](../evidence/CHECKLIST.md)) | in progress | |
| 10 | Video | not started | |
| 11 | Submission | not started | |

## Now

- **Server operator**: Adriel (@AdrielAu), from 2026-10-17, for the #77 full-data run
- **Scope**: England MVP; clusters, driver chart and cultural demand gap come later.
- **Named-area integration (#117)**: the questions/review flow resolves cities/built-up areas, boroughs and regions from the offline catalogue. Ambiguous names, aliases and one-character spelling proposals need a labelled choice; unknown names, multiple places and exclusions cannot silently become England. Catalogue fields, district references and the exact centroid fingerprint are checked before use in either flow. Boundary membership filters the existing NN1 scores, empty boundaries stay empty, and a blank location means England. Near/radius review remains #118; NN2 quality and LinuxONE release gates remain open.
- **NN2 release prerequisites**: model/runtime notices, browser/LinuxONE model gates and offline geography/tooling feasibility. Pretrained-weight permission is [team-confirmed](nn2-eligibility.md) on 2026-10-17. [Spec #110](https://github.com/AdrielAu/PlotLuck/issues/110) is published; see [the plan](../plans/nn2-integration.md) for interview context. The earlier [MVP planning map](https://github.com/AdrielAu/PlotLuck/issues/33) is closed; its NN1 decisions remain in force.
- **Next**:
  1. The full-data run ([`runs/2026-10-17-train-nn1/`](../../runs/2026-10-17-train-nn1/)) is in `web/models/`: NN1 MAE 0.0503 against 0.0823 for the baseline over 5 district-grouped folds, and x86 parity passes on the s390x weights. VOA was kept (213 districts without rent). 101 of 2,324 districts have no Census match (ONSPD has no active English postcode-to-MSOA link for them) and use the training median.
  2. Accelerated-inference benchmark on LinuxONE (phase 6).
  3. Evidence screenshots for the training run, metrics and x86 load check (phase 9).
  4. NN2 proof tooling is merged in [PR #134](https://github.com/AdrielAu/PlotLuck/pull/134). #115 is merged; #112 records permission; #114 provides the offline England catalogue. [Browser #139](https://github.com/AdrielAu/PlotLuck/issues/139) includes the user's [five-input investigation](../../runs/2026-10-17-nn2-browser-139/focused-extraction.md): 20/20 narrow development cases versus baseline 3/20, warm sample p95 2.038 s; original full-trait scoring remains 13/20 versus 2/20. Explicit menu prices/rent are absent from that fixture, and three separate unlabelled price/rent probes failed validation. The candidate stays experimental behind `?nn2=1`, with three-attempt/manual recovery, preserved manual traits and confirmed place/rent-band filters. Total rent is annualized for review; a person confirms low/mid/high/any rather than inventing a pounds-to-band mapping. Heldout cases remain reserved; #110/#113 and LinuxONE/release gates stay open. All earlier failures are retained. LinuxONE native CPU evidence (#140) is now merged: 0/3 correct with malformed JSON; request times met 60 seconds.
