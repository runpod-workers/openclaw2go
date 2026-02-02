# GLM-4.7-Flash GGUF on RTX 5090 (llama.cpp)

**Working solution for running GLM-4.7-Flash on RTX 5090 Blackwell GPUs.**

## Why llama.cpp?

vLLM with NVFP4 quantization has unresolved bugs with GLM-4.7's MLA (Multi-Latent Attention) architecture on Blackwell GPUs. See [NVFP4_VLLM_ISSUES.md](./NVFP4_VLLM_ISSUES.md) for details.

llama.cpp has native support for `Glm4MoeLite` architecture (PR #18936 merged Jan 2026).

## Specifications

| Spec | Value |
|------|-------|
| Model | unsloth/GLM-4.7-Flash-GGUF (Q4_K_M) |
| Model Size | ~17GB |
| VRAM (total) | ~28GB |
| Context Window | **200,000 tokens** |
| GPU | RTX 5090 (32GB, Blackwell SM120) |
| Inference Speed | ~175 tokens/sec |

## Key Features

- **200k context** - Full model capacity on 32GB GPU
- **Q8 KV cache quantization** - Fits 200k context in VRAM
- **OpenAI-compatible API** - Works with OpenClaw, Claude Code, etc.
- **Native chat template** - Uses `--jinja` for correct GLM-4.7 formatting

## Runpod Deployment

### Quick Start

1. **Add your SSH key** to [Runpod Account Settings → SSH Public Keys](https://www.runpod.io/console/user/settings) (required for device pairing later). If you don't have an SSH key, follow the [Runpod SSH guide](https://docs.runpod.io/pods/configuration/use-ssh).

2. **Create a Pod** with:
   - Image: `runpod/openclaw-stack-glm4.7-flash-gguf-flux.2-klein-4b-sdnq-4bit-dynamic-lfm2.5-audio-1.5b-gguf:latest`
   - GPU: RTX 5090 (or any 32GB+ GPU)
   - Ports: `8000/http`, `8080/http`, `18789/http`, `22/tcp`
   - Network Volume: **30GB minimum**, mounted to `/workspace`
     - Required for model download (~17GB) and config persistence
     - Without a network volume, data is lost on pod restart
   - Environment Variables:
    - `OPENCLAW_WEB_PASSWORD` - Token for Web UI (default: `openclaw`)
     - `LLAMA_API_KEY` - API key for llama.cpp (default: `changeme`)

3. **Wait for startup** - First launch downloads the model (~17GB), which takes a few minutes. Check pod logs for progress.

4. **Access the Control UI**:
   ```
   https://<pod-id>-18789.proxy.runpod.net/?token=<OPENCLAW_WEB_PASSWORD>
   ```
5. **Access the Media UI (proxy)**:
   ```
   https://<pod-id>-8080.proxy.runpod.net
   ```

### First-Time Device Pairing

OpenClaw requires device pairing for security. On first access, you'll see "pairing required".

**To approve your browser:**

```bash
# SSH into your pod
ssh root@<pod-ip> -p <ssh-port>

# List pending pairing requests
OPENCLAW_STATE_DIR=/workspace/.openclaw openclaw pairing list telegram

# Approve your device (use the Request ID from the list)
OPENCLAW_STATE_DIR=/workspace/.openclaw openclaw pairing approve telegram <request-id>
```

After approval, refresh the Web UI - it will work permanently for that browser.

### Ports

| Port | Service |
|------|---------|
| 8000 | llama.cpp API (OpenAI-compatible) |
| 8080 | Media proxy + UI (image/audio links) |
| 18789 | OpenClaw Control UI |
| 22 | SSH |

Note: audio/image servers run on `8001/8002` internally and are not exposed.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_FILE` | `GLM-4.7-Flash-Q4_K_M.gguf` | GGUF file to use |
| `MAX_MODEL_LEN` | `200000` | Context length |
| `LLAMA_API_KEY` | `changeme` | API authentication |
| `OPENCLAW_WEB_PASSWORD` | `openclaw` | Web UI token |
| `TELEGRAM_BOT_TOKEN` | - | Optional Telegram integration |
| `GITHUB_TOKEN` | - | Optional GitHub CLI auth |

## Build & Run

```bash
# Build
docker build -f models/glm47-flash-gguf-llamacpp/Dockerfile -t openclaw-stack-glm4.7-flash-gguf-flux.2-klein-4b-sdnq-4bit-dynamic-lfm2.5-audio-1.5b-gguf .

# Run on RTX 5090
docker run --gpus all -p 8000:8000 -p 8080:8080 -p 18789:18789 \
  -v /path/to/workspace:/workspace \
  -e LLAMA_API_KEY=your-key \
  openclaw-stack-glm4.7-flash-gguf-flux.2-klein-4b-sdnq-4bit-dynamic-lfm2.5-audio-1.5b-gguf
```

## API Usage

```bash
# Health check
curl http://localhost:8000/health

# Chat completion (OpenAI-compatible)
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{
    "model": "glm-4.7-flash",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

## Alternative Quantizations

You can use different GGUF quantizations by changing `MODEL_FILE`:

| Quantization | Size | Quality | VRAM |
|--------------|------|---------|------|
| Q4_K_M | 17GB | Good | ~28GB |
| Q5_K_M | 19GB | Better | ~30GB |
| Q8_0 | 32GB | Best | Won't fit |

## Comparison with vLLM NVFP4

| Feature | llama.cpp GGUF | vLLM NVFP4 |
|---------|---------------|------------|
| Works on RTX 5090 | ✅ Yes | ❌ No (bugs) |
| 200k context | ✅ Yes | ❌ OOM |
| Inference speed | ~175 tok/s | N/A |
| KV cache quant | ✅ Q8 | ❌ FP16 only |
