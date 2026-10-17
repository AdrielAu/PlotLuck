# Data

`data/sample/` is committed. `data/full/` is git-ignored and exists only on the LinuxONE server. Code never names either path (the resolver in `src/plotluck/data.py` is the one exception): call `plotluck.data_dir()`, which picks the folder. `PLOTLUCK_DATA=sample|full` overrides it; with it unset, `full` wins when `data/full/` exists.

## Cutting the sample

Cut the sample from the full data with a script in the package, so it can be rerun. Keep every sample file under the size cap in [`CONTRIBUTING.md`](../CONTRIBUTING.md#file-size) and keep the same schema as the full file. Record how each sample was cut (seed, filter, row count) next to the script.

When a dataset's licence forbids committing its rows, generate a synthetic sample with the same schema from a seeded script instead of cutting one. The restaurant rows are such a dataset; see [ADR 0003](../docs/adr/0003-train-on-tripadvisor-derived-data-publish-only-model-outputs.md).

## Sources and licences

Record each dataset's source URL, licence and retrieval date in [`SOURCES.md`](SOURCES.md), one section per dataset, when the dataset first lands. Add the entry in the same PR as the data.
