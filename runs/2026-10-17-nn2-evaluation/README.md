# Preliminary NN2 evaluation

**Candidate fails preliminary quality in both runtimes.** No release approval.
Sections: LinuxONE native CPU run (below), then the earlier browser experiment.

## LinuxONE native CPU run (#140)

Pretrained CPU inference on the shared LinuxONE image, run unchanged by the
human operator through `notebooks/evaluate_nn2.ipynb`. Not training and not
NNPA acceleration. Three synthetic development cases; heldout untouched.
Evidence: `docs/evidence/06-nn2-inference.png`.

- Model: Qwen/Qwen2.5-0.5B-Instruct, native revision
  `7ae557604adf67be50417f59c2c2f167def9a775`, float32 on CPU.
- Environment: `s390x`, byte order `big`, Python 3.12.15, torch 2.11.0+cpu,
  Transformers 5.19.0 (the image as shipped; nothing installed or upgraded).
- Native weight file `model.safetensors`: 988,097,824 bytes, kept in the
  external Hugging Face cache, not committed. Float32 parameter footprint:
  1,976,131,072 bytes.
- Cold download and load (empty cache, about 1 GB at 89.8 MB/s): 16.46 seconds.
- Warm requests: 35.75, 31.82 and 26.14 seconds for 63, 50 and 31 generated
  tokens. **All three are within the 60-second LinuxONE limit**; three requests
  do not establish a release latency figure.
- No timeouts, load failures or architecture failures.
- Benchmark and contract SHA-256 hashes match the browser compact run.

**Quality: 0/3 valid, 0/3 correct.** `operator-results.json.scores.json` is the
output of `node scripts/score-nn2.mjs` with the strict browser validator.

- 2 of 3 replies are malformed JSON, and the third has an invalid shape. All three
  nest `location` inside `fields`; two then leave the outer object unclosed,
  the third gives `cuisine` as a bare string. Replies stopped well before the
  1024-token cap, so this is not truncation.
- Content, read by hand and not validated: cuisine Thai and the place
  text are right in all three. `near` is `true` for "in Camden" and
  "in Manchester" (expected `false`), with `unit: "km"` and no distance
  (expected `null`). The explicit vegan request went to `clarifications`
  instead of `vegan_options: true`.

Revised investigation: the native run generates unconstrained text, so the
structural failures are expected without a grammar/JSON-schema constraint at
decode time. Next, measure the same three cases with constrained decoding on
LinuxONE, scoring with the same validator, and keep the semantic failures
(`near`/`unit`, missed vegan trait) as separate evidence. Prefill of the long
system prompt likely dominates these CPU timings, so a larger candidate risks
the 60-second limit and must be measured, not assumed. NN2 remains mandatory and
no gate changes. Full release evaluation stays with #121.

## Browser experiment

Pinned Qwen2.5-0.5B-Instruct q4f16_1, WebLLM 0.2.86, Intel gen-12lp WebGPU,
desktop Edge 155 on Windows. Exact model/library revisions are in the runtime
module. Three synthetic development cases were run in a fresh browser context;
the heldout set was not used. Labels remain agent-authored pending human review.

- Cold load: 14.309 seconds (model download/initialization together).
- Warm requests: 39.212, 27.109 and 26.684 seconds; sample p95 39.212 seconds.
- Valid full requests: 0/3. Every reply was rejected before NN1.
- Total measured response-body bytes including runtime/redirects: 287,644,876.
  This small experiment fits the 400 MB budget; runtime/geography production
  payloads, cache behavior and release performance remain separate checks.

The model selected Thai, but generated empty evidence, invented an explicit `$`
price, marked defaults as inferred/explicit, omitted the location and put location
text into clarification strings. The vegan request was incorrectly false. These
are semantic failures as well as invalid evidence; accepting empty evidence would
hide errors. Do not weaken the validator to make this report pass.

Next investigation: after human review freezes benchmark labels/rubric, compare a
shorter structured extraction task/prompt with fewer generated tokens against this
baseline. Consider a different quantized candidate only if its measured full
downloads fit 400 MB and it preserves required contextual inference. Retest quality
and latency independently; no gates change. Obtain the human-operator native CPU
run in parallel, using the supplied notebook. LinuxONE is still unmeasured here.

`browser-proof.json` preserves synthetic replies, failure messages, timings and
sanitized transfer URLs; the adjacent scores report counts every failure.
Response-body bytes come from Playwright request sizes, include redirect bodies,
and are distinct from advertised shard sizes or GPU memory estimates.

## Approved development tuning

The user approved the agent-authored expected labels and inference rubric on
2026-10-17 before tuning. The 100 heldout cases remain untouched. The original
baseline above retains its original pending-review metadata as historical evidence.

The first compact experiment reduced two warm requests to 8.46/8.07 seconds but
still failed 0/3: it copied a vegan example into unrelated requests and confused
3 km with 3,000 km. Its report preserves those failures; that intermediate prompt
was not independently committed and is not the reproducibility reference.

The final compact contract generates only cue-backed fields, with omitted traits
defaulted deterministically by the validator. Its prompt removes the copied vegan
example, states distance rules and includes task-grammar compilation in cold
initialization. The final report records interpreter and benchmark SHA-256 hashes.
Cold initialization was 26.10 seconds. All three warm requests were below 10
seconds, but **quality remains 0/3**: the model fabricated the evidence `Thailand`
for `Thai`, substituted Cambridge for Camden, and invented distance/near values.
The validator rejected every reply. This is not a 100-case quality/performance
sign-off and does not make the candidate usable in the product. Native execution
and the full heldout evaluation remain pending. No further tuning was undertaken
after the user's request to finish the current work and stop.
