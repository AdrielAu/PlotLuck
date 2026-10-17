# Sample site bundle

[Tracer: build the site bundle from sample sources](https://github.com/AdrielAu/PlotLuck/issues/65) supplies the Python-to-browser contract for the first end-to-end sample. It is not the full-data model or an evaluation of restaurant success.

## Build

Install the package and test dependencies in Python 3.12 using [setup](setup.md). NumPy and PyTorch match the recorded LinuxONE image versions; a local CPU-only PyTorch wheel can be installed from `https://download.pytorch.org/whl/cpu`.

PowerShell:

```powershell
$env:PLOTLUCK_DATA = "sample"
python -m plotluck.bundle data/sample/bundle --run-dir .claude/worktrees/65-sample-run
```

The public Python interface is `build_bundle(output_dir, *, epochs=3, seed=0, run_dir=None)`. Sources come from `plotluck.data_dir()`. Without `run_dir`, private output goes to the sibling `<output-name>-run` folder. Keep that folder outside the publicly deployed site. The tracer refuses `PLOTLUCK_DATA=full`; later stages must replace its sample-only shortcuts before the LinuxONE full-data build.

One call writes:

- `districts.csv`: the seven ADR 0004 columns, covering every English district in the input ONSPD. Missing population is blank; rent is blank until VOA is available. Neither becomes a fabricated zero.
- `district_cuisine_supply.csv`: `postcode_district,cuisine_group,restaurants`. A missing pair means zero; groups sum to the district's total restaurants.
- `vocabulary.json`: `version`, `cuisines` entries (`cuisine`, `cuisine_group`, `label`), and `traits` entries (`name`, `kind`, `values`, `default`). Kind is `single_choice` or `on_off`.
- `model.json`: version `1.0`, `features`, `transforms`, `layers` and `activations`.
- `reference.json`: `version`, `tolerance` (maximum absolute error `1e-6`) and `profiles`. Each entry contains a fixed synthetic `profile` and `scores`, a list of `{postcode_district, score}` computed by the trained PyTorch model.

The private run folder contains the prepared 15-column `restaurants.csv` and `metrics.json` (seed, epochs, training losses, counts, dropped inputs and limitations). Only aggregate metrics belong in committed run folders; individual restaurant rows remain separate from the bundle. Committed restaurant rows are synthetic.

## Forward-pass contract

The browser maps the selected fine `cuisine` to `cuisine_group` using the vocabulary, and gets `same_cuisine_supply` from the district/group table. Missing supply pairs are zero. Restaurant inputs precede district inputs in their declared order.

The public profile uses `chain`; the prepared restaurant CSV retains ADR 0004's `is_chain` column. The other flag names are `vegetarian_friendly`, `vegan_options` and `gluten_free`.

For each input, a key in `transforms.categorical_vocabs` creates a one-hot block in that vocabulary's order. An unseen value gives an all-zero block. `transforms.defaults` holds defaults for absent profile fields. Each remaining input creates one scalar using `transforms.numeric[name]`: impute a missing/nonfinite value with the raw-unit `median`, apply `log1p` when declared, then subtract `mean` and divide by positive `std`. Boolean traits have identity transforms.

For each dense layer, compute `weights @ vector + biases`; weights have one row per output unit. Apply the corresponding activation (`relu`, `relu`, `sigmoid`). Shapes are inputs → 64 → 32 → 1. All numbers are JSON decimals. Use the reference fixture to check the complete encoding and forward pass before integrating with the map.

## Regenerate the committed sample

Build as above, then replace the old top-level sample stubs with the generated outputs:

```powershell
Copy-Item data/sample/bundle/districts.csv data/sample/districts.csv
Copy-Item data/sample/bundle/model.json data/sample/model.json
Copy-Item .claude/worktrees/65-sample-run/restaurants.csv data/sample/restaurants.csv
```

Keep `runs/2026-10-17-tracer/metrics.json` with the demonstrated run, and regenerate it when replacing that run's artifacts. All artifact files remain below the 5 MB limit.

## Limits and checks

The tracer uses only the current sample's cuisine tags, a rating-only placeholder label, a few epochs, no CV, unadjusted training supply and no trait fill-rate rule. Missing rent is omitted from model inputs and reported in run results. These are explicitly temporary: cuisine, labels, traits, district inputs, privacy enforcement and full CV have separate implementation issues. No LinuxONE or model-quality claim follows from this sample run.

```powershell
python -m pytest tests/test_bundle.py tests/test_data_formats.py
python -m mypy src/plotluck/bundle.py --follow-imports=silent
```

The build tests use only sample data. Independent NumPy encoding and inference check PyTorch reference scores, and repeated seed-0 builds produce identical model JSON.
