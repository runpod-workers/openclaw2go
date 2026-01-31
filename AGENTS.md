# AGENTS.md

OpenClaw on RunPod: Docker images that run an AI coding assistant with GLM-4.7 LLM on various GPUs.

## Codebase Structure

```
runpod-clawdbot/
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

## RunPod Pod Access

```bash
# SSH into pod (use RunPod MCP tools to get IP/port)
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

## Important Notes

- Never start/stop servers in code — user handles that
- Use RunPod MCP tools to manage pods
- RTX 5090 image gen requires: PyTorch cu128 + diffusers from git
- Model downloads go to `/workspace/huggingface/` (persisted volume)
