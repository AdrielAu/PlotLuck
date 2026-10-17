# Data

`data/sample/` is committed. `data/full/` is git-ignored and exists only on the LinuxONE server. Code never names either path: call `plotluck.data_dir()`, which picks the folder (`PLOTLUCK_DATA=sample|full` overrides).

## Cutting the sample

Cut the sample from the full data with a script in the package, so it can be rerun. Keep every sample file under 5 MB and keep the same schema as the full file. Record how each sample was cut (seed, filter, row count) next to the script.

## Sources and licences

Record each dataset's source URL, licence and retrieval date in `data/SOURCES.md`, one section per dataset, when the dataset first lands. Add the entry in the same PR as the data.
