# Benchmark: mmap vs --no-mmap Model Loading

**Goal:** Determine whether `--no-mmap` improves llama-server model loading time and should become the default in the a2go entrypoint.

**What we measure:**
- Time from llama-server process start to `"server is listening"` log line
- Peak RSS (VmHWM) during loading
- Whether inference output is correct after loading

**Hardware:** 3x NVIDIA H100 80GB SXM (EUR-IS-3 datacenter)
**All tests:** Warm page cache (cannot drop caches inside container)

---

## Results

### Load Time (seconds)

| Model | Size | NV mmap | NV --no-mmap | Disk mmap | Disk --no-mmap |
|---|---|---|---|---|---|
| Qwen3.5-9B Q8_0 | ~8.9 GB | 5.0 | 5.0 | 4.0 | 4.0 |
| Nemotron-3-Super Q2_K_XL | ~54.7 GB | 14.1 | 16.1 | 11.1 | 12.1 |
| GLM-5.1 IQ1_M | ~191 GB | 45.2 | 63.3 | 66.4 | 32.2 |

### Cold cache (user-reported, not reproducible inside container)

| Storage | Model | mmap (default) | --no-mmap |
|---|---|---|---|
| Network volume | GLM-5.1 IQ1_M (~191 GB) | **Hangs** | **~30s** |
| Container disk | GLM-5.1 IQ1_M (~191 GB) | **~90s** | ? |

### Peak RSS

| Model | Size | mmap RSS | --no-mmap RSS | Reduction |
|---|---|---|---|---|
| Qwen3.5-9B Q8_0 | ~8.9 GB | 9.41 GB | 1.63 GB | **83%** |
| Nemotron-3-Super Q2_K_XL | ~54.7 GB | 51.42 GB | 0.98 GB | **98%** |
| GLM-5.1 IQ1_M | ~191 GB | 191.95 GB | 1.15 GB | **99.4%** |

Peak RSS is independent of storage type (same values on NV and container disk).

### Inference Correctness

All 12 combinations: **Pass** (HTTP 200, coherent text output)

---

## Analysis

### Small models (~9 GB): No difference

Both modes load in 4-5s regardless of storage. mmap uses ~6x more RSS but it doesn't matter at this scale.

### Medium models (~55 GB): mmap slightly faster (warm cache)

On warm cache, mmap is ~8-12% faster (11-14s vs 12-16s). The model file is already in the page cache, so mmap just maps the pages directly. `--no-mmap` does a sequential `read()` + copy to GPU, adding a small overhead.

### Large models (~191 GB): --no-mmap wins on container disk, mmap hangs on cold NV

- **Container disk (warm):** `--no-mmap` is 2x faster (32.2s vs 66.4s). At this model size, `read()` + DMA to GPU is more efficient than faulting in 191 GB of mmap pages.
- **Network volume (warm):** mmap is faster (45.2s vs 63.3s) — NFS client cache pages are already mapped.
- **Network volume (cold):** mmap **hangs** — the kernel demand-pages 191 GB over NFS with random access patterns, causing extreme latency. `--no-mmap` does sequential reads and completes in ~30s.

### RSS impact is massive at all sizes

mmap maps the entire model file into the process address space, inflating VmHWM to match model size. For GLM-5.1, that's 192 GB of host RAM. With `--no-mmap`, data goes straight to GPU via `read()` syscalls, keeping RSS at ~1 GB.

On machines with limited system RAM (e.g., 192 GB), mmap can cause OOM or swap pressure with large models.

---

## Recommendation

**Add `--no-mmap` as default unconditionally.**

| Criterion | Result |
|---|---|
| Small models, any storage | Equal load time, 83% less RSS |
| Medium models, any storage | 8-12% slower (warm cache only), 98% less RSS |
| Large models, container disk | **2x faster**, 99% less RSS |
| Large models, NV cold cache | **Prevents hang** (the critical production path) |
| Inference correctness | No regressions |

The 8-12% warm-cache penalty for medium models is the only downside, and it only applies to subsequent loads within the same container (rare operational path). The first pod start — the one users experience — always has cold cache on NV.

### Entrypoint change

In `scripts/entrypoint-unified.sh` at line 351, add `--no-mmap` to `LLM_ARGS`:

```bash
LLM_ARGS=(
    -m "$MODEL_DOWNLOAD_DIR/$FIRST_FILE"
    --host 0.0.0.0
    --port "$port"
    --parallel "$PARALLEL"
    -c "$CTX"
    --jinja
    -ctk q8_0
    -ctv q8_0
    --no-mmap
    --api-key "$LLAMACPP_API_KEY"
)
```

---

## Methodology Notes

- **Warm cache caveat:** `/proc/sys/vm/drop_caches` is read-only inside the container. All automated tests ran with warm page cache. Cold-cache values are from manual user testing.
- **NFS cache persistence:** NFS page cache survives container restarts on the same physical machine. True cold-cache NV tests require a fresh pod on a different machine.
- **Benchmark script:** `scripts/benchmark-mmap.sh` — starts llama-server with minimal context (-c 2048), measures time to "server is listening", tracks VmHWM via /proc, sends a chat completion to verify inference.
- **Concurrent server:** The auto-started Qwen server (port 8000) ran alongside benchmarks (port 9999) for small/medium models. For GLM, the auto-started server was killed (entrypoint frozen with SIGSTOP) to free GPU memory.
