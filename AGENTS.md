# Plotluck

Plotluck's MVP scores English postcode districts (0–1) for the expected review-based success of a restaurant of a given cuisine and traits. It shows district centroid circles, a score threshold and a ranked list. Built for the IBM Z Datathon 2026 (Community Impact), Oct 17–18, by a team of 5.

Current implementation constraints:

- The product accepts one free-text restaurant description. Browser NN2 reads it; clear valid interpretations go directly to NN1 results. Ask only for unclear or invalid details, with offline place resolution and no routine questions, review card or results pickers. Model loading starts on submission with size disclosure, progress and cancellation. Read the latest user amendment in [the NN2 plan](docs/plans/nn2-integration.md) before implementation; it supersedes the six-question/review flow in #136/#158 and [ADR 0006](docs/adr/0006-nn2-proposes-a-profile-and-search-area.md). Model quality and release gates remain open.
- Training and accelerated-inference benchmarks run in Jupyter on IBM LinuxONE (s390x, big-endian).
- The site is static on GitHub Pages and runs the exported weights in the browser, so it stays live after the event.
- Export uses raw JSON weights and a JavaScript forward pass. Architecture, preprocessing and exact file formats remain open in the [formats decision](https://github.com/AdrielAu/PlotLuck/issues/38).
- Follow [ADR 0003](docs/adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md): Tripadvisor-derived training rows stay on LinuxONE; restaurant samples are synthetic; publish only model outputs with the required attribution. The team accepted source-rights risk for non-commercial use, not unrestricted permission.

Read [`docs/competition/PROJECT.md`](docs/competition/PROJECT.md) before planning any feature, model or data work: it holds the current plan, open questions and platform facts. Everything in it is a starting point, not a commitment.

Read [`docs/competition/PROGRESS.md`](docs/competition/PROGRESS.md) at session start: it shows which build phase is where. When your PR changes a phase's status, update its row in the same PR. What we submit, and when, is in [`docs/competition/DELIVERABLES.md`](docs/competition/DELIVERABLES.md).

## Writing code

Before writing or changing code (including notebooks), read [`docs/agents/coding-guidelines.md`](docs/agents/coding-guidelines.md) and follow it.

## Repo map

Keep this map and `CONTRIBUTING.md` in step: change both together.

- `src/plotluck/`: the installable package. `tests/`: pytest, run on `data/sample/`; `tests/js/`: `node --test` for `web/scoring.js`, `web/pickers.js` and `web/results.js`.
- `tests/browser/`: real-browser confirmation flows; see [browser test setup](docs/setup.md#browser-flow-tests).
- `data/`: `sample/` committed, `full/` server-only; see `data/AGENTS.md`.
- `docs/competition/`: handover (`PROJECT.md`), build status (`PROGRESS.md`), submission list (`DELIVERABLES.md`) and the initial design doc.
- `docs/plans/`: feature plans, including their confirmation status and acceptance gates.
- `docs/setup.md`: one-time clone setup, per agent tool. `docs/server.md`: operator runbook. `docs/evidence/`: evidence checklist.
- `CONTRIBUTING.md`: layout and workflow for humans; `README.md`: user-facing.
- `notebooks/`: ingest, training, benchmark and export notebooks; see `notebooks/AGENTS.md`.
- `runs/`: committed run results; see `runs/README.md`.
- `web/`: static site deployed to GitHub Pages; see `web/AGENTS.md`.
- `.agents/skills/`: shared agent skills, the single copy every tool reads. Sources are pinned in `skills-lock.json`.

## Team workflow

1. GitHub issue → branch off `main` → test locally on a **data sample** → PR → merge.
2. One **server operator** at a time pulls `main` and runs on the full data on LinuxONE.
3. Code that passes locally but fails on the server gets a `linux-only` issue; the operator fixes it on a `fix/linux-*` branch → PR.
4. Never run `git push --force`, `git reset --hard`, `git clean -x`, `git checkout -- .` or `git stash drop`, and never push to `main`. If one seems needed, stop and ask.

## Cross-platform rules

Teammates develop on Windows; the code runs on Linux s390x.

- Build paths with `pathlib`.
- Keep line endings LF and filename case consistent.
- Pin `requirements.txt` to the IBM Jupyter image's versions.
- Check exported weights load on x86 (endianness) whenever the export format changes.

## Docs

Project docs live in `docs/`. Domain terms go in `GLOSSARY.md` at the root; hard-to-reverse decisions go in `docs/adr/`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `AdrielAu/PlotLuck` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
