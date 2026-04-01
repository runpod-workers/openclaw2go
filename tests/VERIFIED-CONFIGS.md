# Verified GPU Configurations

Tested configurations for the unified agent2go image. Each entry records the GPU, config, and verification results.

## Test Procedure

1. Create pod with target GPU and unified image
2. Set `A2GO_CONFIG` env var to the test config
3. Verify services start:
   - LLM: `curl http://localhost:8000/health` + `curl http://localhost:8000/v1/models`
   - Audio: `a2go tool text-to-speech "Hello" --output /tmp/test.wav` (if audio enabled)
   - Image: `a2go tool image-generate --prompt "test" --width 512 --height 512 --output /tmp/test.png` (if image enabled)
4. Check VRAM usage: `nvidia-smi`

## Status Legend

- **PENDING** — not yet tested
- **PASS** — all services started and verified
- **FAIL** — one or more services failed (see notes)
- **SKIP** — skipped (not applicable or not available)

## Configurations

### RTX 5090 (32GB, Blackwell sm_120)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":true,"audio":true,"image":true}` | LLM+Audio+Image | 150k | 30331 / 32607 MiB | **PASS** | 2026-02-08 | Full stack, ~2.3GB free |
| `{"llm":"teichai/glm47-claude-distill-gguf"}` | LLM (Claude Distill Q4_K_M) | 150k | 22347 / 32607 MiB | **PASS** | 2026-02-12 | Native reasoning_content support, slim image |
| `{"llm":"unsloth/Nemotron-3-Nano-30B-A3B-GGUF"}` | LLM (Nemotron-3-Nano Q4_K_XL) | auto | — | **PASS** | 2026-02-12 | MoE, reasoning + content, slim image |
| `{"llm":"unsloth/gpt-oss-20b-GGUF"}` | LLM (GPT-OSS-20B Q8_0) | auto | — | **PASS** | 2026-02-12 | Generates output, slim image |
| `{"llm":"mistralai/ministral3-8b-gguf"}` | LLM (Ministral-3-8B Q8_0) | 131k | 18311 / 32607 MiB | **PASS** | 2026-02-16 | Tool calling works, kvCache=70 MB/1k, ~14 GB free, ~200 tok/s |
| `{"llm":"jackrong/qwen35-opus-distill-4b-gguf"}` | LLM (Qwen3.5-4B Opus Distill v2 Q8_0) | 16k | 5679 / 32607 MiB | **PASS** | 2026-04-01 | Reasoning + tool calling work, ~178 tok/s |
| `{"llm":"jackrong/qwen35-opus-distill-9b-gguf"}` | LLM (Qwen3.5-9B Opus Distill v2 Q8_0) | 16k | 9464 / 32607 MiB | **PASS** | 2026-04-01 | Reasoning + tool calling work, ~141 tok/s |
| `{"llm":"jackrong/qwen35-opus-distill-27b-gguf"}` | LLM (Qwen3.5-27B Opus Distill v2 Q4_K_M) | 16k | 16889 / 32607 MiB | **PASS** | 2026-04-01 | Reasoning + tool calling work, ~71 tok/s |
| `{"llm":true,"audio":true}` | LLM+Audio | auto (~200k) | ~26 GB | PENDING | — | More context, no image |
| `{"llm":true}` | LLM only | auto (~200k) | ~22 GB | PENDING | — | Maximum context |

### RTX 4090 (24GB, Ada Lovelace sm_89)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{}` (auto-detect) | LLM+Audio | 16.6k | 20489 / 24564 MiB | **PASS** | 2026-02-08 | Auto dropped image, ~4GB free |
| `{"llm":"unsloth/gpt-oss-20b-gguf"}` | LLM (gpt-oss-20b Q8_0) | 131k | 13472 / 24564 MiB | **PASS** | 2026-02-09 | MoE 22B, `<\|channel\|>` reasoning tokens in output, ~92 tok/s |
| `{"llm":true,"audio":true}` | LLM+Audio | auto | — | PENDING | — | Should match auto-detect |
| `{"llm":true}` | LLM only | auto | — | PENDING | — | More context available |

### L40 (48GB, Ada Lovelace sm_89)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":true,"audio":true,"image":true}` | LLM+Audio+Image | 150k | 30927 / 46068 MiB | **PASS** | 2026-02-08 | ~15GB free, plenty of headroom |
| `{"llm":"unsloth/Qwen3-Coder-Next-GGUF"}` | LLM (Qwen3-Coder-Next Q3_K_M) | 32k | 37913 / 46068 MiB | **PASS** | 2026-02-12 | Hybrid DeltaNet+attention 80B MoE, slim image |

