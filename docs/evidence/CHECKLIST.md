# Evidence capture checklist

Screenshots prove the judged steps. Anyone on the team can capture one: take the shot, save it in this folder under the filename below, tick the row's box, and open a normal PR. Nobody owns this list.

## Rules

- **Redact before committing** (the repo is public). Blur the VM IP, the Jupyter token and key fingerprints. Keep `linux1`@hostname and `s390x` visible, since they are the proof.
- **Naming**: `NN-<step>[-<n>].png`, numbered in judged order. Use `-2`, `-3` for extra shots of one step. No dates. A re-capture overwrites the old file; git keeps the history.
- **Size**: keep each file under the [size cap](../../CONTRIBUTING.md#file-size).
- **Run folders**: `runs/<yyyy-mm-dd>-<step>/` holds machine output only (metrics JSON, loss PNGs, timings). Screenshots live here, not there. `<yyyy-mm-dd>` is the date of the run you are linking to.

## Shots

Required team scope includes browser NN2 interpretation, a confirmed profile/search area and NN1 district scores. Capture LinuxONE NN2 inference/evaluation separately from NN1 training and accelerated-inference benchmarks. Using pretrained NN2 weights is not training NN2; pretrained-weight competition permission is [team-confirmed](../competition/nn2-eligibility.md), with final artifact licences/notices still requiring review. See [the plan](../plans/nn2-integration.md). Keep step numbers stable.

| Step | Filename | What must be visible | Run folder | Done |
|---|---|---|---|---|
| SSH + `lscpu` | `01-ssh-lscpu.png` | SSH session on `linux1`@hostname; `lscpu` output showing `s390x` architecture and Big Endian byte order | none | [x] |
| `docker ps` | `02-docker-ps.png` | `docker ps` listing the running JupyterLab container (name, image, status Up) | none | [x] |
| JupyterLab | `03-jupyterlab.png` | JupyterLab open in the browser with the file browser showing the repo, and a notebook open | none | [x] |
| Ingest | `04-ingest.png` | Ingest notebook with executed cells and visible output (row counts, no errors) | `runs/<yyyy-mm-dd>-ingest/` | [x] |
| Train NN1 | `05-train-nn1.png` | NN1 training notebook with the loss curve or final epoch log, run on the server | `runs/<yyyy-mm-dd>-train-nn1/` | [x] |
| NN2 LinuxONE inference/evaluation | `06-nn2-inference.png` | Synthetic description, validated profile/location output, model revision, runtime, s390x environment and measured timings/quality; label pretrained inference accurately | `runs/<yyyy-mm-dd>-nn2-evaluation/` | [ ] |
| NN2 browser evaluation | `06-nn2-inference-2.png` | Browser/hardware, model/runtime revisions, download bytes, warm latency and quality results against the plan's gates | `runs/<yyyy-mm-dd>-nn2-browser/` | [ ] |
| Metrics | `07-metrics.png` | NN1 evaluation metrics table or plot, with metric names and values readable | `runs/<yyyy-mm-dd>-metrics/` | [x] |
| Inference benchmark | `08-inference-benchmark.png` | Accelerated-inference benchmark output: the NNPA device in use and the timings next to the CPU baseline | `runs/<yyyy-mm-dd>-inference-benchmark/` | [ ] |
| Weight export | `09-weight-export.png` | Export cell output listing the written weight files with sizes, and the x86 load check passing | `runs/<yyyy-mm-dd>-weight-export/` | [x] |
| Live site | `10-live-site.png` | GitHub Pages URL visible; England district circles with scores loaded, cuisine/trait pickers, score threshold and ranked list | none | [x] |
| NN2 live site | `10-live-site-3.png` | GitHub Pages URL visible; description interpreted, editable profile and confirmed search area, scoped district circles, score threshold and ranked list | none | [ ] |
