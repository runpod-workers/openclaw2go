# Moltbot on RunPod with vLLM

Run Moltbot with GLM-4.7 and other open-source coding models on RunPod using vLLM. Chat with your AI assistant via Telegram!

## Model Comparison

| Model | GPU | VRAM | Cost/hr | Context | Folder |
|-------|-----|------|---------|---------|--------|
| **Base (Qwen2.5-7B)** | Any | 16GB | $0.50 | 16k | `Dockerfile` |
| **GLM-4.7-Flash FP16** | H100/A100 80GB | 56GB | $1.20-1.99 | 32k-64k | `models/glm47-flash-fp16/` |
| **GLM-4.7-Flash AWQ 4-bit** | A100 80GB | 71GB | $1.19 | 114k | `models/glm47-flash-awq-4bit/` |
| **GLM-4.7-REAP W4A16** | B200 | 108GB | $5.19 | 32k | `models/glm47-reap-w4a16/` |

### Recommended: GLM-4.7-Flash AWQ 4-bit

Best value option with full 114k context window at $1.19/hr on A100 80GB.

## Quick Start

### 1. Choose Your Model

```bash
# GLM-4.7-Flash AWQ 4-bit (Best value, A100 80GB)
IMAGE=yourusername/moltbot-glm47-flash-awq-4bit:latest

# GLM-4.7-Flash FP16 (Full precision, H100/A100 80GB)
IMAGE=yourusername/moltbot-glm47-flash-fp16:latest

# GLM-4.7-REAP W4A16 (High-end, B200)
IMAGE=yourusername/moltbot-glm47-reap-w4a16:latest

# Base (Qwen2.5-7B, any GPU)
IMAGE=yourusername/moltbot-vllm:latest
```

### 2. Create RunPod Pod

- **Image**: Your chosen image from above
- **GPU**: Match model requirements
- **Volume**: 150GB at `/workspace`
- **Container Disk**: 50-100GB (depending on model)
- **Ports**: `8000/http, 18789/http, 22/tcp`

### 3. Set Environment Variables

```bash
VLLM_API_KEY=your-secure-key           # Required
TELEGRAM_BOT_TOKEN=your-telegram-token  # Optional
GITHUB_TOKEN=ghp_xxx                    # Optional
```

### 4. Test It

```bash
# Health check
curl http://localhost:8000/health

# Chat completion
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer $VLLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.7-flash",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Docker Images

Images are automatically built and pushed to Docker Hub via GitHub Actions.

| Image | Description |
|-------|-------------|
| `moltbot-glm47-flash-awq-4bit` | GLM-4.7-Flash AWQ 4-bit for A100 80GB |
| `moltbot-glm47-flash-fp16` | GLM-4.7-Flash FP16 for H100/A100 80GB |
| `moltbot-glm47-reap-w4a16` | GLM-4.7-REAP W4A16 for B200 |
| `moltbot-vllm` | Base image with Qwen2.5-7B |

## Project Structure

```
runpod-moltbot/
├── README.md                           # This file
├── .github/
│   └── workflows/
│       └── docker-build.yml            # Build & push to Docker Hub
│
├── models/
│   ├── glm47-flash-fp16/              # Full precision FP16 (H100/A100 80GB)
│   │   ├── README.md
│   │   ├── Dockerfile
│   │   └── entrypoint.sh
│   │
│   ├── glm47-flash-awq-4bit/          # AWQ 4-bit quantized (A100 80GB)
│   │   ├── README.md
│   │   ├── Dockerfile
│   │   └── entrypoint.sh
│   │
│   └── glm47-reap-w4a16/              # Pruned W4A16 quantized (B200)
│       ├── README.md
│       ├── Dockerfile
│       └── entrypoint.sh
│
├── scripts/
│   ├── setup-moltbot.sh
│   └── start-vllm.sh
│
├── config/
│   ├── moltbot.json
│   └── workspace/
│
├── templates/
│   └── moltbot-vllm.json
│
├── tests/
│   ├── test-vllm.sh
│   └── test-tool-calling.sh
│
├── Dockerfile                          # Base image (Qwen2.5-7B)
├── docker-compose.yml
└── .env.example
```

## GitHub Actions

Images are built automatically on:
- Pull requests → tagged as `:{branch-name}` (slashes → `-`, e.g., `:feature-xyz`)
- Push git tag (e.g., `v1.0.0`) → tagged as `:v1.0.0` + `:latest`
- Manual workflow dispatch → select specific model

### Required Setup

**Secrets** (Repository → Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token (not password) |

**Variables** (Repository → Settings → Variables → Actions):

| Variable | Description |
|----------|-------------|
| `DOCKERHUB_REPO` | (Optional) Custom repo name, defaults to username |

### Manual Build

```bash
# Build locally
docker build -t moltbot-glm47-flash-awq-4bit models/glm47-flash-awq-4bit/
docker build -t moltbot-glm47-flash-fp16 models/glm47-flash-fp16/
docker build -t moltbot-glm47-reap-w4a16 models/glm47-reap-w4a16/

