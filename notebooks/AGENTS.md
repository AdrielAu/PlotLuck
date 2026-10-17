# Notebooks

Ingest, training, benchmark and export notebooks. Keep them thin: orchestration and plots here, logic in the `plotluck` package.

- The server is s390x, which is big-endian. Anything that reads or writes raw bytes (arrays, weights) must state its byte order.
- Build paths with `pathlib`.
- Get the data folder from `plotluck.data_dir()`; never hard-code `data/sample` or `data/full`. The override is in [`data/AGENTS.md`](../data/AGENTS.md).
- Save evidence per [`docs/evidence/CHECKLIST.md`](../docs/evidence/CHECKLIST.md).
- Clear all outputs before committing. Results worth keeping go to `runs/<yyyy-mm-dd>-<step>/` (see [`runs/README.md`](../runs/README.md)).
- Server operation (tunnel, shared clone, handover) lives in [`docs/server.md`](../docs/server.md).

`smoke.ipynb` resolves the data folder and lists it; run it first to confirm an environment works.
