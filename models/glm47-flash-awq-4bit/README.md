# GLM-4.7-Flash AWQ 4-bit

Quantized version of GLM-4.7-Flash for A100 80GB GPUs.
Best value for GLM-4.7 tool calling capabilities.

## Specifications

| Property | Value |
|----------|-------|
| Model | cyankiwi/GLM-4.7-Flash-AWQ-4bit |
| Model Size | 18GB on disk |
| VRAM (model) | ~17.3GB |
| VRAM (KV cache) | ~54GB |
| Total VRAM | ~71GB |
| GPU | A100 80GB (required) |
| Context | 114,688 tokens |
| Tool Parser | glm47 |
| Cost | ~$1.19/hr |

## Quick Start

### 1. Create RunPod Pod

- **Image**: `yourusername/clawdbot-glm47-flash-awq-4bit:latest`
- **GPU**: 1x A100 80GB
- **Volume**: 150GB at `/workspace`
- **Container Disk**: 50GB
- **Ports**: `8000/http, 18789/http, 22/tcp`

### 2. Environment Variables

```bash
VLLM_API_KEY=your-secure-key
TELEGRAM_BOT_TOKEN=your-telegram-token  # Optional
GITHUB_TOKEN=ghp_xxx                     # Optional
```

### 3. Test It

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

## Storage Layout

Files persist on network volume `/workspace`:

```
/workspace/
├── models/GLM-4.7-Flash-AWQ-4bit/  # 18GB model
├── .clawdbot/
│   ├── clawdbot.json               # Config
│   ├── agents/                     # State
│   └── telegram/                   # Session
└── clawd/                          # Workspace
```

## Claude Code Integration

```bash
# Set environment variables
export OPENAI_API_KEY="$VLLM_API_KEY"
export OPENAI_BASE_URL="http://localhost:8000/v1"

# Or create ~/.claude/settings.json
{
  "model": "glm-4.7-flash",
  "apiKey": "your-vllm-api-key",
  "baseUrl": "http://localhost:8000/v1"
}
```

## Known Issues

1. **GGUF not supported** - vLLM doesn't support GLM-4.7's GGUF format. Use AWQ.
2. **Orphaned GPU memory** - If vLLM crashes, GPU memory stays allocated. Restart pod to fix.
3. **Container disk doesn't persist** - Only `/workspace` survives restarts.
4. **SSH port changes** - After restart, check SSH port via RunPod API.

## When to Use This

- You have A100 80GB
- You want GLM-4.7 tool calling at lower cost than H100
- You need the full 114k context window
