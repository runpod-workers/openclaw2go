Use open weight models (LLM, image, audio) with open source agents on GPU pods. a2go bundles local LLM inference, image generation, and audio services into a single Docker image with everything agents like [Hermes](https://github.com/hermes-agent/hermes) and [OpenClaw](https://openclaw.ai) need to operate autonomously.

## Quick Start A: Auto-Detect

### 1. Deploy

Hit deploy. No configuration needed. a2go auto-detects your GPU and picks the best model that fits. Default passwords are `changeme` for both `A2GO_AUTH_TOKEN` and `A2GO_API_KEY`.

### 2. Access

Once the pod is running, open the agent gateway:

- **OpenClaw**: `https://<pod-id>-18789.proxy.runpod.net/?token=changeme`
- **Hermes**: `https://<pod-id>-8642.proxy.runpod.net`

Replace `<pod-id>` with your pod ID from the Runpod dashboard.

## Quick Start B: Pick Your Models

### 1. Pick your models

Go to [a2go.run](https://a2go.run), select your GPU, and choose the models you want to run. The site shows what fits your VRAM and generates the configuration for you.

### 2. Set the environment variables

Before deploying, fill in these environment variables:

| Variable | What to put in | Why it's needed |
|----------|---------------|-----------------|
| `A2GO_CONFIG` | Paste the JSON from [a2go.run](https://a2go.run). This tells the pod which models to download and run. | Configures which LLM, image, and audio models to load |
| `A2GO_AUTH_TOKEN` | A secure password you choose (e.g. `my-secret-token-123`). **Do not leave as `changeme`.** | Authenticates the web UI and agent gateway (OpenClaw / Hermes). Anyone with this token can access your pod. |
| `A2GO_API_KEY` | A secure API key you choose (e.g. `sk-my-secret-key`). **Do not leave as `changeme`.** | Secures the LLM server. Used both by the agent internally (to talk to the local LLM) and for external API access (`/v1/chat/completions`) |

Use [Runpod Secrets](https://docs.runpod.io/pods/templates/secrets) for `A2GO_AUTH_TOKEN` and `A2GO_API_KEY` to keep them out of your template config.

Each agent supports additional environment variables for integrations like Telegram, Discord, and more. See the agent docs for the full list:

- [OpenClaw documentation](https://docs.openclaw.ai/getting-started)
- [Hermes documentation](https://hermes-agent.nousresearch.com/docs)

### 3. Deploy

Hit deploy. The pod will automatically download your selected models and start all services. First boot takes a few minutes depending on model size. Subsequent starts use the cached models on your volume.

### 4. Access

Once the pod is running, open the agent gateway:

- **OpenClaw**: `https://<pod-id>-18789.proxy.runpod.net/?token=<A2GO_AUTH_TOKEN>`
- **Hermes**: `https://<pod-id>-8642.proxy.runpod.net`

Replace `<pod-id>` with your pod ID from the Runpod dashboard and `<A2GO_AUTH_TOKEN>` with the password you set in step 2.

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 18789 | HTTP | OpenClaw gateway for agent control UI and chat |
| 8642 | HTTP | Hermes gateway for agent pairing (Telegram, Discord, WhatsApp) |
| 8080 | HTTP | Media proxy for image gen, TTS, STT, and web UI |
| 8000 | HTTP | LLM API, OpenAI-compatible endpoint (`/v1/chat/completions`) |
| 22 | TCP | SSH for direct shell access to the pod |

Only one gateway port is active depending on which agent you selected in `A2GO_CONFIG`.

## Security

For security and trust information, see [trust.openclaw.ai](https://trust.openclaw.ai).
