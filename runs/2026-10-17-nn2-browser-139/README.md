# NN2 desktop browser investigation (#139)

**Candidate fails quality: 2/20 complete approved development requests correct.**
NN2 remains mandatory; all release gates stay unchanged. This run demonstrates
description-to-validated-draft inference for two cases, not a usable interpreter.
No prompt, model, runtime pin, expected label or inference rubric was changed.
Earlier failures remain in [the original experiments](../2026-10-17-nn2-evaluation/).

## Environment and reproduction

Run on 2026-10-17 using headless desktop Edge **155.0.4283.45**, WebGPU Intel
**gen-12lp**, Windows **10.0.26300 x64**, Intel Core **i9-12900H**, 20 logical CPUs,
34,035,830,784 bytes system memory and Node **24.22.0**. The adapter returned empty
device/description strings; a more specific GPU model was not measured. This is
one laptop run under ordinary desktop load, not a controlled release benchmark.

Qwen2.5-0.5B-Instruct q4f16_1 MLC revision
`32ff081fe7e4dfe4ffb167b94c66fdf11e02b8ad`, WebLLM **0.2.86**,
library repository revision `00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0`.
The report records full candidate URLs, native revision for reference, generation
usage when available, and SHA-256 hashes of the harness, worker, prompt/validator,
runtime configuration, scorer, vocabulary and unchanged benchmark. Native
inference was not run here. This is pretrained inference, not training or NNPA.

With the isolated Playwright tools installed per [setup](../../docs/setup.md#browser-flow-tests):

```powershell
$env:PLOTLUCK_PLAYWRIGHT = 'file:///' + $env:TEMP.Replace('\', '/') + '/plotluck-browser-tools/node_modules/playwright/index.mjs'
$env:PLOTLUCK_BROWSER = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node scripts/prove-nn2-browser.mjs runs/2026-10-17-nn2-browser-139/browser-development.json
node scripts/score-nn2.mjs runs/2026-10-17-nn2-browser-139/browser-development.json
```

Each invocation uses a fresh browser context and downloads the pinned assets.
The browser receives only all 20 approved development descriptions/IDs. No expected
labels or heldout descriptions are sent to it. The 100 heldout cases remain
reserved. Labels and the separate inference rubric retain the user's prior
approval. The development split covers only Thai/Italian, ten locations,
restaurant venue type, vegan options and explicit 3 km searches; it cannot
establish broad cuisine, negation, ambiguity or contextual-inference quality.

## Measurements

| Measurement | Result |
|---|---:|
| Parseable JSON | 20/20 |
| Strictly validated drafts | 4/20 |
| Complete requests correct | 2/20 |
| Cuisine correct, requiring validated draft | 4/20 |
| Location intent correct, requiring validated draft | 3/20 |
| Expected explicit traits correct, requiring validated draft | 2/20 |
| Warm timed requests, including failures | 20 |
| Warm nearest-rank sample p95 | 7.5333 s |
| Warm minimum / maximum | 5.1387 / 7.7490 s |
| Cold download + initialization + grammar compilation | 40.1331 s |
| External download span, overlapping cold initialization | 17.2524 s |
| Model/config/tokenizer/library response-body bytes | 285,784,349 |
| Supporting runtime response-body bytes | 1,850,348 |
| Total external response-body bytes | 287,634,697 |
| Failed or unmeasured transfers | 0 |

The measured total fits the **400,000,000-byte** budget, conservatively including
runtime and redirect bodies. These are actual Playwright response-body sizes,
not advertised shard sizes, wire bytes or GPU memory. Geography is not loaded.
Download span is the first external request start to the last response finish,
including intervening initialization; it is not a separately isolated download
time. Cold initialization includes model download, engine load and grammar warmup.

The sample p95 is the 19th sorted duration of 20 sequential development requests,
including all timed failures. It is below the **10 s** gate numerically; this
small, narrow development sample does not establish release p95. The **95/100**
quality gate is unevaluated and this development result is far below its target.
LinuxONE's **60 s** gate remains unmeasured by this task.

## Failures and semantic review

`browser-development.json` preserves every synthetic raw reply, validation error,
timing and sanitized external transfer URL. Its adjacent `.scores.json` is
recomputed using the shipped vocabulary and validator. No invalid output enters
NN1. Location text remains a proposal: geometry and authoritative IDs must come
from deterministic offline lookup and user confirmation in later integration.

- Eleven replies failed literal-evidence validation, including `Thailand` for
  `Thai`; five failed location-distance consistency checks.
- `clear-004` passed structural validation with `Leeds` as evidence for Thai
  cuisine, invented `near=true,distance=12.34`, and omitted vegan options. Literal
  substring evidence alone cannot establish semantic truth. The value-only
  cuisine component passes, while the complete request fails. The component
  counts do not assess evidence relevance or inferred-proposal acceptability.
- `clear-013` extracted Italian and Manchester within 3 km correctly but omitted
  explicit vegan options. It remains a complete-request failure.
- `clear-011` and `clear-017` passed validation and expected values, preserving
  London and Birmingham respectively. Omitted venue type receives the shipped
  Restaurant default; this passes expected-value scoring but does not demonstrate
  explicit venue provenance extraction. Neither success resolves a place to
  authoritative geography or demonstrates contextual inference.

## Revised investigation proposal

The measured baseline suggests grammar constraints ensure JSON shape but cannot
ensure grounded extraction. Next, compare a shorter, staged extraction prompt
against this unchanged baseline on **the same 20 development cases**: first
identify cue-backed cuisine/traits, then location intent, retaining raw model
outputs and strict validation. Include concise examples for absent distances and
explicit vegan options without copying them into unrelated requests. This is a
proposal, **not an implemented or measured improvement**. Do not replace inference
with a handwritten parser or relax evidence/distance checks.

Measure the sum of both stages' warm latency and complete-request correctness;
extra passes may exceed 10 s given the current 5.14–7.75 s single-pass range. If
development quality still fails, investigate another quantized instruction model
only after verifying measured model/supporting downloads fit 400 MB. Human
approval of new labels and the separate contextual-inference rubric remains
required. Keep heldout cases reserved until prompt/candidate selection is frozen.
LinuxONE is the separate human-operator sibling task; UI and final release
evaluation remain #116–#121.

## Validation

20 Node tests, 173 Python tests and four real Edge confirmation-flow tests passed.
Changed JavaScript files pass `node --check`; no typechecker is configured.
The scorer regression checks malformed JSON, valid but semantically wrong drafts,
runtime errors with valid output and missing latency samples through the real
validator. No production UI integration, privacy/cache/cancellation release audit,
heldout evaluation or LinuxONE execution was performed.
