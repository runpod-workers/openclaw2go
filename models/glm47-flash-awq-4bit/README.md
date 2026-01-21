# GLM-4.7-Flash AWQ 4-bit

Quantized version of GLM-4.7-Flash for **A100 80GB** GPUs. Best value for GLM-4.7 tool calling with full 114k context window.

## Specifications

| Property | Value |
|----------|-------|
| Model | `cyankiwi/GLM-4.7-Flash-AWQ-4bit` |
| Model Size | 18GB on disk |
| VRAM (model) | ~17GB |
| VRAM (KV cache) | ~54GB |
| Total VRAM | ~75GB |
| GPU | A100 80GB (required) |
| Context | 114,688 tokens |
| Tool Parser | `glm47` |
| Reasoning Parser | `glm45` |
| Cost | ~$1.19-1.39/hr |

## Quick Start

### 1. Create RunPod Pod

**Settings:**
- **Image**: `runpod/clawdbot-glm47-flash-awq-4bit:latest`
- **GPU**: 1x A100 80GB
- **Volume**: 150GB at `/workspace` (network storage)
- **Container Disk**: 50GB
- **Ports**: `8000/http, 18789/http, 22/tcp`

### 2. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUBLIC_KEY` | Yes | - | Your SSH public key |
| `VLLM_API_KEY` | Yes | `changeme` | API key for vLLM |
| `TELEGRAM_BOT_TOKEN` | No | - | Telegram bot token for chat integration |
| `GITHUB_TOKEN` | No | - | GitHub token for `gh` CLI |
| `CLAWDBOT_WEB_PASSWORD` | No | `clawdbot` | Password for web UI |

### 3. Access Points

After the pod starts (~90 seconds for cached starts, longer for first start):

| Service | URL | Auth |
|---------|-----|------|
| vLLM API | `https://<pod-id>-8000.proxy.runpod.net` | Bearer token (`VLLM_API_KEY`) |
| Web UI | `https://<pod-id>-18789.proxy.runpod.net` | Password (`CLAWDBOT_WEB_PASSWORD`) |
| SSH | `ssh root@<public-ip> -p <mapped-port>` | SSH key |

### 4. Test It

```bash
# Health check
curl https://<pod-id>-8000.proxy.runpod.net/health

# Chat completion
curl https://<pod-id>-8000.proxy.runpod.net/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.7-flash",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'

# Tool calling
curl https://<pod-id>-8000.proxy.runpod.net/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.7-flash",
    "messages": [{"role": "user", "content": "What is 25 * 17?"}],
    "tools": [{"type": "function", "function": {"name": "calculator", "parameters": {"type": "object", "properties": {"expression": {"type": "string"}}}}}]
  }'
```

## Storage Layout

All persistent data is stored on the network volume `/workspace`:

```
/workspace/
├── models/
│   └── GLM-4.7-Flash-AWQ-4bit/    # 18GB model (downloaded once)
├── .cache/
│   ├── vllm/                       # CUDA graphs & torch compile cache (~400MB)
│   └── huggingface/                # HF cache
├── .clawdbot/
│   ├── clawdbot.json               # Config
│   ├── agents/                     # Agent state
│   └── telegram/                   # Telegram session
├── .config/gh/                     # GitHub CLI config
└── clawd/                          # Claude Code workspace
```

**Startup times:**
- First start (no cache): ~5-10 min (model download + CUDA graph compilation)
- Subsequent starts (with cache): ~90 seconds

## Web UI

Access the Clawdbot web UI at `https://<pod-id>-18789.proxy.runpod.net`:

1. Enter the password (default: `clawdbot` or your `CLAWDBOT_WEB_PASSWORD`)
2. Chat with the model through the web interface
3. No CLI access required

## Telegram Integration

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set the `TELEGRAM_BOT_TOKEN` environment variable
3. Start chatting with your bot

The Telegram session persists on the network volume.

## Claude Code Integration

SSH into the pod and use Claude Code with the local vLLM:

```bash
# Environment is pre-configured
claude

# Or explicitly set:
export OPENAI_API_KEY="your-vllm-api-key"
export OPENAI_BASE_URL="http://localhost:8000/v1"
claude
```

## Performance Tuning

The entrypoint is optimized for A100 80GB:

| Setting | Value | Reason |
|---------|-------|--------|
| `--gpu-memory-utilization` | 0.92 | Use most of 80GB VRAM |
| `--kv-cache-dtype fp8` | FP8 | Fits 114k context in VRAM |
| `--block-size 32` | 32 | Optimal for AWQ models |
| `--disable-log-requests` | - | Cleaner logs |
| `XDG_CACHE_HOME` | `/workspace/.cache` | Persist CUDA graphs between restarts |

## Known Issues

1. **SSH port changes after restart** - Check the new SSH port via RunPod dashboard
2. **Orphaned GPU processes** - If vLLM crashes, restart the pod to free GPU memory
3. **GGUF not supported** - vLLM doesn't support GLM-4.7's GGUF format; use AWQ
4. **Container disk doesn't persist** - Only `/workspace` survives restarts

## Troubleshooting

**vLLM won't start:**
```bash
# Check logs
cat /tmp/vllm.log

# Check GPU memory
nvidia-smi

# Kill orphaned processes
pkill -9 -f vllm
```

**Web UI won't connect:**
- Ensure port 18789 is exposed
- Check that gateway is running: `ps aux | grep clawdbot`
- Verify bind mode is `lan` in config

**Model download fails:**
```bash
# Manual download
huggingface-cli download cyankiwi/GLM-4.7-Flash-AWQ-4bit \
  --local-dir /workspace/models/GLM-4.7-Flash-AWQ-4bit
```

## Comparison with Other GLM Variants

| Model | GPU | VRAM | Context | Cost/hr |
|-------|-----|------|---------|---------|
| GLM-4.7-Flash FP16 | H100/A100 80GB | 56GB | 64k | $1.49-1.99 |
| **GLM-4.7-Flash AWQ 4-bit** | A100 80GB | 75GB | 114k | $1.19-1.39 |
| GLM-4.7-REAP W4A16 | B200 | 108GB | 64k | $3+ |

**Why choose AWQ 4-bit?**
- Full 114k context window (vs 64k for FP16)
- Lower cost than H100 FP16
- Excellent tool calling support
- Minimal quality loss from quantization
