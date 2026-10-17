# Preliminary NN2 browser experiment

**Candidate fails preliminary quality and latency.** No release approval.

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
