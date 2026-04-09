# a2go

Use open weight models (LLM, image, audio) with open source agents on GPU pods. a2go bundles local LLM inference, image generation, and audio services into a single Docker image — everything agents like [Hermes](https://github.com/hermes-agent/hermes) and [OpenClaw](https://openclaw.ai) need to operate autonomously.

## Quick Start

1. Go to [a2go.run](https://a2go.run) and pick models for your GPU
2. Copy the generated `A2GO_CONFIG` JSON
3. Paste it into the `A2GO_CONFIG` environment variable when deploying this template
4. Set `A2GO_AUTH_TOKEN` and `LLAMACPP_API_KEY` to secure your pod
5. Deploy - the pod auto-downloads models and starts all services

## Auto-Detect Mode

Leave `A2GO_CONFIG` empty and a2go will automatically select the best model for your GPU based on available VRAM.

## GPU Compatibility

Works with any NVIDIA GPU. The image auto-detects VRAM and adjusts context length, model layers, and batch size accordingly. Tested on RTX 3090, RTX 4090, RTX 5090, H100, H200, and DGX Spark (GB10).

## Volume Requirements

- **Minimum**: 30 GB network volume
- **Recommended**: 50 GB+ for storing multiple models
- Mount path: `/workspace`

Models are cached in `/workspace/models/` and persist across pod restarts.

## Ports

| Port | Protocol | Service |
|------|----------|---------|
| 8000 | HTTP | OpenAI-compatible LLM API (`/v1/chat/completions`) |
| 8080 | HTTP | Web proxy / media server (TTS, STT, image gen, web UI) |
| 8642 | HTTP | Hermes Gateway (agent pairing for Telegram, Discord, WhatsApp) |
| 18789 | HTTP | OpenClaw Gateway (agent pairing, device control UI) |
| 22 | TCP | SSH access |

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `A2GO_AUTH_TOKEN` | Auth token for the gateway + API |
| `LLAMACPP_API_KEY` | Protects the OpenAI-compatible LLM endpoint |

### Recommended

| Variable | Description |
|----------|-------------|
| `A2GO_CONFIG` | Model config JSON from [a2go.run](https://a2go.run). Empty = auto-detect. |
| `HF_TOKEN` | HuggingFace token for faster/gated model downloads |

### Optional

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot integration |
| `GITHUB_TOKEN` | GitHub auth for Claude Code inside the pod |

## Access URLs

Replace `<pod-id>` with your pod ID:

- **Hermes Gateway**: `https://<pod-id>-8642.proxy.runpod.net`
- **OpenClaw Gateway**: `https://<pod-id>-18789.proxy.runpod.net/?token=<A2GO_AUTH_TOKEN>`
- **Web Proxy**: `https://<pod-id>-8080.proxy.runpod.net`
- **LLM API**: `https://<pod-id>-8000.proxy.runpod.net/v1`

## CLI Tools Inside the Pod

SSH into the pod to access:

- `openclaw` - manage devices, pairings, and config
- `hermes` - Hermes agent gateway management
- `llama-server` - llama.cpp inference server (managed by entrypoint)
- `nvidia-smi` - GPU monitoring

## Security

For security and trust information, see [trust.openclaw.ai](https://trust.openclaw.ai).
