# Which open-source LLM reads cuisine and traits in the browser and on LinuxONE s390x?

Resolves research ticket #35 (map #33). Researched 2026-10-17. Context: ADR 0001 (an open-source LLM in the browser reads the free-text restaurant profile).

Legend: **[V]** verified in a primary source (cited). **[I]** inferred or unmeasured; check before relying on it.

## Answer

- **Model: `Qwen2.5-0.5B-Instruct`** (Apache-2.0, ungated) [V, S9].
- **Browser, main path: WebLLM** with `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`. It downloads about 290 MB, needs about 945 MB of GPU memory and WebGPU, and does not need the `shader-f16` feature [V, S2, S3]. Pass `response_format: { type: "json_object", schema }` where the schema holds the fixed cuisine and trait lists as `enum`s, so the output is always valid JSON over our lists [V, S4].
- **Browser fallback without WebGPU: wllama** (llama.cpp compiled to WASM, MIT) running the official `qwen2.5-0.5b-instruct-q4_0.gguf` (429 MB). It also accepts a `json_schema` response format or a GBNF `grammar` [V, S6, S7, S8]. On GitHub Pages it runs single-threaded, so it is slow [I, see below].
- **LinuxONE: run the same Qwen2.5-0.5B-Instruct weights** with `transformers` + `torch` (CPU), which the image already ships. `safetensors` byte-swaps on big-endian hosts, so no conversion is needed [V, S12, S13]. If you want the same JSON-schema constraint as the browser, use `llama_cpp_python`, also in the image, with a big-endian GGUF made by `convert_hf_to_gguf.py --bigendian` [V, S10, S11, S12].
- **Lightest fallback (not an LLM): `all-MiniLM-L6-v2`** sentence embeddings (23 MB int8 ONNX, Apache-2.0) [V, S9, S15]. Embed the description and pick the nearest cuisine label and every trait label above a threshold. It runs on WASM in every browser through transformers.js. A big-endian copy exists for s390x (`taronaeo/all-MiniLM-L6-v2-BE`) [V, S14], and plain torch loads it anyway [V, S13]. Use it if WebGPU or the 300 MB download proves a problem in testing.

## Candidates

Sizes are the download for the quantisation named. "VRAM" is WebLLM's `vram_required_MB` [V, S3]. Licences come from the Hugging Face model API [V, S9].

| Model | Licence / gated | WebLLM (q4f16 / q4f32 VRAM MB, f16 needed?) | transformers.js ONNX | GGUF | s390x | Verdict |
|---|---|---|---|---|---|---|
| **Qwen2.5-0.5B-Instruct** | Apache-2.0 / no | 945 / 1060, no; params ~278 MB [S2] | q4f16 483 MB, int8 512 MB, q4 786 MB [S5] | q4_0 429 MB, q4_k_m 491 MB [S8] | torch native [S13]; BE GGUF by conversion [S10] | **Pick** |
| Qwen2.5-1.5B-Instruct | Apache-2.0 / no | 1630 / 1889, no | (not checked) | (not checked) | as above | Upgrade if 0.5B accuracy is poor |
| Qwen3-0.6B | Apache-2.0 / no | 1403 / 1925, no | (not checked) | (not checked) | as above | Needs more VRAM than Qwen2.5-0.5B, and its thinking mode must be turned off |
| SmolLM2-360M-Instruct | Apache-2.0 / no | 376 (**needs shader-f16**) / 580 | q4f16 273 MB, int8 365 MB [S5b] | (not checked) | torch native | Smallest; following instructions is likely weaker [I] |
| SmolLM2-1.7B-Instruct | Apache-2.0 / no | 1774 (f16) / 2692 | ONNX present | (not checked) | torch native | Too heavy |
| Llama-3.2-1B-Instruct | Llama 3.2 Community / **gated** | 879 / 1129, no | (not checked) | BE GGUF prebuilt [S14] | ready-made BE GGUF | Custom licence and gated download; only advantage is the ready-made BE GGUF |
| Phi-3.5-mini-instruct | MIT / no | 3672 / 5483 (2520 with a 1k context) | (not checked) | (not checked) | torch native | Too heavy for the browser |
| gemma-2-2b-it | Gemma terms / **gated** | 1895 (f16) / 2509 | (not checked) | (not checked) | torch native | Gated, custom terms, heavy |
| granite-3.3-2b-instruct (IBM) | Apache-2.0 / no | not in the WebLLM list we checked | (not checked) | BE GGUF prebuilt [S14] | ready-made BE GGUF | Good IBM story on LinuxONE, but ~2B is heavy in a browser |

