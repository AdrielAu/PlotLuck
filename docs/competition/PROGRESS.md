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
| 1 | Data ingest: sources → one row per restaurant | in progress | #43, #42, #65, #68, #82, #101 |
| 2 | Labels: review-based success | done | #36, #47, #69 |
| 3 | NN1 | in progress | #62, #65, #74, #101 |
| 4 | NN2 free-text interpretation (required for competition) | in progress | [spec #110](https://github.com/AdrielAu/PlotLuck/issues/110); #115 draft/confirmation foundation; #35; [plan](../plans/nn2-integration.md) |
| 5 | NN1 spatial-CV evaluation | in progress | #74, #77 |
| 6 | Accelerated-inference benchmark on LinuxONE | not started | |
| 7 | Weight export + x86 load check | in progress | #65, #67, #101 |
| 8 | Site: district circles, pickers, score threshold, ranked list | in progress | #67, #75, #76 |
| 9 | Evidence screenshots (see [CHECKLIST.md](../evidence/CHECKLIST.md)) | not started | |
| 10 | Video | not started | |
| 11 | Submission | not started | |

## Now

- **Server operator**: Adriel (@AdrielAu), from 2026-10-17, for the #43 pull
- **Scope**: England MVP; clusters, driver chart and cultural demand gap come later.
- **NN2 release prerequisites**: pretrained-model competition eligibility, browser/LinuxONE model gates and offline geography/tooling feasibility. [Spec #110](https://github.com/AdrielAu/PlotLuck/issues/110) is published; see [the plan](../plans/nn2-integration.md) for interview context. The earlier [MVP planning map](https://github.com/AdrielAu/PlotLuck/issues/33) is closed; its NN1 decisions remain in force.
- **Next**:
  1. Work the [MVP spec](https://github.com/AdrielAu/PlotLuck/issues/64)'s tickets. The tracer bundle (#65) is in `data/sample/`; the site can build against it now.
  2. All five [MVP datasets](https://github.com/AdrielAu/PlotLuck/issues/43) are pulled and extracted on LinuxONE; next is running `python -m plotluck.build` on them there (phase 1 closes when it builds).
  3. Pull the new Census and tourism sources for #101 and retrain on LinuxONE before replacing the sample-trained version 2 bundle. The committed demographic and tourism fixtures are synthetic.
  4. NN2 integration has started with #115's manual draft/confirmation foundation. Eligibility, model/geography feasibility and browser interpretation remain open in spec #110's child issues.
