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
a2go run --agent <agent> --llm <repo>:<bits>bit [--image <repo>] [--audio <repo>:<bits>bit] [--engine <engine>]
a2go doctor                                              # Prereq check + image pull
a2go status                                              # Service health
a2go stop                                                # Stop containers
```

Agents: `hermes` (recommended) or `openclaw`.

## Engines

- **llama.cpp** — NVIDIA GPU (CUDA). Default on Linux/Windows. Uses GGUF models.
- **MLX** — Apple Silicon. Default on Mac. Uses MLX models.
- **wandler** — ONNX runtime. Works on all platforms (CUDA on Linux, CPU fallback). Uses ONNX models. Pass `--engine wandler` to use it.

The engine is auto-detected from the model when possible. Use `--engine` to override (e.g. `--engine wandler` for ONNX models).

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
a2go models --engine wandler               # Wandler/ONNX models only
a2go models --os mac                       # Mac/MLX models only
a2go models --max-vram 24                  # Fits in 24GB GPU
a2go models --type llm --engine wandler    # Wandler LLMs only
```

Output: `type | engine | os | vram | context | repo:bits | name` — use `repo:bits` as the `--llm`/`--image`/`--audio` value.

## Docker

Image `runpod/a2go:latest`, configured via `A2GO_CONFIG` env var (JSON):

```json
{"agent":"openclaw", "engine":"wandler", "llm":"onnx-community/gemma-4-E4B-it-ONNX:4bit"}
```

Fields: `agent` (required), `engine`, `llm`, `audio`, `image`, `contextLength`. Also set `A2GO_AUTH_TOKEN` and `A2GO_API_KEY`.

## Notes

- **Mac/Apple Silicon:** `a2go run` runs natively via MLX (no Docker). Wandler models also work on Mac.
- **Browse models visually:** https://a2go.run
