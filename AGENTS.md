# AGENTS.md

OpenClaw2Go on Runpod: self-contained Docker images with LLM + media services for GPU pods.

## Codebase Structure

```
openclaw2go/
├── models/                      # GPU-specific Dockerfiles
│   ├── glm47-flash-gguf-llamacpp/  # RTX 5090 - llama.cpp (primary)
│   ├── glm47-flash-awq-4bit/       # A100 80GB - vLLM
│   ├── glm47-flash-fp16/           # H100/A100 - vLLM
│   ├── glm47-flash-nvfp4-5090/     # RTX 5090 - vLLM (experimental)
│   └── glm47-reap-w4a16/           # B200 - vLLM
├── scripts/                     # Startup and utilities
│   ├── entrypoint.sh               # Main container entrypoint
│   ├── entrypoint-common.sh        # Shared entrypoint logic
│   └── openclaw-image-gen          # Image generation CLI
├── skills/                      # Agent capabilities
│   └── image-gen/                  # FLUX.2 image generation
├── config/
│   ├── openclaw.json               # OpenClaw config template
│   └── workspace/                  # Files copied to /workspace/openclaw/
├── tests/                       # Test scripts
└── Dockerfile                   # Base/fallback Dockerfile
```

## Key Decisions

- **RTX 5090 uses llama.cpp** (`glm47-flash-gguf-llamacpp/`) — vLLM has dimension mismatch bugs with GLM-4.7 MLA attention on NVFP4
- **PyTorch cu128 required for RTX 5090** — cu124 doesn't support Blackwell sm_120 architecture
- **Diffusers from git** — stable release lacks `Flux2KleinPipeline` for image generation
- **llama.cpp built from source** with `DCMAKE_CUDA_ARCHITECTURES="120"` for sm_120 support
- **LLM and Audio binaries MUST be separate** — LLM uses main llama.cpp branch, Audio uses PR #18641 branch. They have incompatible shared libraries. LLM libs go to `/usr/local/lib/`, Audio libs go to `/usr/local/bin/` (see Dockerfile lines 52 vs 73). Mixing them breaks LLM server startup.
- **Persistent servers for low latency** — Audio (port 8001) and Image (port 8002) run as persistent servers with models pre-loaded in VRAM. CLI scripts (`openclaw-tts`, `openclaw-stt`, `openclaw-image-gen`) call these servers via HTTP API for instant inference (~0.3-0.8s vs 2-3s with per-request loading). These ports are internal-only; public access goes through the proxy on 8080.

## Build Commands

```bash
# Build primary RTX 5090 image
docker build -f models/glm47-flash-gguf-llamacpp/Dockerfile -t openclaw-gguf .

# Build other variants
docker build -f models/glm47-flash-awq-4bit/Dockerfile -t openclaw-awq .
docker build -f models/glm47-flash-fp16/Dockerfile -t openclaw-fp16 .
```

## Testing

```bash
# Health check
curl http://localhost:8000/health

# Test suites
./tests/test-vllm.sh
./tests/test-tool-calling.sh

# Image generation
openclaw-image-gen --prompt "test" --width 512 --height 512 --output /tmp/test.png
```

## Operational Gotchas

- Control UI requires device pairing; without it, chat stays disconnected and previews won't render.
  Use `OPENCLAW_GATEWAY_TOKEN=<token> openclaw devices list` then
  `OPENCLAW_GATEWAY_TOKEN=<token> openclaw devices approve <request-id>`.
- Image previews need a public proxy URL (port 8080). Runpod may 403 non-browser
  requests; verify with a browser user agent when testing.
- Disable external image skills in `/workspace/.openclaw/openclaw.json` so the model
  never tries GPT/OpenAI image tools:
  `skills.entries.openai-image-gen.enabled=false`,
  `skills.entries.nano-banana-pro.enabled=false`.
  Use `openclaw-image-gen` only.

## Runpod Pod Access

```bash
# SSH into pod (use Runpod MCP tools to get IP/port)
ssh -i ~/.ssh/id_runpod root@<ip> -p <port>

# Common debugging
nvidia-smi
curl http://localhost:8000/health
curl http://localhost:8000/v1/models
```

## Where to Make Changes

| Task | Location |
|------|----------|
| Add new GPU variant | Create new folder in `models/` with Dockerfile + entrypoint.sh |
| Change startup logic | `scripts/entrypoint-common.sh` (shared) or model-specific entrypoint |
| Add agent skill | Create folder in `skills/` with SKILL.md |
| Modify OpenClaw workspace | `config/workspace/` |
| Update CI/CD | `.github/workflows/docker-build.yml` |

## VRAM Usage (RTX 5090 - 32GB)

| Component | VRAM | Notes |
|-----------|------|-------|
| GLM-4.7 LLM (200k ctx) | ~22.5 GB | Model + KV cache (q8_0), `LLAMA_GPU_LAYERS=44` |
| Audio Server (TTS/STT) | ~2 GB | LFM2.5-Audio-1.5B-Q4_0 |
| Image Server (FLUX.2) | ~3-4 GB | FLUX.2-klein-4B-SDNQ-4bit-dynamic |
| **Total (all 3)** | **~29-30 GB** | **~2 GB free** |
| **LLM + Audio only** | **~26 GB** | **~6 GB free** |

**Note**: 200k context fits with all 3 servers on 32GB when `LLAMA_PARALLEL=1` and `LLAMA_GPU_LAYERS=44`. If memory pressure occurs, reduce `MAX_MODEL_LEN` or lower `LLAMA_GPU_LAYERS`.

## Important Notes

- Never start/stop servers in code — user handles that
- Use Runpod MCP tools to manage pods
- RTX 5090 image gen requires: PyTorch cu128 + diffusers from git
- Model downloads go to `/workspace/huggingface/` (persisted volume)
- **CRITICAL**: LLM binaries (main branch) and Audio binaries (PR #18641) must use separate library paths. Never copy audio `.so` files to `/usr/local/lib/` - they will break LLM server.
