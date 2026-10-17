# Plotluck – handover (updated 2026-10-16)

> Rough initial outline. All details are subject to change; treat "current plan" as a starting point, not a commitment.

## Context
- IBM Z Datathon 2026. Theme: Wildcard → sub-challenge **Community Impact**. Team of 5, working in person.
- Rules: project doc `Participant Guidebook_IBM Z Datathon 2026.md`. Build window **Oct 17–18**. All code from scratch in the window, so create the repo on the 17th. Final submission: ≤3-min video showing the LinuxONE instance and the model, GitHub repo, title containing the team name. Judges score community value, novelty, LinuxONE + AI/ML use (with screenshots), and pitch.
- The IBM labs are learning prerequisites only. The solution does not need to follow them.
- The abstract and design doc are an **initial concept** only; anything in them may change during the build. Next: the build.

## Product (current plan)
- Inputs: **cuisine** + other restaurant properties (TBD).
- Output: a 0–1 score per London **postcode district**. Map is colour-coded by score, filtered by a threshold slider (default 0.6). It uses **zoomable clustered nodes**: zoomed out, big nodes summarise an area (e.g. postcode area like E or SE); zooming in splits them into smaller nodes, down to individual districts, with a driver chart per district. Competitors not shown. **No LLM.**
- Motivation: a teammate's father's restaurant closed in COVID; help small independents; widen under-represented cuisines.
- Training unit: one row per **restaurant**. Scoring: a hypothetical restaurant placed in each district. Validate with spatial CV.
- Label: longevity, probably binary 3-year survival (exclude restaurants opened less than 3 years ago). Details TBD.
- **Model requirement: hybrid of 2 neural networks.** Roles and architecture TBD. Docs may say hybrid / multi-model.
- Diversity: cultural demand gap (Census vs supply). How it's used is TBD.

## Platform facts (LinuxONE Community Cloud)
- 1 VM shared by the whole team. Jupyter Lab runs in **Docker** (not Podman) on port 38888, with one shared token. Shared folder `/home/linux1/shared` ↔ `/home/ibm-user/shared`.
- Image includes PyTorch, TensorFlow/Keras, XGBoost, scikit-learn; ONNX export supported. Upload limit 200 MB. s390x.
- Setup repo: github.com/linuxone-community-cloud/jupyter-lab-ml

## Deployment (current plan)
- Train and evaluate both NNs in **Jupyter notebooks** (IBM's Jupyter Lab container) on LinuxONE, and **benchmark accelerated inference** there.
- Export the trained weights; a static **GitHub Pages** site runs them in-browser, so it stays live after the event. **Export format TBD**: ONNX + onnxruntime-web (default candidate, framework-neutral), TensorFlow.js (if Keras), or raw weights as JSON with a small JS forward pass. Test the export early: s390x is big-endian, so check that exported weights load correctly on an x86 browser (or export from a laptop using saved weights).
- Driver chart: must look visually pleasing; attribution method and chart style TBD.
- Fallback: precompute scores to JSON on LinuxONE. Stretch: live LinuxONE API during judging.

## Team workflow (current plan)
1. GitHub issue → local branch → test locally on a **data sample** → PR → merge to main.
2. **Server operator** (one person at a time; clear in person) pulls main and runs/tests on the full data.
3. Linux-only errors (pass on Windows, fail on server): open a `linux-only` issue; operator hotfixes on the server → `fix/linux-*` branch → PR to main.
- Locally, everyone runs the same notebooks/scripts on sample data in their own Python or Jupyter (no Docker needed on laptops).
- Pin `requirements.txt` to the IBM image versions.
- Avoid Windows-isms: `pathlib`, `.gitattributes` (LF), consistent filename case.

## Evidence (current plan)
- `docs/evidence/CHECKLIST.md` in the repo. Shots named by step.
- Capture: SSH login + `lscpu` (s390x), `docker ps`, Jupyter Lab, data ingest, training of both NNs (loss curves), metrics, accelerated inference benchmark, weight export, live site.

## Abstract (initial concept text)
- Problem (176/200): COVID closed many of London's small restaurants. New owners still pick sites on gut feel, and the city's under-represented cuisines rarely reach the communities that want them.
- Solution (192/200): An AI tool on IBM LinuxONE: enter a cuisine and restaurant traits, and models trained on how long London restaurants survived score every postcode district 0-1 and show what drives each score.
- Audience: 1 independent/first-time restaurateurs (primary), 2 under-represented food entrepreneurs, 3 diverse residents/students, 4 councils/BIDs, 5 small-business lenders/advisers.
- Datasets: OSM, Foursquare Open Places, FSA hygiene register, Companies House, ONS Census 2021, TfL entries/exits, VOA rateable values, IMD, ONS Postcode Directory. Excluded: police crime data, Google reviews.

## Design doc
- `Plotluck_Design_Doc.pdf` (2 pages A4), built by `claude/plotluck_build_doc.py` in this project: `python3 plotluck_build_doc.py out.pdf` (DejaVu fonts).
- Reflects everything above (hybrid 2-NN, Docker, ONNX → GitHub Pages, workflow). Map mock shows clustered nodes; export format and driver-chart method marked TBD.
- User prefs: keep TBD items general; check diagram labels fit their boxes after edits; keep handovers token-lean.

## Open
- Decide: the NN roles and architecture, the non-cuisine properties, the exact label, how diversity is used and who operates the server.
