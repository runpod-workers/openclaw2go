Use open weight models (LLM, image, audio) with open source agents on GPU pods. a2go bundles local LLM inference, image generation, and audio services into a single Docker image — everything agents like [Hermes](https://github.com/hermes-agent/hermes) and [OpenClaw](https://openclaw.ai) need to operate autonomously.

## Quick Start

### 1. Pick your models

Go to [a2go.run](https://a2go.run), select your GPU, and choose the models you want to run. The site shows what fits your VRAM and generates the configuration for you.

### 2. Set the environment variables

When deploying this template, fill in these three environment variables:

| Variable | What to put in | Why it's needed |
|----------|---------------|-----------------|
| `A2GO_CONFIG` | Paste the JSON from [a2go.run](https://a2go.run) — it tells the pod which models to download and run. Leave empty to auto-detect the best model for your GPU. | Configures which LLM, image, and audio models to load |
| `A2GO_AUTH_TOKEN` | A secure password you choose (e.g. `my-secret-token-123`). **Do not leave as `changeme`.** | Authenticates the web UI and agent gateway (OpenClaw / Hermes) — anyone with this token can access your pod |
| `A2GO_API_KEY` | A secure API key you choose (e.g. `sk-my-secret-key`). **Do not leave as `changeme`.** | Secures the LLM server. Used both by the agent internally (to talk to the local LLM) and for external API access (`/v1/chat/completions`) |

Use [Runpod Secrets](https://docs.runpod.io/pods/templates/secrets) for `A2GO_AUTH_TOKEN` and `A2GO_API_KEY` to keep them out of your template config.

### 3. Deploy

Hit deploy. The pod will automatically download your selected models and start all services. First boot takes a few minutes depending on model size — subsequent starts use the cached models on your volume.

### 4. Access

Once the pod is running, open:

`https://<pod-id>-18789.proxy.runpod.net/?token=<A2GO_AUTH_TOKEN>`

Replace `<pod-id>` with your pod ID (shown in the Runpod dashboard) and `<A2GO_AUTH_TOKEN>` with the password you set in step 2.

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
| `A2GO_AUTH_TOKEN` | Authenticates the web UI and agent gateway (OpenClaw / Hermes) |
| `A2GO_API_KEY` | Secures all a2go API endpoints (LLM, media, future services) |

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
