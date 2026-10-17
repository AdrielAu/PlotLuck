# Runs

Committed results of notebook runs, one folder per run: `runs/<yyyy-mm-dd>-<step>/`, for example `runs/2026-10-17-train-nn1/`.

- Put in each folder: metrics JSON, loss-curve PNGs and benchmark timings.
- `<step>` matches the step names in `docs/evidence/CHECKLIST.md` where one applies.
- Checkpoints (`.keras`, `.pt`, `.h5`) and intermediate arrays are git-ignored; do not commit them.
- Every committed file stays under the [size cap](../CONTRIBUTING.md#file-size).
