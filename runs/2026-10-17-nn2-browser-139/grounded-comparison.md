# Local lookup and bounded manual recovery

Historical broad-contract experiment. The subsequent [five-input report](focused-extraction.md)
records the user's narrowed scope and total-rent-budget clarification. The current
preview runs that focused contract. Exact broad-run worker/harness/module bytes
are preserved under `grounded-v1-sources/`, matching the recorded source hashes.

The user requested verification of description extraction followed by downloaded
database lookup, plus manual completion after two or three failed attempts.
**The tested approach did not improve model quality.** Manual recovery is a user
workflow, not a successful model interpretation.

## Comparison on unchanged development cases

| Measure | Baseline | Baseline + lookup replay | Revised extraction + local hints/lookup |
|---|---:|---:|---:|
| Development requests | 20 | Same 20 replies | Same 20 descriptions, new inference |
| Parseable JSON | 20/20 | Unchanged | 19/20 |
| Strictly validated drafts | 4/20 | Unchanged | 0/20 |
| Complete expected profile/location intent correct | 2/20 | 2/20 | 0/20 |
| Warm sample p95, timed failures included | 7.5333 s | Not remeasured | 17.4314 s |
| Cold download/load/grammar initialization | 40.1331 s | Not remeasured | 28.7912 s |
| External model/library/runtime response-body bytes | 287,634,697 | No model download | 287,646,460 |
| Local geography response-body bytes | 0 | File replay | 1,325,270 |

Lookup-only replay adds **zero** complete successes. It supplies real typed
catalogue candidates for all four validated baseline drafts, but cannot correct
omitted vegan options, fabricated evidence or wrong distance intent. The two
otherwise correct replies retain multiple place candidates: location resolution
still requires the user's confirmation. This is not a claim of resolved-location
release correctness.

The revised contract loses **2/20 successes (10 percentage points)** and adds
**9.8981 seconds** to sample p95. The 19th sorted request time out of 20 is
17.4314 s; the maximum is 33.4529 s, a truncated request preserved as a failure.
Every measured request exceeded 10 s. Downloads remain below 400,000,000 bytes,
including the separate local catalogue, but quality and latency fail. This is
one sequential development run, not release evaluation or a controlled causal
estimate of lookup's effect.

## What changed

The browser candidate/model/runtime pins remain unchanged. The experimental
`grounded` mode uses a shorter flat cuisine/traits extraction contract with
literal evidence, while the original baseline mode remains available. Local
whole-word cuisine and place-name/alias matches are supplied as hints to NN2;
the model must still interpret cuisine, traits and geographic intent. After
strict normalization/validation, extracted place text is matched against the
downloaded catalogue. Only catalogue entries provide authoritative IDs,
coordinates and district membership. No failed reply is repaired or accepted.

In this run the model invented trait names/value associations, used null cuisine
evidence, copied whole descriptions as place text, and copied the prompt's
example radius into requests with no radius. One output hit the token limit.
The schema's shared trait-value enum permits values belonging to another trait;
the independent validator correctly rejects them. These failures show that
constraining JSON alone does not make this model follow extraction semantics.

The new contract and local hints changed together. The negative result cannot
be attributed to database lookup alone; the separate replay isolates lookup
without changing generated content. Do not generalize this one failed variant
to every possible grounded interpreter. The next candidate/prompt investigation
must retain these misses and preserve the current gates. No further prompt
tuning or model selection is claimed here.

## Reproduction and evidence

Use the browser environment in [the baseline report](README.md): Edge
155.0.4283.45, Intel gen-12lp WebGPU, i9-12900H, Windows x64, Node 24.22.0,
Qwen2.5-0.5B-Instruct q4f16_1 MLC revision
`32ff081fe7e4dfe4ffb167b94c66fdf11e02b8ad`, WebLLM 0.2.86. Exact pinned
runtime/library URLs, environment, source hashes and measured transfers are in
`browser-grounded.json`. It preserves both raw generation and, when successful,
the normalized reply; all 20 replies in this run failed. The adjacent scores
report preserves the errors and denominator.

```powershell
# First set PLOTLUCK_PLAYWRIGHT and PLOTLUCK_BROWSER as in README.md.
$env:PLOTLUCK_NN2_MODE = 'grounded'
node scripts/prove-nn2-browser.mjs runs/2026-10-17-nn2-browser-139/browser-grounded.json
node scripts/score-nn2.mjs runs/2026-10-17-nn2-browser-139/browser-grounded.json
node scripts/replay-nn2-lookup.mjs runs/2026-10-17-nn2-browser-139/browser-development.json
```

`browser-development.json.lookup.json` records the replay, baseline/catalogue
hashes and typed candidates without selecting ambiguous locations. Original
baseline files and human-approved labels/rubric remain unchanged. The browser
receives only development descriptions, never heldout descriptions or labels.
All 100 heldout cases remain reserved. Source hashes in each run identify the
actual harness/worker/contract used; historical baseline code is in commit
`532acb3`.

## Manual recovery preview

Open the static site with `?nn2=1` and expand **Try a restaurant description
(experimental)**. The failed candidate is hidden in the ordinary site. The
preview discloses the download and offers an explicit Download and interpret
action, progress, cancellation and manual entry. No model request starts on
page load. Descriptions/drafts stay in tab memory; only model files use the
runtime's model cache.

Each description permits at most **three user-triggered attempts**, including
cancelled attempts. No automatic retry loop runs. Changing the description
resets the allowance. After three failures, interpretation is disabled, the
cuisine field receives focus, and advice asks the user to choose or check the
missing/uncertain cuisine, search area and traits. Dietary flags should reflect
what is offered; an uncertain price can remain Unknown. Manual entry is
available immediately. Defaults and inferred/explicit values are shown for
successful proposals, with unsupported details listed as unused in scoring.

Failures, cancellation and late replies preserve manual choices and confirmed
results. Selecting a place is explicit even when only one candidate exists;
unknown explicit locations block comparison. Radius searches use catalogue
centres and district centroids, converting model-stated miles to kilometres.
Only Compare districts applies the profile and selected area to the map/list.
Empty scopes stay empty. The ordinary manual path also offers local place/radius
selection without downloading a model.

Real-browser tests mock the model worker to exercise three failures, attempt
reset, manual correction, stale replies, a successful draft, ambiguous London,
unresolved places and district filtering. These tests verify workflow behavior,
not model quality; the real-model run above supplies the quality evidence.
Desktop/mobile screenshots were inspected and the design detector reported no
findings. No LinuxONE run, heldout evaluation, release privacy/cache audit or
production model approval is claimed.
