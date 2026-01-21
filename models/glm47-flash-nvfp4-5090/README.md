# GLM-4.7-Flash NVFP4 on RTX 5090

Native NVFP4 quantization optimized for **RTX 5090 32GB** (Blackwell SM120).
Full 200K context window with MLA for reduced KV cache memory.

## Specifications

| Property | Value |
|----------|-------|
| Model | `Gadflyll/GLM-4.7-Flash-NVFP4` |
| Model Size | ~20.4GB on disk |
| VRAM (model) | ~20GB |
| VRAM (KV cache) | ~10GB (200K context with MLA + FP8) |
| Total VRAM | ~30GB |
| GPU | RTX 5090 32GB (required) |
| Context | 200,000 tokens |
| Tool Parser | `glm47` |
| Reasoning Parser | `glm45` |
| Cost | ~$0.89/hr |

## Cost Comparison

| Setup | GPU | Context | Cost/hr | Savings |
|-------|-----|---------|---------|---------|
| AWQ 4-bit | A100 80GB | 114K | $1.39 | baseline |
| **NVFP4** | **RTX 5090 32GB** | **200K** | **$0.89** | **36% cheaper** |

## Quick Start

### 1. Create RunPod Pod

**Settings:**
- **Image**: `runpod/clawdbot-glm47-flash-nvfp4-5090:latest`
- **GPU**: 1x RTX 5090 32GB
- **Volume**: 100GB at `/workspace` (network storage)
- **Container Disk**: 50GB
- **Ports**: `8000/http, 18789/http, 22/tcp`

### 2. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUBLIC_KEY` | Yes | - | Your SSH public key |
| `VLLM_API_KEY` | Yes | `changeme` | API key for vLLM |
| `TELEGRAM_BOT_TOKEN` | No | - | Telegram bot token |
| `GITHUB_TOKEN` | No | - | GitHub token for `gh` CLI |
| `CLAWDBOT_WEB_PASSWORD` | No | `clawdbot` | Password for web UI |

### 3. Test It

```bash
curl https://<pod-id>-8000.proxy.runpod.net/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-4.7-flash", "messages": [{"role": "user", "content": "Hello!"}]}'
```

## Technical Details

### Why NVFP4 + RTX 5090?

1. **Native SM120 support**: NVFP4 kernels are natively supported on Blackwell
2. **MLA (Multi-head Latent Attention)**: Reduces KV cache from ~180GB to ~10GB for 200K context
3. **Nearly zero accuracy loss**: "Nearly zero loss vs 62.4GB BF16" per model card
4. **Cost efficiency**: 36% cheaper than A100 80GB

### Build Requirements

- CUDA 13.1+ (NGC 25.12 container)
- PyTorch 2.10+ (included in NGC)
- Transformers 5.0.0rc2+ (glm4_moe_lite support)
- vLLM built from source (SM120 not in precompiled wheels)
- Flash Attention v2 (v3 doesn't work on Blackwell yet)

### Exact Dependency Versions

| Component | Version | Source |
|-----------|---------|--------|
| Base Image | `nvcr.io/nvidia/pytorch:25.12-py3` | NVIDIA NGC |
| CUDA | 13.1.0.36 | Included in NGC |
| PyTorch | 2.10.0a0+b4e4ee81d3 | Included in NGC |
| Python | 3.12 | Included in NGC |
| Transformers | 5.0.0rc2+ | pip install --pre |
| vLLM | latest main | Built from source |

### Build Environment Variables

```bash
VLLM_FLASH_ATTN_VERSION=2    # Force Flash Attention v2
TORCH_CUDA_ARCH_LIST="12.0"  # Target SM120 (Blackwell)
MAX_JOBS=6                    # Limit parallel jobs to avoid OOM
```

## Known Issues

1. **Flash Attention 3 incompatible** - Using v2 via `VLLM_FLASH_ATTN_VERSION=2`
2. **Long build time** - vLLM source compilation takes ~20-30 min
3. **First-start delay** - CUDA graph compilation on first run

### Potential Issues

- **MoE SM120 kernel issue**: "no cutlass_scaled_mm kernel for CUDA device capability: 120"
  - May need vLLM PR #24968 or latest main branch

## Troubleshooting

**vLLM won't start:**
```bash
cat /tmp/vllm.log
nvidia-smi
```

**OOM errors:**
- Check `gpu-memory-utilization` (default 0.95)
- Reduce `MAX_MODEL_LEN` if needed

**Kernel errors:**
- Ensure using latest vLLM main branch
- Check that `VLLM_FLASH_ATTN_VERSION=2` is set

## Fallback Plan

If NVFP4 on RTX 5090 doesn't work:
1. Try AWQ 4-bit model on RTX 5090 (fallback to Marlin kernels)
2. Use H100 80GB with NVFP4 (native Hopper support)
3. Stick with A100 AWQ setup (proven stable)

## References

- [GLM-4.7-Flash-NVFP4 Model](https://huggingface.co/Gadflyll/GLM-4.7-Flash-NVFP4)
- [vLLM RTX 5090 Setup Guide](https://github.com/vllm-project/vllm/issues/14452)
- [vLLM SM120 Support](https://github.com/vllm-project/vllm/issues/13306)
- [NVIDIA NGC PyTorch 25.12](https://docs.nvidia.com/deeplearning/frameworks/pytorch-release-notes/rel-25-12.html)
