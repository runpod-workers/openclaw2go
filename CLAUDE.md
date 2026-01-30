# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RunPod-optimized Docker deployment for running OpenClaw (AI coding assistant) with GLM-4.7 language models using vLLM for inference. Multiple model variants are optimized for different GPU tiers (A100, H100, B200, RTX 5090).

## Build Commands

```bash
# Build a specific model variant
docker build -f models/glm47-flash-awq-4bit/Dockerfile -t openclaw-glm47-flash-awq-4bit .
docker build -f models/glm47-flash-fp16/Dockerfile -t openclaw-glm47-flash-fp16 .
docker build -f models/glm47-flash-nvfp4-5090/Dockerfile -t openclaw-glm47-flash-nvfp4-5090 .

# Push to Docker Hub
docker tag openclaw-glm47-flash-awq-4bit yourusername/openclaw-glm47-flash-awq-4bit:latest
docker push yourusername/openclaw-glm47-flash-awq-4bit:latest
```

## Local Development

```bash
# Run vLLM server with GPU
docker-compose up vllm

# Run with mock vLLM (no GPU required)
docker-compose --profile mock up vllm-mock

# Run test suite
docker-compose --profile test up tests
```

## Testing

```bash
# Health check
curl http://localhost:8000/health

# List models
curl http://localhost:8000/v1/models -H "Authorization: Bearer $VLLM_API_KEY"

# Run full test suites
./tests/test-vllm.sh           # 6 tests: health, models, chat, coding, tokens, streaming
./tests/test-tool-calling.sh   # Tool calling functionality
```

## Architecture

```
models/                    # Model-specific Dockerfiles and configs
├── glm47-flash-awq-4bit/  # AWQ 4-bit quantized (A100 80GB)
├── glm47-flash-fp16/      # Full precision (H100/A100)
├── glm47-flash-nvfp4-5090/# NVFP4 quantized (RTX 5090)
└── glm47-reap-w4a16/      # REAP W4A16 (B200)

scripts/                   # Startup orchestration
├── entrypoint.sh          # Docker entrypoint (starts vLLM + OpenClaw)
├── start-vllm.sh          # vLLM server with GPU detection
└── setup-openclaw.sh      # OpenClaw installation

config/                    # Runtime configuration
├── openclaw.json          # OpenClaw config template
└── workspace/             # Agent identity and system docs
```

## Key Ports

| Port  | Service           |
|-------|-------------------|
| 8000  | vLLM API          |
| 18789 | OpenClaw Gateway |
| 18790 | OpenClaw Bridge  |
| 18793 | OpenClaw Canvas  |
| 22    | SSH               |

## CI/CD (GitHub Actions)

Workflow at `.github/workflows/docker-build.yml`:
- Push to `main` → tagged `:latest`
- Push to branches → tagged `:dev-{branch}`
- Git tags (v1.0.0) → tagged with version + `:latest`
- PRs → build validation only

Required secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

## Environment Variables

Key variables from `.env.example`:
- `VLLM_API_KEY` - API authentication
- `MODEL_NAME` - HuggingFace model path
- `SERVED_MODEL_NAME` - Model alias for API
- `MAX_MODEL_LEN` - Context window size
- `TOOL_CALL_PARSER` - Parser type (hermes)
- `HF_TOKEN` - HuggingFace authentication (for gated models)

## Entrypoint Flow

1. Configure environment and detect GPU count
2. Generate `openclaw.json` with vLLM provider settings
3. Start vLLM server in background
4. Wait for health check (max 5 minutes)
5. Start OpenClaw gateway
6. Handle graceful shutdown on SIGTERM/SIGINT

## RunPod SSH Access

Always use the local RunPod SSH key when connecting to pods:

```bash
ssh -i ~/.ssh/id_runpod root@<public-ip> -p <port>
```

## Debugging on RunPod Pods

When SSH'd into a RunPod pod, check these locations for logs:

```bash
# vLLM logs (runs in foreground, check container logs in RunPod UI)
# Or if debugging after SSH:
ps aux | grep vllm           # Check if vLLM is running
nvidia-smi                   # Check GPU memory usage

# System logs
journalctl -u ssh            # SSH service logs
dmesg | tail -50             # Kernel messages (CUDA errors appear here)

# Container startup logs visible in RunPod web UI under "Logs" tab

# Common debugging commands
curl http://localhost:8000/health    # vLLM health check
curl http://localhost:8000/v1/models # List loaded models
```
