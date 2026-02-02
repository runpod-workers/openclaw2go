# GLM-4.7-REAP W4A16

Expert-pruned and INT4 quantized GLM-4.7 for B200 GPUs.
High-end option for maximum performance.

## Specifications

| Property | Value |
|----------|-------|
| Model | 0xSero/GLM-4.7-REAP-40-W4A16 |
| Architecture | 40% expert-pruned MoE |
| Quantization | W4A16 (INT4 weights, FP16 activations) |
| VRAM | ~108GB |
| GPU | B200 180GB (required) |
| Context | 32,768 tokens |
| Tool Parser | glm45 |
| CUDA | 13.1+ (Blackwell support) |
| Cost | ~$5.19/hr |

## Quick Start

### 1. Create Runpod Pod

- **Image**: `yourusername/openclaw-stack-glm4.7-reap-w4a16:latest`
- **GPU**: 1x B200 180GB
- **Volume**: 200GB at `/workspace`
- **Container Disk**: 50GB
- **Ports**: `8000/http, 18789/http, 22/tcp`

### 2. Environment Variables

```bash
VLLM_API_KEY=your-secure-key
TELEGRAM_BOT_TOKEN=your-telegram-token  # Optional
GITHUB_TOKEN=ghp_xxx                     # Optional
MAX_MODEL_LEN=32768                      # Default
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
    "model": "glm-4.7-reap",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Storage Layout

Files persist on network volume `/workspace`:

```
/workspace/
├── huggingface/                   # Model cache
├── .openclaw/                     # OpenClaw state path
│   ├── openclaw.json              # Config
│   ├── agents/                    # State
│   └── telegram/                  # Session
└── openclaw/                      # Workspace
```

## B200 (Blackwell) Support

This image includes CUDA 13.1 for B200 compute_100a support:

- FlashInfer attention (downloads B200 cubins automatically)
- CUDA graphs enabled for performance
- First startup may take 10-15 minutes (cubin download + CUDA graph capture)

## When to Use This

- You have B200 180GB available
- You want expert-pruned architecture with INT4 quantization
- You need high-end performance
- Budget is not a primary concern