### A100 80GB (sm_80, Ampere)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":"bartowski/step35-flash-gguf"}` | LLM (Step-3.5-Flash Q2_K) | 32k | 67183 / 81920 MiB | **PASS** | 2026-02-12 | 197B MoE Q2_K, custom chat template, reasoning works, ~15 GB free |
| `{"llm":true,"audio":true,"image":true}` | LLM+Audio+Image (llama.cpp) | auto (~150k) | ~30 GB | PENDING | — | Needs sm_80 in engines build |

### H100 80GB (sm_90, Hopper)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":"ubergarm/minimax-m25-iq2ks-gguf"}` | LLM (MiniMax-M2.5 IQ2_KS 2-bit) | 65k | 80659 / 81559 MiB | **PASS** | 2026-02-19 | 229B MoE, ik_llama.cpp, reasoning+tool calling work, ~97 tok/s, ~1 GB free, KV=130 MB/1k |
| `{"llm":"unsloth/nemotron3-super-gguf"}` | LLM (Nemotron-3-Super Q2_K_XL) | 131k | 53521 / 81559 MiB | **PASS** | 2026-03-13 | 120B MoE (12B active), Mamba2-Transformer hybrid, reasoning works, ~85 tok/s, ~28 GB free, KV=8 MB/1k. Requires llama.cpp b8310+ (PR #20411) |
| `{"llm":true,"audio":true,"image":true}` | LLM+Audio+Image | auto (~150k) | ~30 GB | PENDING | — | Needs sm_90 in engines build |

### RTX Pro 6000 96GB (sm_120, Blackwell)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":"unsloth/nemotron3-super-q4kxl-gguf"}` | LLM (Nemotron-3-Super Q4_K_XL) | 256k | 82005 / 97887 MiB | **PASS** | 2026-03-13 | 120B MoE (12B active), Mamba2-Transformer hybrid, reasoning works, ~75 tok/s, ~16 GB free, KV=8 MB/1k. Requires llama.cpp b8310+ (PR #20411) |

### B200 180GB (sm_100, Blackwell)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":"unsloth/glm5-tq1-gguf"}` | LLM (GLM-5 TQ1_0 1-bit) | 202k | 175030 / 183359 MiB | **PASS** | 2026-02-13 | PR #19460 engine, reasoning works, ~27 tok/s, ~8 GB free, max context |
| `{"llm":"ubergarm/minimax-m25-iq4xs-gguf"}` | LLM (MiniMax-M2.5 IQ4_XS 4-bit) | 196k | 143956 / 183359 MiB | **PASS** | 2026-02-13 | 229B MoE, reasoning+tool calling work, ~109 tok/s, ~38 GB free, KV=130 MB/1k |
| `{"llm":"unsloth/nemotron3-super-q8-gguf"}` | LLM (Nemotron-3-Super Q8_0) | 256k | 124678 / 183359 MiB | **PASS** | 2026-03-13 | 120B MoE (12B active), Mamba2-Transformer hybrid, reasoning works, ~90 tok/s, ~58 GB free, KV=8 MB/1k. Requires llama.cpp b8310+ (PR #20411) |

### 2x H200 SXM 282GB (sm_90, Hopper)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":"unsloth/glm5-iq2xxs-gguf"}` | LLM (GLM-5 IQ2_XXS 2-bit) | 202k | 119087+120553 / 287542 MiB | **PASS** | 2026-02-13 | 2-GPU auto-split works, reasoning works, ~34 tok/s, ~46 GB free, max context |

### Removed Configurations (vLLM)

vLLM was removed from the default image in Feb 2025 to reduce image size (~5-6 GB savings). All models work via llama.cpp GGUF. The following configs were previously verified but are **no longer available** in the current image:

| Config | GPU | Status | Last Verified | Notes |
|--------|-----|--------|---------------|-------|
| `{"llm":"zai-org/glm47-flash-fp16"}` | A100 | was PASS | 2026-02-08 | vLLM FP16 — use GGUF Q4_K_M instead |
| `{"llm":"cyankiwi/glm47-flash-awq-4bit"}` | A100 | was PASS | 2026-02-08 | vLLM AWQ — use GGUF Q4_K_M instead |
| `{"llm":"gadflyii/glm47-flash-nvfp4"}` | RTX 5090 | was FAIL | 2026-02-08 | vLLM NVFP4 — broken on Blackwell, use GGUF instead |

## Docker Image

- **Image**: `runpod/a2go:<tag>`
- **Engines**: `runpod/a2go-engines:<tag>`
- **Dockerfile**: `Dockerfile.unified` (runtime), `engines/Dockerfile` (llama.cpp builds)
- **CUDA Architectures**: sm_80 (A100), sm_89 (RTX 4090/L40), sm_90 (H100), sm_100 (B200), sm_120 (RTX 5090/RTX Pro 6000)
