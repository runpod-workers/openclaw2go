---
name: a2go
description: Use open weight models (LLM, image, audio) with open source agents on Mac, Linux, and Windows.
metadata:
  author: runpod
---

# a2go

Use open weight models (LLM, image, audio) with open source agents on Mac, Linux, and Windows.

## Prerequisites

Requires the `a2go` CLI. Install from GitHub releases (includes SHA256 checksums for verification): https://github.com/runpod-labs/a2go/releases

## Quick start

```bash
a2go doctor                                              # One-time setup (checks Docker, GPU, pulls image)
a2go run --agent hermes --llm <repo>:<bits>bit          # Start with a model
a2go status                                              # Check running services
a2go stop                                                # Stop all
```

Pick a model value with `a2go models`; use the `repo:bits` value from the output.

## Commands

```bash
a2go run --agent <agent> --llm <repo>:<bits>bit [--image <repo>] [--audio <repo>:<bits>bit]
a2go doctor                                              # Prereq check + image pull
a2go status                                              # Service health
a2go stop                                                # Stop containers
```

Agents: `hermes` (recommended) or `openclaw`.

## Ports

- **8000** — LLM API (direct model access, use for testing chat completions)
- **8080** — Web proxy / media server (TTS, STT, image gen, web UI)
- **8642** — Hermes Gateway (agent orchestration, not for direct API calls)
- **18789** — OpenClaw Gateway (agent orchestration, not for direct API calls)

For direct LLM testing use port **8000** (`/v1/chat/completions`). For TTS/STT use port **8080** (`/v1/audio/speech`, `/v1/audio/transcriptions`). The gateway ports (8642/18789) are for platform integrations.

## Models

```bash
a2go models                                # All models
a2go models --type llm                     # LLMs only
a2go models --os mac                       # Mac/MLX models only
a2go models --max-vram 24                  # Fits in 24GB GPU
a2go models --type llm --os linux --max-vram 24  # Linux LLMs for 24GB
```

Output: `type | os | vram | context | repo:bits | name` — use `repo:bits` as the `--llm`/`--image`/`--audio` value. VRAM = minimum GPU memory needed.

## Notes

- **Mac/Apple Silicon:** `a2go run` runs natively via MLX (no Docker). Only MLX-compatible models work.
- **Browse models visually:** https://a2go.run
