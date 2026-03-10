# OpenClaw2Go

A self-contained AI assistant stack for GPU pods. One Docker image, any GPU — configure at runtime what you need.

**Image**: `runpod/openclaw2go:latest` (~7 GB compressed)

## Quick start

1. **Pick models** at [openclaw2go.io](https://openclaw2go.io) — select your GPU and the site shows what fits
2. **Deploy** — the site generates a ready-to-use command (Docker or MLX)
3. **Access the UI** — `http://localhost:18789/?token=<OPENCLAW_WEB_PASSWORD>`

On Runpod the URL is `https://<pod-id>-18789.proxy.runpod.net/?token=<OPENCLAW_WEB_PASSWORD>`.

First time: approve device pairing when prompted (SSH into the machine, run `openclaw devices list` then `openclaw devices approve <requestId>`).

### Docker (Linux / Windows / Runpod)

The site generates this — or run it directly:

```bash
docker run --gpus all \
  -e OPENCLAW2GO_CONFIG='{"llm":"unsloth/glm47-flash-gguf","audio":"liquidai/lfm25-audio"}' \
  -e OPENCLAW_WEB_PASSWORD=changeme \
  -e LLAMA_API_KEY=changeme \
  -p 8000:8000 -p 8080:8080 -p 18789:18789 \
  -v openclaw2go-models:/workspace \
  runpod/openclaw2go:latest
```

Models download on first start and persist on the volume. Use `OPENCLAW2GO_CONFIG='{}'` to auto-detect your GPU and pick defaults that fit.

### MLX (macOS / Apple Silicon)

Select macOS on [openclaw2go.io](https://openclaw2go.io) and the site generates MLX commands for your selected models. The flow:

```bash
# 1. Setup
python3 -m venv ~/.openclaw2go/venv
source ~/.openclaw2go/venv/bin/activate

# 2. Install engines (depends on your model selection)
pip install mlx-lm        # for LLM models
pip install mlx-audio      # for audio models

# 3. Start servers (each in a separate terminal)
python -m mlx_lm.server --model <repo> --host 0.0.0.0 --port 8000
python -m mlx_audio.server --host 0.0.0.0 --port 8001
```

For the agent framework (OpenClaw gateway + UI), see the [OpenClaw install docs](https://github.com/openclaw/openclaw).

MLX models are experimental — not all models have MLX variants. The site will tell you which ones do.

## Configuration

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW2GO_CONFIG` | JSON config — models to load (see above) | `{}` |
| `OPENCLAW_WEB_PASSWORD` | Web UI auth token | `changeme` |
| `LLAMA_API_KEY` | LLM API key (OpenAI-compatible endpoint) | `changeme` |
| `TELEGRAM_BOT_TOKEN` | Enable Telegram bot integration | — |
| `GITHUB_TOKEN` | GitHub auth for Claude Code | — |

Model names are case-insensitive. Use HuggingFace repo names or short IDs.

## Customize agent behavior

`/workspace/` is persistent storage that survives pod restarts. All models and config live here.

| Path | Purpose |
|------|---------|
| `/workspace/.openclaw/openclaw.json` | Main config — auto-generated on first boot, editable |
| `/workspace/openclaw/IDENTITY.md` | Agent identity — create your own to customize personality |
| `/workspace/openclaw/AGENTS.md` | Agent instructions & skills — create your own to add capabilities |

The entrypoint only generates `openclaw.json` if it doesn't exist, so your edits are safe across restarts.

## Ports

| Port | Service |
|------|---------|
| 8000/http | LLM API (OpenAI-compatible) |
| 8080/http | Media proxy + web UI |
| 18789/http | OpenClaw control UI + chat |
| 22/tcp | SSH |

Audio (8001) and Image (8002) are internal only.

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

- [openclaw2go.io](https://openclaw2go.io) — model configurator
- [OpenClaw2Go](https://github.com/runpod-workers/openclaw2go) — this repo
- [OpenClaw2Go Registry](https://github.com/runpod-workers/openclaw2go-registry) — external model registry
- [OpenClaw](https://github.com/openclaw/openclaw) — the agent framework
- [Runpod](https://runpod.io) — GPU cloud
- [Contributing models](docs/contributing-models.md)
