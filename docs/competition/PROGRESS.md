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
| 1 | Data ingest: sources → one row per restaurant | in progress | #43, #42, #65, #68, #82 |
| 2 | Labels: review-based success | done | #36, #47, #69 |
| 3 | NN1 | in progress | #62, #65, #74 |
| 4 | Free-text interpretation (after MVP) | not started | #35 |
| 5 | NN1 spatial-CV evaluation | in progress | #74, #77 |
| 6 | Accelerated-inference benchmark on LinuxONE | not started | |
| 7 | Weight export + x86 load check | in progress | #65, #67 |
| 8 | Site: district circles, pickers, score threshold, ranked list | in progress | #67 |
| 9 | Evidence screenshots (see [CHECKLIST.md](../evidence/CHECKLIST.md)) | not started | |
| 10 | Video | not started | |
| 11 | Submission | not started | |

## Now

- **Server operator**: Adriel (@AdrielAu), from 2026-10-17, for the #43 pull
- **Scope**: England MVP; clusters, driver chart and cultural demand gap come later.
- **Blockers**: none. The [MVP planning map](https://github.com/AdrielAu/PlotLuck/issues/33) is closed: formats ([ADR 0004](../adr/0004-restaurant-district-and-model-file-formats.md)), sources ([ADR 0003](../adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md)), [cuisine taxonomy](https://github.com/AdrielAu/PlotLuck/issues/53) and [NN1 architecture](https://github.com/AdrielAu/PlotLuck/issues/62) are all decided.
- **Next**:
  1. Work the [MVP spec](https://github.com/AdrielAu/PlotLuck/issues/64)'s tickets. The tracer bundle (#65) is in `data/sample/`; the site can build against it now.
  2. Continue [dataset acquisition](https://github.com/AdrielAu/PlotLuck/issues/43) on LinuxONE.
