# OpenClaw2Go

A self-contained AI assistant stack for GPU pods. One Docker image, any GPU — configure at runtime what you need.

**Image**: `runpod/openclaw2go:latest` (~7 GB compressed)

## What's inside

| Component | Details |
|-----------|---------|
| LLM | [GLM-4.7-Flash](https://huggingface.co/unsloth/GLM-4.7-Flash-GGUF) Q4_K_M via llama.cpp (default) |
| Audio | [LFM2.5-Audio-1.5B](https://huggingface.co/LiquidAI/LFM2.5-Audio-1.5B-GGUF) — TTS + STT |
| Image | [FLUX.2 Klein 4B](https://huggingface.co/Disty0/FLUX.2-klein-4B-SDNQ-4bit-dynamic) — SDNQ 4-bit |
| UI | [OpenClaw](https://github.com/openclaw/openclaw) gateway + control UI |
| Coding | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI |

All models download on first start and persist on the volume.

## Quick start

1. Create a pod on [Runpod](https://runpod.io) (or any GPU host)
2. Image: `runpod/openclaw2go:latest`
3. Volume: 100 GB at `/workspace`
4. Ports: `8000/http`, `8080/http`, `18789/http`, `22/tcp`
5. Set env vars:
   - `OPENCLAW2GO_CONFIG` — what to run (see below)
   - `OPENCLAW_WEB_PASSWORD` — web UI token
   - `LLAMA_API_KEY` — LLM API key (default: `changeme`)

## Configuration

Everything is controlled via the `OPENCLAW2GO_CONFIG` env var (JSON):

```bash
# Full stack — LLM + Audio + Image
OPENCLAW2GO_CONFIG='{"llm":"unsloth/glm47-flash-gguf","audio":"liquidai/lfm25-audio","image":"disty0/flux2-klein-sdnq"}'

# LLM + Audio only (more VRAM for context)
OPENCLAW2GO_CONFIG='{"llm":"unsloth/glm47-flash-gguf","audio":"liquidai/lfm25-audio"}'

# Specific model
OPENCLAW2GO_CONFIG='{"llm":"unsloth/Nemotron-3-Nano-30B-A3B-GGUF"}'

# Specific model + context override
OPENCLAW2GO_CONFIG='{"llm":"unsloth/GLM-4.7-Flash-GGUF","contextLength":200000}'

# Auto-detect GPU, use defaults that fit
OPENCLAW2GO_CONFIG='{}'
```

Model names are case-insensitive. Use HuggingFace repo names or short IDs.

## Available models

| Model | Type | Size | Best for |
|-------|------|------|----------|
| [GLM-4.7-Flash](https://huggingface.co/unsloth/GLM-4.7-Flash-GGUF) Q4_K_M | LLM (default) | ~17 GB | General purpose, tool calling |
| [Nemotron-3-Nano](https://huggingface.co/unsloth/Nemotron-3-Nano-30B-A3B-GGUF) Q4_K_XL | LLM | ~22 GB | MoE, reasoning + content |
| [GPT-OSS-20B](https://huggingface.co/unsloth/gpt-oss-20b-GGUF) Q8_0 | LLM | ~13 GB | Fits any GPU |
| [GLM-4.7 Claude Distill](https://huggingface.co/TeichAI/GLM-4.7-Flash-Claude-Opus-4.5-High-Reasoning-Distill-GGUF) Q4_K_M | LLM | ~17 GB | Reasoning with `reasoning_content` |
| [Qwen3-Coder-Next](https://huggingface.co/unsloth/Qwen3-Coder-Next-GGUF) Q3_K_M | LLM | ~38 GB | 80B MoE, coding (L40/A100) |
| [Step-3.5-Flash](https://huggingface.co/bartowski/stepfun-ai_Step-3.5-Flash-GGUF) Q2_K | LLM | ~67 GB | 197B MoE, reasoning (A100 80GB) |
| [LFM2.5-Audio-1.5B](https://huggingface.co/LiquidAI/LFM2.5-Audio-1.5B-GGUF) | Audio (default) | ~2 GB | TTS + STT |
| [FLUX.2 Klein 4B](https://huggingface.co/Disty0/FLUX.2-klein-4B-SDNQ-4bit-dynamic) SDNQ | Image (default) | ~4 GB | Image generation |

New models can be added via the [external registry](https://github.com/runpod-workers/openclaw2go-registry) without rebuilding the image.

## Verified GPU configs

| GPU | Config | Status |
|-----|--------|--------|
| RTX 5090 (32 GB) | Full stack (LLM + Audio + Image, 150k ctx) | PASS |
| RTX 5090 | GLM-4.7 Claude Distill | PASS |
| RTX 5090 | Nemotron-3-Nano | PASS |
| RTX 5090 | GPT-OSS-20B | PASS |
| RTX 4090 (24 GB) | Auto-detect (LLM + Audio, 16.6k ctx) | PASS |
| RTX 4090 | GPT-OSS-20B (131k ctx) | PASS |
| L40 (48 GB) | Full stack (LLM + Audio + Image, 150k ctx) | PASS |
| L40 | Qwen3-Coder-Next (32k ctx) | PASS |
| A100 80 GB | Step-3.5-Flash (32k ctx) | PASS |

See [`tests/VERIFIED-CONFIGS.md`](tests/VERIFIED-CONFIGS.md) for full details.

## Ports

| Port | Service |
|------|---------|
| 8000/http | LLM API (OpenAI-compatible) |
| 8080/http | Media proxy + web UI |
| 18789/http | OpenClaw control UI + chat |
| 22/tcp | SSH |

Audio (8001) and Image (8002) are internal only.

## Access the UI

- **Control UI**: `https://<pod-id>-18789.proxy.runpod.net/?token=<OPENCLAW_WEB_PASSWORD>`
- **Media UI**: `https://<pod-id>-8080.proxy.runpod.net`

First time: approve device pairing when prompted (SSH into pod, run `openclaw devices list` then `openclaw devices approve <requestId>`).

## Architecture

```
OPENCLAW2GO_CONFIG (env var)
        |
        v
  resolve-profile.py  -->  detect GPU (nvidia-smi)
        |                   compute VRAM budget
        v                   auto-adjust context length
  entrypoint-unified.sh
        |
        +-- llama-server (LLM)         port 8000
        +-- llama-audio-server (Audio)  port 8001 (internal)
        +-- openclaw-image-server       port 8002 (internal)
        +-- openclaw-web-proxy          port 8080
        +-- openclaw gateway            port 18789
```

All engines are llama.cpp. LLM and Audio use separate builds with isolated shared libraries (incompatible `.so` files).

## Build

```bash
# Engines (llama.cpp binaries) — only needed when updating llama.cpp
docker build -f engines/Dockerfile -t openclaw2go-engines .

# Runtime image
docker build -f Dockerfile.unified -t openclaw2go .
```

## CLI tools (inside container)

```bash
openclaw2go models                    # List available models
openclaw2go fit                       # Show what fits on this GPU
openclaw2go presets                   # List preset profiles
openclaw2go registry status           # Registry source + cache info
openclaw-image-gen --prompt "A cat"   # Generate image
openclaw-tts "Hello world"            # Text to speech
openclaw-stt audio.wav                # Speech to text
```

## Resources

- [OpenClaw2Go](https://github.com/runpod-workers/openclaw2go) — this repo
- [OpenClaw2Go Registry](https://github.com/runpod-workers/openclaw2go-registry) — external model registry
- [OpenClaw](https://github.com/openclaw/openclaw) — the agent framework
- [Runpod](https://runpod.io) — GPU cloud
