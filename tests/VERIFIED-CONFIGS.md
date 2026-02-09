# Verified GPU Configurations

Tested configurations for the unified OpenClaw2Go image. Each entry records the GPU, config, and verification results.

## Test Procedure

1. Create pod with target GPU and unified image
2. Set `OPENCLAW_CONFIG` env var to the test config
3. Verify services start:
   - LLM: `curl http://localhost:8000/health` + `curl http://localhost:8000/v1/models`
   - Audio: `openclaw-tts "Hello" --output /tmp/test.wav` (if audio enabled)
   - Image: `openclaw-image-gen --prompt "test" --width 512 --height 512 --output /tmp/test.png` (if image enabled)
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
| `{"llm":"teichai/glm47-claude-distill-gguf"}` | LLM (Claude Distill Q4_K_M) | 150k | 22347 / 32607 MiB | **PASS** | 2026-02-09 | Native reasoning_content support, ~168 tok/s |
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
| `{"llm":"unsloth/qwen3-coder-next-gguf"}` | LLM (Qwen3-Coder-Next Q3_K_M) | 32k | 37913 / 46068 MiB | **PASS** | 2026-02-09 | Hybrid DeltaNet+attention 80B MoE, 12/48 KV layers, ~92 tok/s |

### A100 80GB (sm_80, Ampere) — vLLM

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":"zai-org/glm47-flash-fp16"}` | vLLM FP16 | 65k | ~76 GB | **PASS** | 2026-02-08 | GLM-4.7-Flash FP16, chat works |
| `{"llm":"cyankiwi/glm47-flash-awq-4bit"}` | vLLM AWQ 4-bit | 114k | ~76 GB | **PASS** | 2026-02-08 | AWQ quantization, large context |
| `{"llm":"zai-org/glm47-flash-fp16","audio":true,"image":true}` | vLLM FP16+Audio+Image | 65k | 76/80 GB | **PASS** | 2026-02-08 | gpuMemoryUtilization 0.90, all services running |
| `{"llm":"bartowski/step35-flash-gguf"}` | LLM (Step-3.5-Flash Q2_K) | 8k | — | **FAIL** | 2026-02-09 | CUDA "no kernel image" — engine build lacks sm_80 (A100). Model loads but crashes on MUL_MAT. |
| `{"llm":true,"audio":true,"image":true}` | LLM+Audio+Image (llama.cpp) | auto (~150k) | ~30 GB | PENDING | — | Needs sm_80 in engines build |

### RTX 5090 (32GB, Blackwell sm_120) — vLLM

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":"gadflyii/glm47-flash-nvfp4"}` | vLLM NVFP4 | 180k | — | **FAIL** | 2026-02-08 | GLM-4.7 MLA attention OOM during CUDA graph capture (known vLLM bug on Blackwell) |

### H100 80GB (sm_90, Hopper)

| Config | Services | Context | VRAM Used | Status | Date | Notes |
|--------|----------|---------|-----------|--------|------|-------|
| `{"llm":true,"audio":true,"image":true}` | LLM+Audio+Image | auto (~150k) | ~30 GB | PENDING | — | Needs sm_90 in engines build |

## Docker Image

- **Image**: `runpod/openclaw2go:<tag>`
- **Engines**: `runpod/openclaw2go-engines:<tag>`
- **Dockerfile**: `Dockerfile.unified` (runtime), `engines/Dockerfile` (llama.cpp builds)
- **CUDA Architectures**: sm_80 (A100), sm_89 (RTX 4090/L40), sm_90 (H100), sm_120 (RTX 5090)
