"""Operator-only pretrained CPU inference on synthetic descriptions; no server API."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import platform
import sys
import time
from pathlib import Path
from typing import Any

MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
REVISION = "7ae557604adf67be50417f59c2c2f167def9a775"


def evaluate(root: Path, output: Path, *, split: str = "development", limit: int = 3) -> dict[str, Any]:
    """Run the frozen cases. Human reviews labels before tuning or heldout use.

    Keeps downloaded native safetensors in Hugging Face's external cache. Float32
    CPU tensors are created by Transformers; no raw endian-dependent export.
    The installed shared image is used as-is, never upgraded by this function.
    """
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from transformers.utils.hub import cached_file

    benchmark_bytes = (root / "tests/fixtures/nn2-benchmark.json").read_bytes()
    benchmark = json.loads(benchmark_bytes)
    contract = json.loads((root / "tests/fixtures/nn2-contract.json").read_text(encoding="utf8"))
    cases = [c for c in benchmark["cases"] if c["split"] == split][:limit]
    if not cases:
        raise ValueError("No benchmark cases selected")
    started = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION)
    model = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, dtype=torch.float32).to("cpu").eval()
    cold_seconds = time.perf_counter() - started
    results = []
    for case in cases:
        messages = [{"role": "system", "content": contract["system"]}, {"role": "user", "content": case["description"]}]
        inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt")
        start = time.perf_counter()
        with torch.inference_mode():
            generated = model.generate(**inputs, max_new_tokens=1024, do_sample=False)
        seconds = time.perf_counter() - start
        reply = tokenizer.decode(generated[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
        # shortcut: CPU replies are exported for the same JS validator used in-browser;
        # no separate Python validator with subtly different acceptance semantics.
        results.append({"id": case["id"], "description": case["description"], "reply": reply, "seconds": seconds,
                        "within_latency_gate": seconds <= 60, "generated_tokens": int(generated.shape[-1] - inputs["input_ids"].shape[-1])})
    report = {"model": MODEL, "revision": REVISION, "execution": "CPU pretrained inference; not training or NNPA acceleration",
              "environment": {"machine": platform.machine(), "byteorder": sys.byteorder, "python": platform.python_version(),
                              "torch": torch.__version__, "transformers": importlib.metadata.version("transformers")},
              "benchmark_sha256": hashlib.sha256(benchmark_bytes).hexdigest(), "label_status": benchmark["label_status"],
              "cold_load_seconds": cold_seconds, "native_parameter_bytes": sum(p.numel() * p.element_size() for p in model.parameters()),
              "native_weight_file_bytes": Path(cached_file(MODEL, "model.safetensors", revision=REVISION)).stat().st_size,
              "quality_gate": "NOT EVALUATED: validate replies and score frozen expected labels separately", "results": results}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    return report