# Push to Docker Hub
docker tag moltbot-glm47-flash-awq-4bit yourusername/moltbot-glm47-flash-awq-4bit:latest
docker push yourusername/moltbot-glm47-flash-awq-4bit:latest
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VLLM_API_KEY` | `changeme` | API key for vLLM authentication |
| `MODEL_NAME` | Model-specific | HuggingFace model ID |
| `SERVED_MODEL_NAME` | `glm-4.7-flash` | Model name in API responses |
| `MAX_MODEL_LEN` | Auto-detected | Maximum context length |
| `GPU_MEMORY_UTILIZATION` | `0.92` | GPU memory to use |
| `TELEGRAM_BOT_TOKEN` | | Telegram bot token from @BotFather |
| `GITHUB_TOKEN` | | GitHub PAT for git/gh operations |

### Moltbot Configuration

Config is auto-generated at `/workspace/.clawdbot/clawdbot.json` (legacy path used by Moltbot):

```json
{
  "models": {
    "providers": {
      "local-vllm": {
        "baseUrl": "http://localhost:8000/v1",
        "apiKey": "your-vllm-api-key",
        "api": "openai-completions"
      }
    }
  }
}
```

## Telegram Setup

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Copy the bot token
3. Set `TELEGRAM_BOT_TOKEN` environment variable
4. Start or restart the pod
5. Message your bot on Telegram!

## GitHub Authentication

For git operations inside the container:

1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens)
2. Select scopes: `repo`, `read:org`, `workflow`
3. Set `GITHUB_TOKEN` environment variable
4. Token is auto-configured on startup

## Testing

```bash
# Basic health check
curl http://localhost:8000/health

# List models
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer $VLLM_API_KEY"

# Tool calling test
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer $VLLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.7-flash",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "calculate",
        "description": "Perform a calculation",
        "parameters": {
          "type": "object",
          "properties": {
            "expression": {"type": "string"}
          }
        }
      }
    }]
  }'
```

## Troubleshooting

### vLLM doesn't start
- Check GPU availability: `nvidia-smi`
- Verify VRAM is sufficient for model
- Check logs: `journalctl -u vllm` or container logs

### Model loading is slow
- First load downloads model from HuggingFace (can be 18-60GB)
- Use network volume to persist model across restarts
- AWQ 4-bit model (18GB) loads faster than FP16 (31GB)

### Tool calling not working
- Verify `--enable-auto-tool-choice` is set
- Check tool parser matches model (`glm47` for GLM-4.7)
- Run test script: `./tests/test-tool-calling.sh`

### Orphaned GPU memory
- If vLLM crashes, GPU memory may stay allocated
- Restart the pod to clear memory
- Check with: `nvidia-smi`

### SSH port changes
- RunPod assigns random SSH ports after restart
- Check port via RunPod console or API
- Use RunPod web terminal as alternative

## Known Issues

1. **GGUF not supported** - vLLM doesn't support GLM-4.7's GGUF format. Use AWQ.
2. **Container disk doesn't persist** - Only `/workspace` survives restarts.
3. **B200 requires CUDA 13.1+** - The REAP image includes this automatically.

## Cost Optimization

1. **Use AWQ 4-bit** - Same model, lower VRAM, cheaper GPU ($1.19 vs $1.99/hr)
2. **Stop pods when idle** - RunPod charges per minute
3. **Use network volumes** - Avoid re-downloading models
4. **Consider spot instances** - Up to 80% cheaper

## Resources

- [Moltbot Documentation](https://github.com/moltbot/moltbot)
- [vLLM Documentation](https://docs.vllm.ai/)
- [RunPod Documentation](https://docs.runpod.io/)
- [GLM-4.7 Announcement](https://z.ai/blog/glm-4.7)

## License

MIT
