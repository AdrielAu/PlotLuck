# Plotluck

Plotluck scores every London postcode district (0–1) for how well a hypothetical restaurant of a given cuisine would survive there, and shows the scores on a zoomable clustered map. Built for the IBM Z Datathon 2026 (Community Impact), Oct 17–18, by a team of 5.

Hard limits, fixed by the brief:

- The model is a hybrid of 2 neural networks. The product uses no LLM.
- Training and accelerated-inference benchmarks run in Jupyter on IBM LinuxONE (s390x, big-endian).
- The site is static on GitHub Pages and runs the exported weights in the browser, so it stays live after the event.

Read [`docs/competition/PROJECT.md`](docs/competition/PROJECT.md) before planning any feature, model or data work: it holds the current plan, open questions and platform facts. Everything in it is a starting point, not a commitment.

## Writing code

Before writing or changing code (including notebooks), read [`docs/agents/coding-guidelines.md`](docs/agents/coding-guidelines.md) and follow it.

## Repo map

Keep this map and `CONTRIBUTING.md` in step: change both together.

- `src/plotluck/`: the installable package. `tests/`: pytest, run on `data/sample/`.
- `data/`: `sample/` committed, `full/` server-only; see `data/AGENTS.md`.
- `docs/competition/`: handover (`PROJECT.md`) and the initial design doc.
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
