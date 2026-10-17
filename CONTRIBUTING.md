# Contributing

Plotluck scores London postcode districts for restaurant survival. This page is the layout and the workflow. First-time setup is in [docs/setup.md](docs/setup.md). Keep this page and the repo map in root `AGENTS.md` in step: change both together.

## Layout

- `src/plotluck/`: the installable Python package.
- `tests/`: pytest tests; they run on `data/sample/`.
- `data/`: `sample/` is committed and used locally; `full/` is git-ignored and exists only on the server. See `data/AGENTS.md`.
- `notebooks/`: ingest, training, benchmark and export notebooks.
- `runs/`: committed run results.
- `web/`: the static site deployed to GitHub Pages; exported weights go in `web/models/`.
- `docs/`: [PROJECT.md](docs/competition/PROJECT.md) (plan, open questions, platform facts), [server.md](docs/server.md) (operator runbook), `evidence/` (datathon evidence checklist), `adr/` (decisions; created with the first one), `agents/` (agent conventions).
- [GLOSSARY.md](GLOSSARY.md): domain terms.
- `.agents/skills/`: shared agent skills.

## Workflow

1. Open or pick a GitHub issue.
2. Branch off `main`.
3. Build and test locally on the **data sample** (`pytest`).
4. Open a PR and merge it. Never push to `main`.
5. The **server operator** pulls `main` and runs on the full data on LinuxONE ([docs/server.md](docs/server.md)).
6. If code passes locally but fails on the server, file a `linux-only` issue; the operator fixes it on a `fix/linux-*` branch and opens a PR.

Development is on Windows; the code runs on Linux s390x. Use `pathlib` for paths, keep LF line endings and consistent filename case.

## File size

Keep every committed file under 5 MB: samples, run results and evidence screenshots.

## Where results land

- `runs/<yyyy-mm-dd>-<step>/`: metrics, loss curves and benchmark timings ([runs/README.md](runs/README.md)).
- `web/models/`: final exported weights the site loads.
- `docs/evidence/`: evidence for the datathon submission ([CHECKLIST.md](docs/evidence/CHECKLIST.md)).
