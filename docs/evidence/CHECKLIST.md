# Evidence capture checklist

Screenshots prove the judged steps. Anyone on the team can capture one: take the shot, save it in this folder under the filename below, tick the row's box, and open a normal PR. Nobody owns this list.

## Rules

- **Redact before committing** (the repo is public). Blur the VM IP, the Jupyter token and key fingerprints. Keep `linux1`@hostname and `s390x` visible, since they are the proof.
- **Naming**: `NN-<step>[-<n>].png`, numbered in judged order. Use `-2`, `-3` for extra shots of one step. No dates. A re-capture overwrites the old file; git keeps the history.
- **Size**: keep each file under 5 MB.
- **Run folders**: `runs/<yyyy-mm-dd>-<step>/` holds machine output only (metrics JSON, loss PNGs, timings). Screenshots live here, not there. `<yyyy-mm-dd>` is the date of the run you are linking to.

## Shots

| Step | Filename | What must be visible | Run folder | Done |
|---|---|---|---|---|
| SSH + `lscpu` | `01-ssh-lscpu.png` | SSH session on `linux1`@hostname; `lscpu` output showing `s390x` architecture and Big Endian byte order | none | [ ] |
| `docker ps` | `02-docker-ps.png` | `docker ps` listing the running JupyterLab container (name, image, status Up) | none | [ ] |
| JupyterLab | `03-jupyterlab.png` | JupyterLab open in the browser with the file browser showing the repo, and a notebook open | none | [ ] |
| Ingest | `04-ingest.png` | Ingest notebook with executed cells and visible output (row counts, no errors) | `runs/<yyyy-mm-dd>-ingest/` | [ ] |
| Train NN1 | `05-train-nn1.png` | NN1 training notebook with the loss curve or final epoch log, run on the server | `runs/<yyyy-mm-dd>-train-nn1/` | [ ] |
| Train NN2 | `06-train-nn2.png` | NN2 training notebook with the loss curve or final epoch log, run on the server | `runs/<yyyy-mm-dd>-train-nn2/` | [ ] |
| Metrics | `07-metrics.png` | Hybrid model evaluation metrics table or plot, with metric names and values readable | `runs/<yyyy-mm-dd>-metrics/` | [ ] |
| Inference benchmark | `08-inference-benchmark.png` | Accelerated-inference benchmark output: the NNPA device in use and the timings next to the CPU baseline | `runs/<yyyy-mm-dd>-inference-benchmark/` | [ ] |
| Weight export | `09-weight-export.png` | Export cell output listing the written weight files with sizes, and the x86 load check passing | `runs/<yyyy-mm-dd>-weight-export/` | [ ] |
| Live site | `10-live-site.png` | The GitHub Pages site open in a browser with the address bar showing the live URL and the clustered map with scores loaded | none | [ ] |
