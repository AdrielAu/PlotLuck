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
| 1 | Data ingest: sources → one row per restaurant | not started | |
| 2 | Labels: survival at the survival horizon | not started | |
| 3 | NN1 | not started | |
| 4 | NN2 | not started | |
| 5 | Hybrid model + spatial-CV evaluation | not started | |
| 6 | Accelerated-inference benchmark on LinuxONE | not started | |
| 7 | Weight export + x86 load check | not started | |
| 8 | Site: map, clusters, driver chart | not started | |
| 9 | Evidence screenshots (see [CHECKLIST.md](../evidence/CHECKLIST.md)) | not started | |
| 10 | Video | not started | |
| 11 | Submission | not started | |

## Now

- **Server operator**: unassigned
- **Blockers**: none
- **Next**:
  1. Decide the NN roles and architecture, the traits and the exact label (open in [PROJECT.md](PROJECT.md#open)).
  2. Start data ingest.
