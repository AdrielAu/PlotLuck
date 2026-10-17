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
| 1 | Data ingest: sources → one row per restaurant | in progress | #43, #42 |
| 2 | Labels: review-based success | not started | #36, #47 |
| 3 | NN1 | not started | #62 |
| 4 | Free-text interpretation (after MVP) | not started | #35 |
| 5 | NN1 spatial-CV evaluation | not started | |
| 6 | Accelerated-inference benchmark on LinuxONE | not started | |
| 7 | Weight export + x86 load check | not started | |
| 8 | Site: district circles, pickers, score threshold, ranked list | not started | |
| 9 | Evidence screenshots (see [CHECKLIST.md](../evidence/CHECKLIST.md)) | not started | |
| 10 | Video | not started | |
| 11 | Submission | not started | |

## Now

- **Server operator**: Adriel (@AdrielAu), from 2026-10-17, for the #43 pull
- **Scope**: England MVP; clusters, driver chart and cultural demand gap come later.
- **Blockers**: none. The [MVP planning map](https://github.com/AdrielAu/PlotLuck/issues/33) is closed: formats ([ADR 0004](../adr/0004-restaurant-district-and-model-file-formats.md)), sources ([ADR 0003](../adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md)), [cuisine taxonomy](https://github.com/AdrielAu/PlotLuck/issues/53) and [NN1 architecture](https://github.com/AdrielAu/PlotLuck/issues/62) are all decided.
- **Next**:
  1. Write the MVP spec from the map (`/to-spec`), then split it into implementation tickets (`/to-tickets`).
  2. Continue [dataset acquisition](https://github.com/AdrielAu/PlotLuck/issues/43) on LinuxONE.
