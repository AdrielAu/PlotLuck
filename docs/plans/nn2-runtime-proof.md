# NN2 runtime proof (#113)

Status: [browser experiment](../../runs/2026-10-17-nn2-evaluation/) fails preliminary
quality and latency; LinuxONE execution remains pending. Reproducible tools are prepared. This is
pretrained inference, not training or NNPA acceleration. NN2 remains mandatory.

The candidate is Qwen2.5-0.5B-Instruct. Native revision
`7ae557604adf67be50417f59c2c2f167def9a775`; browser MLC revision
`32ff081fe7e4dfe4ffb167b94c66fdf11e02b8ad`; WebLLM `0.2.86`.
The pinned library URL and exact runtime configuration live in the candidate
runtime module. The model has Apache-2.0 licensing; competition permission is a
separate decision. See the [official model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)
and [WebLLM usage](https://webllm.mlc.ai/docs/user/basic_usage.html).

The pinned MLC ndarray manifest declares **277,996,288 shard bytes**. This is not a
measured full download: tokenizer/config/library/runtime bytes must also be
recorded. The 400,000,000-byte browser budget and latency gates remain unchanged.
Native weight bytes are measured by the operator runner separately from the
float32 parameter footprint; neither is a GPU-memory estimate.

## Frozen synthetic benchmark

120 clear cases: 20 development and 100 reserved heldout, spanning 12 cuisines,
10 locations, explicit vegan options, omitted traits and 3 km searches. Expected
labels are **agent-authored and require human review before tuning**. The initial
set does not yet cover every release requirement (spelling, negation, adversarial
requests, ambiguity and the full inference rubric); #119/#121 must expand the
separate edge-case set and obtain human label approval. Do not claim the quality
gate from this provisional fixture. Keep failed cases in the denominator.

Inference rubric to freeze at human review: a suggestion must cite an actual
substring; explicit statements and negations take precedence; context may justify
multiple reasonable trait values; ambience alone cannot establish national
cuisine; no cue means supported defaults. Structural validation checks literal
evidence and enum/types, while semantic truth requires benchmark/human review.

## Browser operator

Install the browser test tooling from setup instructions. Explicitly invoking
`node scripts/prove-nn2-browser.mjs <output.json>` authorizes the candidate download
for synthetic experiments. Set `PLOTLUCK_PLAYWRIGHT` to a Playwright module URL and
`PLOTLUCK_BROWSER` to desktop Edge/Chrome if needed. The tool uses a fresh browser
context, runs three development requests, records hardware/cold load/warm times
and failures, and terminates on a five-minute load/request timeout. Run the score
script on the resulting report. Never silently substitute manual parsing for a
failed candidate. Cache reuse and production user-flow privacy are later gates.

## Human LinuxONE operator

Only the designated human operates the shared clone. Pull the integration branch
under the normal server runbook, open `notebooks/evaluate_nn2.ipynb` in Jupyter and
run the existing image unchanged. Model assets download to the external Hugging
Face cache; do not commit them or install a replacement environment. The image
provides Transformers 5.19.0 and PyTorch 2.11.0+cpu. The notebook writes a synthetic
report including machine/byte order, revisions, load time and per-request times.
Copy that small report to a laptop and run
`node scripts/score-nn2.mjs <report.json>` for the same browser validator and
component/full-request metrics. Clear notebook outputs before committing.

Publish safe reports in a dated run directory. Report timeouts, malformed replies,
latencies above 60 seconds and architecture failures. A failed candidate requires
a revised investigation; it does not waive the 95/100, 10-second browser p95,
60-second LinuxONE or 400 MB browser gates.
