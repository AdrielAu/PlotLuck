# Contributing

Plotluck currently scores English postcode districts using cuisine-and-trait pickers, district centroid circles, a score threshold and a ranked list. NN1 runs in the browser from exported JSON weights. Required competition scope adds browser NN2 interpretation and confirmed search areas; see [the plan and its confirmation status](docs/plans/nn2-integration.md). This page is the layout and the workflow. First-time setup is in [docs/setup.md](docs/setup.md). Keep this page and the repo map in root `AGENTS.md` in step: change both together.

## Layout

- `src/plotluck/`: the installable Python package.
- `tests/`: pytest tests; they run on `data/sample/`. `tests/js/`: Node tests of the site's scoring, picker, interpretation and kitchen-roster modules (`node --test`, Node 22+, no install).
- `tests/browser/`: real-browser confirmation flows; see [browser test setup](docs/setup.md#browser-flow-tests).
- `data/`: `sample/` is committed and used locally; `full/` is git-ignored and exists only on the server. See `data/AGENTS.md`.
- `notebooks/`: ingest, training, benchmark and export notebooks.
- `runs/`: committed run results.
- `web/`: the static site deployed to GitHub Pages; exported weights go in `web/models/`.
- `docs/`: [PROJECT.md](docs/competition/PROJECT.md) (plan, open questions, platform facts), [PROGRESS.md](docs/competition/PROGRESS.md) (build status per phase), [DELIVERABLES.md](docs/competition/DELIVERABLES.md) (what we submit and when), [server.md](docs/server.md) (operator runbook), `evidence/` (datathon evidence checklist), `adr/` (decisions; created with the first one), `agents/` (agent conventions).
- [GLOSSARY.md](GLOSSARY.md): domain terms.
- `docs/plans/`: feature plans, including their confirmation status and acceptance gates.
- `.agents/skills/`: shared agent skills.

## Workflow

1. Open or pick a GitHub issue.
2. Branch off `main`.
3. Build and test locally on the **data sample** (`pytest`, and `node --test` for `web/` changes).
4. Open a PR and merge it once the Tests workflow (`pytest` and `node --test`) passes. Never push to `main`.
5. The **server operator** pulls `main` and runs on the full data on LinuxONE ([docs/server.md](docs/server.md)).
6. If code passes locally but fails on the server, file a `linux-only` issue; the operator fixes it on a `fix/linux-*` branch and opens a PR.

Development is on Windows; the code runs on Linux s390x. Use `pathlib` for paths, keep LF line endings and consistent filename case.

## File size

Keep every committed file under 5 MB: samples, run results and evidence screenshots.

## Where results land

- `runs/<yyyy-mm-dd>-<step>/`: metrics, loss curves and benchmark timings ([runs/README.md](runs/README.md)).
- `web/models/`: the bundle the site loads, from the latest full-data run on LinuxONE.
- `docs/evidence/`: evidence for the datathon submission ([CHECKLIST.md](docs/evidence/CHECKLIST.md)).
