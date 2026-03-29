# agent2go

a2go helps you run open-source AI models on your own hardware — locally, on a cloud GPU, or on a Mac.

- there are dozens of open-source models (LLMs, image gen, audio/TTS) in different quantizations, and figuring out which ones actually fit your GPU, how much VRAM they really need, and what performance you'll get is a pain — the info is scattered across huggingface cards, reddit, github issues, and trial-and-error
- a2go bundles all of that into a web configurator where you pick your GPU and it shows you exactly what fits, with real VRAM breakdowns (weights + kv cache + overhead — not just the file size), tokens-per-second benchmarks measured on actual hardware, and a live memory gauge that updates as you combine models
- every model in the registry has been tested on real GPUs — the numbers aren't theoretical, they account for things model cards never mention like compute graph buffers and runtime overhead
- when you're done picking, it generates a copy-paste deploy command — docker for linux/windows/runpod, mlx commands for mac — no config files to write, no flags to guess
- it supports multi-model setups (run an LLM + image gen + audio on the same GPU and see if it all fits), multi-gpu splitting, platform-aware variants (gguf for nvidia, mlx for apple silicon), and context length sliders that show you the real memory cost
- the whole point is: we already tested all of this so you don't have to — stop downloading models that don't fit, stop guessing at flags, just pick and deploy

**Image**: `runpod/a2go:latest` (~7 GB compressed)

## Quick start

1. **Pick models** at [a2go.run](https://a2go.run) — select your GPU and the site shows what fits
2. **Read the security guide** — OpenClaw agents can execute shell commands, read/write files, and fetch URLs on your machine. Understand what you're running: [Security Guide](https://trust.openclaw.ai)
3. **Deploy** — the site generates a ready-to-use command (Docker or MLX)
4. **Access the UI** — `http://localhost:18789/?token=<OPENCLAW_WEB_PASSWORD>`

On Runpod the URL is `https://<pod-id>-18789.proxy.runpod.net/?token=<OPENCLAW_WEB_PASSWORD>`.

First time: approve device pairing when prompted (SSH into the machine, run `openclaw devices list` then `openclaw devices approve <requestId>`).

## Docker (Linux / Windows / Runpod)

The site generates this — or run it directly:

```bash
docker run --gpus all \
  -e A2GO_CONFIG='{"llm":"unsloth/glm47-flash-gguf","audio":"liquidai/lfm25-audio"}' \
  -e OPENCLAW_WEB_PASSWORD=changeme \
  -e LLAMA_API_KEY=changeme \
  -p 8000:8000 -p 8080:8080 -p 18789:18789 \
  -v a2go-models:/workspace \
  runpod/a2go:latest
```

Models download on first start and persist on the volume.

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `A2GO_CONFIG` | JSON config — models to load | `{}` (auto-detect) |
| `OPENCLAW_WEB_PASSWORD` | Web UI auth token | `changeme` |
| `LLAMA_API_KEY` | LLM API key (OpenAI-compatible endpoint) | `changeme` |
| `TELEGRAM_BOT_TOKEN` | Enable Telegram bot integration | — |
| `GITHUB_TOKEN` | GitHub auth for Claude Code | — |

Model names are case-insensitive. Use HuggingFace repo names or short IDs.

### Auto-detect

When `A2GO_CONFIG` is `{}` (the default), the container reads your GPU's VRAM via `nvidia-smi` and picks a default LLM that fits automatically. Useful when you just want something running without choosing.

### Ports

| Port | Service |
|------|---------|
| 8000/http | LLM API (OpenAI-compatible) |
| 8080/http | Media proxy + web UI |
| 18789/http | OpenClaw control UI + chat |
| 22/tcp | SSH |

Audio (8001) and Image (8002) are internal only.

### CLI tools

```bash
a2go models                    # List available models
a2go fit                       # Show what fits on this GPU
a2go presets                   # List preset profiles
a2go registry status           # Registry source + cache info
a2go tool image-generate --prompt "A cat"   # Generate image
a2go tool text-to-speech "Hello world"     # Text to speech
a2go tool speech-to-text audio.wav         # Speech to text
```

### Customize agent behavior

`/workspace/` is persistent storage that survives pod restarts. All models and config live here.

| Path | Purpose |
|------|---------|
| `/workspace/.openclaw/openclaw.json` | Main config — auto-generated on first boot, editable |
| `/workspace/openclaw/IDENTITY.md` | Agent identity — create your own to customize personality |
| `/workspace/openclaw/AGENTS.md` | Agent instructions & skills — create your own to add capabilities |

The entrypoint only generates `openclaw.json` if it doesn't exist, so your edits are safe across restarts.

## MLX (macOS / Apple Silicon)

On a Mac, you don't use Docker. Instead, you run model servers natively using Apple's [MLX](https://github.com/ml-explore/mlx) framework, which is optimized for Apple Silicon.

Select macOS on [a2go.run](https://a2go.run) and the site generates the exact commands for your selected models. Here's what the flow looks like:

```bash
# 1. Create a virtual environment
python3 -m venv ~/.a2go/venv
source ~/.a2go/venv/bin/activate

# 2. Install engines (the site tells you which ones you need)
pip install mlx-lm        # for LLM models
pip install mlx-audio      # for audio models

# 3. Start servers (each in a separate terminal)
python -m mlx_lm.server --model <repo> --host 0.0.0.0 --port 8000
python -m mlx_audio.server --host 0.0.0.0 --port 8001
```

This only starts the model servers. To connect OpenClaw, you need a config file that tells the agent framework where to find them. The site generates this for you — save it as `~/.openclaw/openclaw.json`.

For installing the agent framework itself (OpenClaw gateway + UI), see the [OpenClaw install docs](https://github.com/openclaw/openclaw).

Not all models have MLX variants — the site will tell you which ones do.

## Resources

- [a2go.run](https://a2go.run) — model configurator
- [Security Guide](https://trust.openclaw.ai) — trust model, access control, hardening
- [OpenClaw](https://github.com/openclaw/openclaw) — the agent framework
- [Runpod](https://runpod.io) — GPU cloud
- [Contributing models](docs/contributing-models.md)
