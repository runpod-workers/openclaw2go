# OpenClaw2Go on Runpod

OpenClaw2Go is a self-contained stack that includes an LLM plus image/audio services and the OpenClaw UI, so you can run a fully self-contained assistant on Runpod (or any GPU host). Each model variant has its own folder under `models/` with a dedicated README and startup script.

## Primary release (published)

| Image tag | LLM | Audio | Image | GPU target | Context | Status |
|----------|-----|-------|-------|------------|---------|--------|
| `openclaw2go-glm4.7-flash-gguf-flux.2-klein-4b-sdnq-4bit-dynamic-lfm2.5-audio-1.5b-gguf` | [unsloth/GLM-4.7-Flash-GGUF](https://huggingface.co/unsloth/GLM-4.7-Flash-GGUF) (Q4_K_M) | [LiquidAI/LFM2.5-Audio-1.5B-GGUF](https://huggingface.co/LiquidAI/LFM2.5-Audio-1.5B-GGUF) | [Disty0/FLUX.2-klein-4B-SDNQ-4bit-dynamic](https://huggingface.co/Disty0/FLUX.2-klein-4B-SDNQ-4bit-dynamic) | RTX 5090 32GB | 150k (default) | Published |

## Testing images (not published)

| Image tag | Backend | LLM weights | GPU target | Status | Notes |
|----------|---------|-------------|------------|--------|-------|
| `openclaw2go-glm4.7-flash-awq-4bit` | vLLM | [cyankiwi/GLM-4.7-Flash-AWQ-4bit](https://huggingface.co/cyankiwi/GLM-4.7-Flash-AWQ-4bit) | A100 80GB | Testing | Best value on A100; long context (LLM-only) |
| `openclaw2go-glm4.7-flash-fp16` | vLLM | [zai-org/GLM-4.7-Flash](https://huggingface.co/zai-org/GLM-4.7-Flash) | H100/A100 80GB | Testing | Full precision (LLM-only) |
| `openclaw2go-glm4.7-flash-nvfp4-5090` | vLLM | [GadflyII/GLM-4.7-Flash-NVFP4](https://huggingface.co/GadflyII/GLM-4.7-Flash-NVFP4) | RTX 5090 32GB | Not working | vLLM MLA issues on Blackwell (LLM-only) |
| `openclaw2go-glm4.7-reap-w4a16` | vLLM | [0xSero/GLM-4.7-REAP-40-W4A16](https://huggingface.co/0xSero/GLM-4.7-REAP-40-W4A16) | B200 180GB | Testing | High-end B200 (LLM-only) |
| `openclaw2go-vllm` | vLLM | [Qwen/Qwen2.5-Coder-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct) | 16GB+ | Testing | Base image (LLM-only) |

Notes:
- Only the primary image is published right now.
- Context values are defaults; some variants allow tuning via `MAX_MODEL_LEN`.
- NVFP4 status details live in `models/glm47-flash-nvfp4-5090/ISSUES.md`.

## Deployment on Runpod

1. **Pick an image** from the table above.
2. **Create a Runpod pod**:
   - Volume: 30GB minimum at `/workspace` (increase for vLLM models)
   - Ports: `8000/http, 8080/http, 18789/http, 22/tcp`
3. **Set environment variables**:
   - `VLLM_API_KEY` (for vLLM variants)
   - `OPENCLAW_WEB_PASSWORD` (web UI token)
   - `HF_TOKEN` (optional, faster downloads)
   - `TELEGRAM_BOT_TOKEN` (optional)
   - For GGUF + llama.cpp: use `LLAMA_API_KEY` instead of `VLLM_API_KEY`
4. **Open the Control UI** (use your Runpod pod ID):
   - `https://<pod-id>-18789.proxy.runpod.net/?token=<OPENCLAW_WEB_PASSWORD>`
5. **Open the Media UI (proxy)**:
   - `https://<pod-id>-8080.proxy.runpod.net`
6. **Approve device pairing** (first time only):
   - When you see “pairing required”, SSH into the pod and run:
     - `OPENCLAW_STATE_DIR=/workspace/.openclaw openclaw devices list --json`
     - `OPENCLAW_STATE_DIR=/workspace/.openclaw openclaw devices approve <requestId>`
   - Pairing requests expire quickly; refresh the Web UI if it disappears.
7. **Health check**:
```bash
curl http://localhost:8000/health
```

## Folder map

| Folder | Purpose |
|--------|---------|
| `models/` | Model-specific Dockerfiles + entrypoints |
| `scripts/` | Base entrypoint + setup helpers |
| `templates/` | Runpod template JSONs |
| `config/` | OpenClaw config templates |

## Port map (published image)

- `8000/http` — LLM API (OpenAI-compatible)
- `8080/http` — Media proxy + UI (image/audio links)
- `18789/http` — OpenClaw Control UI
- `22/tcp` — SSH

Note: audio/image servers run on `8001/8002` **internally only** and should not be exposed.

## Image naming + tags

We publish one image per variant under:

- `openclaw2go-<llm>-<variant>-flux.2-klein-4b-sdnq-4bit-dynamic-lfm2.5-audio-1.5b-gguf` (full stack)
- `openclaw2go-<llm>-<variant>` (LLM-only testing images)

Dots are valid in Docker repository names and tags, so we keep model versions like `glm4.7`, `flux.2`, and `lfm2.5`.

Current published image:

- `openclaw2go-glm4.7-flash-gguf-flux.2-klein-4b-sdnq-4bit-dynamic-lfm2.5-audio-1.5b-gguf`

Tags:

- `:latest` for main branch
- `:<branch>` for branch builds
- `:vX.Y.Z` for version tags

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

- OpenClaw2Go: https://github.com/runpod-workers/openclaw2go
- OpenClaw: https://github.com/openclaw/openclaw
- vLLM: https://docs.vllm.ai/
- Runpod: https://docs.runpod.io/
