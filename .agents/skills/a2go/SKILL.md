---
name: a2go
description: Deploy and manage a2go — self-hosted LLM + media services with OpenClaw agents.
metadata:
  author: runpod
---

# a2go

Deploy LLM + image/audio services on any NVIDIA GPU (or Apple Silicon).

## Install

```bash
# Linux / macOS
curl -sSL https://a2go.run/install.sh | bash

# Windows (PowerShell)
irm https://a2go.run/install.ps1 | iex
```

## Quick start

```bash
a2go doctor                                              # One-time setup (checks Docker, GPU, pulls image)
a2go run --llm bartowski/Qwen3-30B-A3B-GGUF:4bit        # Run with a model
a2go status                                              # Check running services
a2go stop                                                # Stop all
```

## Commands

```bash
a2go run --llm <repo>:<bits>bit [--image <repo>] [--audio <repo>] [--context <tokens>]
a2go doctor                                              # Prereq check + image pull
a2go status                                              # Service health
a2go stop                                                # Stop containers
a2go logs                                                # Tail container logs
```

## Cloud / Docker (no CLI needed)

```bash
docker run -d --gpus all --name a2go \
  -e A2GO_CONFIG='{"llm":"<repo>:<bits>bit"}' \
  -p 8000:8000 -p 8080:8080 -p 18789:18789 \
  -v /workspace:/workspace \
  runpod/a2go:latest
```

## Ports

- **18789** — OpenClaw (required)
- **8080** — Image serving (required for generated images)
- **8000** — LLM API (optional — direct model access + llama.cpp chat UI)

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