## Runtimes

| Runtime | Licence | Backend | Constrained output | Notes |
|---|---|---|---|---|
| WebLLM (`@mlc-ai/web-llm`) | Apache-2.0 [S1b] | WebGPU only; no CPU fallback documented [V, S1] | `response_format` types `json_object` (+ `schema`), `grammar` (EBNF), `structural_tag` [V, S4] | Caches weights in the browser Cache API by default (IndexedDB/OPFS optional) [V, S1] |
| transformers.js (`@huggingface/transformers`) | Apache-2.0 [S5c] | WASM CPU by default; `device: "webgpu"` opt-in [V, S5c, S5d] | None documented [I: README and guides do not mention it] | Larger ONNX downloads than MLC for the same model; easiest path for the embedding fallback |
| wllama | MIT [S7] | WASM SIMD, WebGPU from v3.1 [V, S6] | `grammar` and OpenAI `response_format` `json_schema` [V, S7] | Multithreading needs COOP/COEP headers [V, S6]; files over 2 GB are not allowed and 512 MB chunks are recommended [V, S6] |
| llama.cpp / `llama_cpp_python` on s390x | MIT | CPU with VXE SIMD on z15+, optional OpenBLAS; zDNN is WIP and z17-only [V, S10] | JSON / JSON-schema `response_format` [V, S11] | **GGUF must be big-endian** [V, S10] |
| transformers + torch on s390x | Apache-2.0 | CPU (`torch 2.11.0+cpu`) [V, S12] | None built in; validate and retry, or score each `enum` value [I] | `safetensors` byte-swaps when `sys.byteorder == "big"` [V, S13] |

## Platform facts that drive the choice

- **WebGPU reach.** Global support was about 85% in March 2026. Firefox may need a flag, and Safari support depends on the version [V, S5d]. The WebLLM path therefore needs a no-WebGPU fallback. The MVP's picker (ADR 0001) is the cheapest one.
- **GitHub Pages cannot set COOP/COEP response headers** [I: Pages has no custom-header setting; a `coi-serviceworker` shim is the usual workaround]. Without them wllama runs single-threaded [V, S6].
- **Big-endian GGUF.** A little-endian GGUF fails on s390x with an "extremely large" GGUF version error. Convert from safetensors with `convert_hf_to_gguf.py --outtype f16 --bigendian` (recommended), or byte-swap with `gguf_convert_endian.py <model> BIG`, which may fail on some quant types [V, S10]. Q4_0, Q4_K, Q8_0 and F16 are VXE-accelerated [V, S10]. No ready-made BE GGUF of Qwen2.5 exists on the s390x-verified account; Llama-3.2-1B and Granite 3.x do [V, S14].
- **The LinuxONE image already has the tools.** It ships `transformers 5.19.0`, `llama_cpp_python 0.3.36` and `torch 2.11.0+cpu` [V, S12 per its `packages.txt`]. Whether that `llama_cpp_python` wheel was built with VXE is [I]. Check `llama_cpp.llama_print_system_info()`.
- **Hugging Face downloads.** The VM can likely reach PyPI and so probably HF too [I, S12]. Download weights on the VM (`huggingface_hub`) instead of using the 200 MB Jupyter upload.

## Latency (not measured)

