# Benchmark: mmap vs --no-mmap Model Loading

3x NVIDIA H100 80GB SXM, EUR-IS-3, warm page cache.
Benchmark script: `scripts/benchmark-mmap.sh`

## Load Time (seconds)

| Model | Size | NV mmap | NV --no-mmap | Disk mmap | Disk --no-mmap |
|---|---|---|---|---|---|
| Qwen3.5-9B Q8_0 | ~9 GB | 5.0 | 5.0 | 4.0 | 4.0 |
| Nemotron-3-Super Q2_K_XL | ~55 GB | 14.1 | 16.1 | 11.1 | 12.1 |
| GLM-5.1 IQ1_M | ~191 GB | 45.2 | 63.3 | 66.4 | 32.2 |

Cold NV (user-reported): GLM-5.1 mmap **hangs**, --no-mmap **~30s**.

## Peak RSS

| Model | mmap | --no-mmap |
|---|---|---|
| Qwen3.5-9B | 9.4 GB | 1.6 GB |
| Nemotron-3-Super | 51.4 GB | 1.0 GB |
| GLM-5.1 | 192.0 GB | 1.2 GB |

Inference: all 12 combinations pass.

## Decision

`--no-mmap` added as default in `scripts/entrypoint-unified.sh`.
