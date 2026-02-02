# GLM-4.7-Flash FP16

Full precision GLM-4.7-Flash for H100/A100 80GB GPUs.
Best quality with auto-detected context based on GPU.

## Specifications

| Property | Value |
|----------|-------|
| Model | zai-org/GLM-4.7-Flash |
| Model Size | ~31GB on disk |
| VRAM | ~56GB base |
| GPU | H100 80GB or A100 80GB |
| Context | Auto-detected (32k-64k) |
| Tool Parser | glm47 |
| Reasoning Parser | glm45 |
| Cost | $1.19-1.99/hr |

## GPU Compatibility

| GPU | VRAM | Context | Cost/hr |
|-----|------|---------|---------|
| A100 80GB | 80GB | 32k | $1.19-1.49 |
| H100 80GB | 80GB | 64k | $1.99 |
| A100 40GB | 40GB | 16k | $0.69 |
| B200 180GB | 180GB | 192k | $5.19 |

## Quick Start

### 1. Create Runpod Pod

- **Image**: `yourusername/openclaw-stack-glm4.7-flash-fp16:latest`
- **GPU**: 1x H100 80GB or A100 80GB
- **Volume**: 50GB at `/workspace`
- **Container Disk**: 100GB (model stored here)
- **Ports**: `8000/http, 18789/http, 22/tcp`

### 2. Environment Variables

```bash
VLLM_API_KEY=your-secure-key
TELEGRAM_BOT_TOKEN=your-telegram-token  # Optional
GITHUB_TOKEN=ghp_xxx                     # Optional
# MAX_MODEL_LEN=65536                    # Auto-detected if not set
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

Model is stored on container disk (100GB required), state persists on workspace volume:

```
/root/.cache/huggingface/          # Model files (container disk)
/workspace/
├── .openclaw/                     # OpenClaw state path
│   ├── openclaw.json              # Config
│   ├── agents/                    # State
│   └── telegram/                  # Session
└── openclaw/                      # Workspace
```

## vLLM Configuration

The entrypoint automatically configures vLLM with optimal settings:

- `--kv-cache-dtype fp8` - Reduces KV cache memory by ~50%
- `--block-size 32` - Workaround for FlashInfer bug with head_size 256
- `--gpu-memory-utilization 0.92` - Maximize GPU usage
- `--tool-call-parser glm47` - GLM-4.7 tool calling
- `--reasoning-parser glm45` - Interleaved thinking support

## Requirements

This image requires **vLLM nightly** (not PyPI stable):

```bash
pip install -U vllm --pre --extra-index-url https://wheels.vllm.ai/nightly
pip install git+https://github.com/huggingface/transformers.git
```

## When to Use This

- You want maximum quality (FP16 precision)
- You have H100/A100 80GB available
- You prefer auto-detected optimal context
