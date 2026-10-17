# Runs

Committed results of notebook runs, one folder per run: `runs/<yyyy-mm-dd>-<step>/`, for example `runs/2026-10-17-train-nn1/`.

- Put in each folder: aggregate metrics JSON, loss-curve PNGs, benchmark timings,
  and counts of fixes or exclusions by reason. Keep restaurant-level rows,
  names, links, addresses, locations, ratings, review counts, label-policy
  values (`R0`, `D0`, `n_ref`), district rating/review aggregates, per-tag
  frequencies and label-policy metadata on LinuxONE.
- `<step>` matches the step names in `docs/evidence/CHECKLIST.md` where one applies.
- Checkpoints (`.keras`, `.pt`, `.h5`) and intermediate arrays are git-ignored; do not commit them.
- Every committed file stays under the [size cap](../CONTRIBUTING.md#file-size).
