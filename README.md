# Moltbot on RunPod: self-contained LLM images

This repository provides Docker images that bundle **Moltbot** with different LLMs so you can run a fully self-contained assistant on RunPod (or any GPU host). Each model variant has its own folder under `models/` with a dedicated README and startup script.

## Model matrix (status + context)

| Image tag | Backend | Weights | GPU target | Context | VRAM (approx) | Status | Notes |
|----------|---------|---------|------------|---------|----------------|--------|-------|
| `moltbot-glm47-flash-awq-4bit` | vLLM | `cyankiwi/GLM-4.7-Flash-AWQ-4bit` | A100 80GB | 114k | ~75GB | Working | Best value on A100; long context |
| `moltbot-glm47-flash-fp16` | vLLM | `zai-org/GLM-4.7-Flash` | H100/A100 80GB | 32k-64k | ~56GB+ | Working | Full precision |
| `moltbot-glm47-flash-gguf` | llama.cpp | `unsloth/GLM-4.7-Flash-GGUF` (Q4_K_M) | RTX 5090 32GB | 200k | ~28GB | Working | Recommended for 5090 |
| `moltbot-glm47-flash-nvfp4-5090` | vLLM | `GadflyII/GLM-4.7-Flash-NVFP4` | RTX 5090 32GB | 200k | ~30GB | Not working | vLLM MLA issues on Blackwell |
| `moltbot-glm47-reap-w4a16` | vLLM | `0xSero/GLM-4.7-REAP-40-W4A16` | B200 180GB | 32k | ~108GB | Working | High-end B200 |
| `moltbot-vllm` | vLLM | `Qwen/Qwen2.5-Coder-7B-Instruct` | 16GB+ | 16k | ~16GB | Working | Base image |

Notes:
- Context values are defaults; some variants allow tuning via `MAX_MODEL_LEN`.
- NVFP4 status details live in `models/glm47-flash-nvfp4-5090/ISSUES.md`.

## Quick start

1. **Pick an image** from the table above.
2. **Create a RunPod pod**:
   - Volume: 150GB at `/workspace`
   - Ports: `8000/http, 18789/http, 22/tcp`
3. **Set environment variables**:
   - `VLLM_API_KEY` (for vLLM variants)
   - `MOLTBOT_WEB_PASSWORD` (web UI token)
   - `HF_TOKEN` (optional, faster downloads)
   - `TELEGRAM_BOT_TOKEN` (optional)
   - For GGUF + llama.cpp: use `LLAMA_API_KEY` instead of `VLLM_API_KEY`

4. **Health check**:
```bash
curl http://localhost:8000/health
```

## Folder map

| Folder | Purpose |
|--------|---------|
| `models/` | Model-specific Dockerfiles + entrypoints |
| `scripts/` | Base entrypoint + setup helpers |
| `templates/` | RunPod template JSONs |
| `config/` | Moltbot config templates |

## Build + release

Images build on:
- Pull requests -> tag = branch name (slashes -> `-`)
- Push to `main` -> `:latest`
- Git tag (e.g., `v1.0.0`) -> `:v1.0.0` + `:latest`

## Known issues

- **NVFP4 on RTX 5090** is not working in vLLM due to MLA attention shape issues and missing Blackwell kernel support. See `models/glm47-flash-nvfp4-5090/ISSUES.md`.
- **GGUF is not supported in vLLM** (use llama.cpp image).
- **Container disk doesn't persist**; only `/workspace` survives restarts.

## Resources

- Moltbot: https://github.com/moltbot/moltbot
- vLLM: https://docs.vllm.ai/
- RunPod: https://docs.runpod.io/
