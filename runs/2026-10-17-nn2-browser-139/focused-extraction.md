# Five-input extraction and rent recovery

The user narrowed NN2 to **search area, cuisine, menu price band, restaurant type
and rent**. Existing MVP code prepares NN1 inputs. Rent is a total GBP monthly/
annual budget; the user confirms low/mid/high/any alongside it rather than using
an invented pounds-to-band conversion.

**Simple development results improved; explicit price/rent extraction remains
unreliable.** The candidate stays experimental. No release gates are waived.

## Measurements

Same 20 approved development descriptions, unchanged labels/rubric, same pinned
candidate and [reference hardware](README.md). All 100 heldout cases stay reserved.

| Run | Validated | Original full-trait metric | Narrowed input metric | Warm sample p95 |
|---|---:|---:|---:|---:|
| Compact baseline | 4/20 | 2/20 | 3/20 | 7.5333 s |
| Broad grounded variant | 0/20 | 0/20 | — | 17.4314 s |
| First five-input prompt | 0/20 | 0/20 | 0/20 | 3.9130 s |
| Five inputs + missing-value example | 20/20 | 13/20 | 20/20 | 2.0380 s |

The final run gains **17/20 (85 percentage points)** under the same narrowed
metric, and **11/20 (55 points)** under the original full-trait metric. Its seven
original-metric misses are the explicitly vegan descriptions, which NN2 no longer
extracts. The UI preserves manual dietary/chain choices rather than resetting
them from the model's omitted fields. Original full-trait scores stay separate.

These cases contain **no explicit menu prices or rent budgets**, and venue type
is always Restaurant. The narrowed metric tests price/rent absence/defaults only.
It cannot establish varied venue, explicit price/rent or contextual inference
quality. The example is approved development case `clear-011`, so this is prompt
development, not unseen generalization. Sample p95 is nearest-rank over 20 timed
requests, not final release p95.

Final cold initialization: **26.0451 s**; external model/config/tokenizer/library/
runtime response bodies: **287,650,192 bytes**; local catalogue: **1,325,270 bytes**.
Total: **288,975,462 bytes**, below 400,000,000. Initialization includes grammar
warmup; catalogue load is separately measured. The model/runtime pins did not change.

## Separate price/rent probes

`browser-rent-probes.json` preserves three unlabelled exploratory requests run
after selecting the prompt. No tuning followed these outputs, and no accuracy
percentage is claimed:

- Cheap Thai café, £2,000/month: returned Restaurant, unknown menu prices and
  null rent. Venue-evidence validation rejected it.
- Italian restaurant, moderate prices, £24,000/year: returned `$` and null rent.
  Price-evidence validation rejected it.
- £2,000 without a period: invented `year`. Period validation rejected it.

All three replies failed. They prevent a claim that five-input extraction is
solved. The validator now also rejects silently omitted rent when a GBP rent
budget is present; this post-run guard has a failing-then-passing regression.
Review also tightened the boundary to bind amount and period to an explicit rent
phrase, rejecting menu amounts and unrelated periods rather than mixing them.
Unit tests establish £2,000/month → £24,000/year adapter conversion, **not** LLM
rent extraction quality. The 20 successful raw model replies contain no rent;
replaying them through the current guard retains the same simple-case result.

## Implementation and recovery

Generated JSON has exactly `region`, `cuisine`, `price_band`, `venue_type`, `rent`.
The LLM does not emit provenance boilerplate, dietary flags, geometry, district
facts, vectors or scores. The adapter validates supported enums and literal cues,
supplies marks/defaults, and resolves location text against the downloaded
catalogue. Radius intent is handled by the area adapter. Ambiguity requires user
confirmation; unresolved locations block comparison.

NN1's `commercial_rent_index` remains district context. The newer MVP questions
branch (`origin/feat/135-questions-screen`, inspected at `6aba7e2`) defines
`rentBand` and district rent tertiles. The preview uses those same enums and
tertile/missing-value semantics. Numeric budgets never replace that feature.
After entering/extracting a numeric budget, the user must explicitly confirm a
rent band. Only that band filters districts; missing district rents survive Any
only. This does not claim premises are available at the user's total budget.

Open the site with `?nn2=1` for the experimental description panel. Model download
is explicit. At most three user-triggered attempts per description are allowed;
cancelled attempts count, and changing the description resets the allowance.
After exhaustion, interpretation is disabled and advice directs the user to the
five manual inputs. Manual entry is always available. Failed/cancelled/late
replies preserve choices and confirmed results. Compare districts is required to
apply a draft. Manual correction never counts as model accuracy.

## Reproduction and provenance

Set the browser environment as in README.md, then:

```powershell
$env:PLOTLUCK_NN2_MODE = 'focused'
Remove-Item Env:PLOTLUCK_NN2_PROBE_RENT -ErrorAction SilentlyContinue
node scripts/prove-nn2-browser.mjs runs/2026-10-17-nn2-browser-139/browser-focused-example.json
node scripts/score-nn2.mjs runs/2026-10-17-nn2-browser-139/browser-focused-example.json
node scripts/score-profile-inputs.mjs runs/2026-10-17-nn2-browser-139/browser-focused-example.json
node scripts/score-profile-inputs.mjs runs/2026-10-17-nn2-browser-139/browser-development.json

# Unlabelled probes, excluded from benchmark scorers.
$env:PLOTLUCK_NN2_PROBE_RENT = '1'
node scripts/prove-nn2-browser.mjs runs/2026-10-17-nn2-browser-139/browser-rent-probes.json
```

Reports preserve raw generation separately from normalized drafts, transfers,
errors, candidate URLs, hardware and source hashes. Scorers reject exploratory
IDs. `focused-first-sources/` preserves the first prompt; `focused-example-sources/`
preserves the measured final prompt/validator and pre-probe harness.
`grounded-v1-sources/` preserves broad-run code, including the older advice module
used by the first focused run. Other runtime/vocabulary/benchmark bytes remain
unchanged or are in original baseline commit `532acb3`. The post-run rent guards
are distinguished from measured code.

Workflow tests stub the model-worker boundary; the real WebGPU reports supply
quality evidence. LinuxONE, heldout evaluation, approved explicit price/rent
labels and release privacy/cache/cancellation audits remain outstanding.

Final validation: 30 Node tests, 173 Python tests and nine real Edge workflow
checks passed. JavaScript syntax checks pass; no typechecker is configured.
Desktop/mobile renders were inspected and the design detector reported no
findings. Review's rent-evidence and failed-worker-retry findings were fixed with
failing-then-passing regressions; both review axes report no remaining findings.
