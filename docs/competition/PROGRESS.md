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
- **NN2 release prerequisites**: model/runtime notices, browser/LinuxONE model gates and offline geography/tooling feasibility. Pretrained-weight permission is [team-confirmed](nn2-eligibility.md) on 2026-10-17. [Spec #110](https://github.com/AdrielAu/PlotLuck/issues/110) is published; see [the plan](../plans/nn2-integration.md) for interview context. The earlier [MVP planning map](https://github.com/AdrielAu/PlotLuck/issues/33) is closed; its NN1 decisions remain in force.
- **Next**:
  1. The full-data run ([`runs/2026-10-17-train-nn1/`](../../runs/2026-10-17-train-nn1/)) is in `web/models/`: NN1 MAE 0.0503 against 0.0823 for the baseline over 5 district-grouped folds, and x86 parity passes on the s390x weights. VOA was kept (213 districts without rent). 101 of 2,324 districts have no Census match (ONSPD has no active English postcode-to-MSOA link for them) and use the training median.
  2. Accelerated-inference benchmark on LinuxONE (phase 6).
  3. Evidence screenshots for the training run, metrics and x86 load check (phase 9).
  4. NN2 work is on [draft integration PR #134](https://github.com/AdrielAu/PlotLuck/pull/134). #115 is merged; #112 records team-confirmed permission; #114 provides the complete offline England catalogue and reproducible preparation. #113 provides the pinned interpreter and human-operator notebook; the latest compact-output browser run improved latency but scored 0/3 correct. The LinuxONE native CPU run (#140) stayed within 60 seconds per request but also scored 0/3, with malformed JSON. Heldout cases remain reserved. The user stopped work after the proof wrap-up; no downstream ticket has started. #110 and #113 remain open, with browser integration pending.