No primary source gives numbers for our task, so everything here is [I]. A 0.5B q4 model on a laptop GPU should produce a ~40-token JSON answer in about a second once loaded. First load is dominated by the ~290 MB download and shader compile, likely tens of seconds, then cached. Single-threaded wllama on CPU is likely several times slower. Torch fp32 on a few LinuxONE IFLs should handle a 0.5B model at interactive speed. **Measure all three** before committing: time to first load, time per description, and accuracy on ~20 hand-written descriptions.

## Suggested shape of the call (browser)

```js
const schema = JSON.stringify({
  type: "object",
  properties: {
    cuisine: { enum: CUISINES },                                   // fixed list
    traits:  { type: "array", items: { enum: TRAITS }, uniqueItems: true },
  },
  required: ["cuisine", "traits"],
});
const r = await engine.chat.completions.create({
  messages: [{ role: "system", content: PROMPT }, { role: "user", content: text }],
  response_format: { type: "json_object", schema },
  temperature: 0,
});
```

Because the schema already appears in the prompt, the same prompt with `llama_cpp_python`'s `response_format={"type": "json_object", "schema": ...}` gives a like-for-like run on LinuxONE [V, S11].

## Open questions

- How accurate is 0.5B against 1.5B on our label lists? This needs a small hand-labelled set.
- Does `uniqueItems` hold under XGrammar in WebLLM? If not, dedupe in JS [I].
- Is the `llama_cpp_python` in the IBM image VXE-enabled, and does `convert_hf_to_gguf.py` (llama.cpp repo, not the pip package) run in the container?

## Sources

- S1: [WebLLM README](https://github.com/mlc-ai/web-llm/blob/main/README.md). S1b: [WebLLM LICENSE](https://github.com/mlc-ai/web-llm/blob/main/LICENSE)
- S2: [mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC files](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/tree/main)
- S3: [WebLLM `src/config.ts` prebuiltAppConfig](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- S4: [WebLLM `ResponseFormat`, `src/openai_api_protocols/chat_completion.ts`](https://github.com/mlc-ai/web-llm/blob/main/src/openai_api_protocols/chat_completion.ts)
- S5: [onnx-community/Qwen2.5-0.5B-Instruct ONNX files](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/tree/main/onnx). S5b: [SmolLM2-360M-Instruct ONNX files](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/tree/main/onnx). S5c: [transformers.js README](https://github.com/huggingface/transformers.js/blob/main/README.md). S5d: [transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu), [dtypes guide](https://huggingface.co/docs/transformers.js/guides/dtypes)
- S6: [wllama README](https://github.com/ngxson/wllama/blob/master/README.md)
- S7: [wllama `src/types/types.ts` (`grammar`) and `src/types/oai-compat.ts` (`response_format` `json_schema`)](https://github.com/ngxson/wllama/tree/master/src/types); licence MIT per the GitHub API
- S8: [Qwen/Qwen2.5-0.5B-Instruct-GGUF files](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/tree/main)
- S9: Hugging Face model API `https://huggingface.co/api/models/<id>` (`cardData.license`, `gated`) for each model in the table
- S10: [llama.cpp `docs/build-s390x.md`](https://github.com/ggml-org/llama.cpp/blob/master/docs/build-s390x.md)
- S11: [llama-cpp-python README, "JSON and JSON Schema Mode"](https://github.com/abetlen/llama-cpp-python/blob/main/README.md)
- S12: `docs/research/linuxone-jupyter-image.md` on branch `research/linuxone-jupyter-image` (from IBM's [jupyter-lab-ml `packages.txt`](https://github.com/linuxone-community-cloud/jupyter-lab-ml/blob/main/packages.txt))
- S13: [safetensors `bindings/python/py_src/safetensors/torch.py`](https://github.com/huggingface/safetensors/blob/main/bindings/python/py_src/safetensors/torch.py) (byte-swaps when `sys.byteorder == "big"`; the Rust binding does the same)
- S14: [taronaeo on Hugging Face](https://huggingface.co/taronaeo), the account behind the "s390x Verified Models" collection that S10 links to
- S15: [Xenova/all-MiniLM-L6-v2 ONNX files](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main/onnx)
