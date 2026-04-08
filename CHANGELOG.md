# openclaw2go

## 0.13.0

### Minor Changes

- 4aed6cd: fix: e2e test issues across all platforms

  - Replace internal model IDs with HuggingFace repos in all user-facing surfaces
  - Fix image gen crash on Mac (transformers 5.x local path validation)
  - Add image server health check during startup (hard failure if --image specified)
  - Fast-fail on unknown model names instead of 600s timeout
  - Skip Docker image pull when already present (fixes Windows SSH credential error)
  - Show audio/media services in Docker status output
  - Fix media server /health shadowed by plugin compat routes
  - Disable thinking mode for GLM-4.7-Flash and Qwen3.5 models (--reasoning-format none)
  - Fix Mac deploy tab using Docker model repos instead of MLX variants
  - Fix web proxy /health returning {} on Mac native mode
  - Update Windows install script to set PATH in current session

### Patch Changes

- 0b87720: feat(site): disable device buttons that can't fit selected model's vram

  Devices whose VRAM (× device count) is insufficient for the current
  config are now dimmed and non-clickable in the configurator.

- 4aed6cd: feat: add glm-5.1 754b iq1m 1-bit gguf model config

  Adds GLM-5.1-754B IQ1_M (1-bit, ~194GB) from unsloth/GLM-5.1-GGUF.
  MoE architecture with 40B active parameters. Supports tool calling
  and reasoning/thinking. Tested on 3x A100 SXM4 80GB at ~22 tok/s.

- 14a3940: feat: improve deploy howto with stop and help steps

  Added dedicated step 5 (stop) and step 6 (more commands) to the deploy
  instructions. Simplified info notes to plain text. MLX troubleshooting
  link now only shows on the mac tab.

## 0.12.8

### Patch Changes

- 258ab58: fix: doctor skill download 404 — paths updated to a2go- prefix

  Skills moved from config/workspace/skills/image-generate/ to
  config/workspace/skills/a2go-image-generate/ (and similar for
  text-to-speech, speech-to-text). Updated download paths, local
  directory names, and removed unused FileWithReplace — the new
  skills use `a2go tool` commands and no longer need path rewriting.

- 258ab58: feat: add native LFM2.5-Audio MLX server for macOS

  mlx-audio's get_model_category() doesn't support the STS category where
  LFM2.5 lives. This adds a dedicated server (mlx-lfm2-server) that imports
  directly from mlx_audio.sts.models.lfm_audio, with /health, TTS and STT
  endpoints. Auto-selected when the audio model contains "lfm2".

## 0.12.7

### Patch Changes

- 0e17277: feat: add native LFM2.5-Audio MLX server for macOS

  mlx-audio's get_model_category() doesn't support the STS category where
  LFM2.5 lives. This adds a dedicated server (mlx-lfm2-server) that imports
  directly from mlx_audio.sts.models.lfm_audio, with /health, TTS and STT
  endpoints. Auto-selected when the audio model contains "lfm2".

## 0.12.6

### Patch Changes

- b66e042: fix: mac audio proxy routing and missing mlx-audio dependencies

  - Web proxy now falls back to probing audio server directly when no metadata
    files exist (Mac native MLX path doesn't write /tmp/oc_audio_engine)
  - Doctor installs uvicorn, fastapi, python-multipart required by mlx-audio 0.4.2

## 0.12.5

### Patch Changes

- fee33c0: fix: mac audio proxy routing and missing mlx-audio dependencies

  - Web proxy now falls back to probing audio server directly when no metadata
    files exist (Mac native MLX path doesn't write /tmp/oc_audio_engine)
  - Doctor installs uvicorn, fastapi, python-multipart required by mlx-audio 0.4.2

- fee33c0: feat: switch LFM2.5-Audio plugin to native GGUF via llama-liquid-audio-server

  Replaces the PyTorch-based liquid_audio library (~4GB VRAM) with a native
  llama-liquid-audio-server subprocess that loads quantized GGUF files (~2GB VRAM).
  The plugin spawns the server internally and proxies TTS/STT requests through it,
  keeping the unified media server architecture intact.

## 0.12.4

### Patch Changes

- 71c4a23: feat: switch LFM2.5-Audio plugin to native GGUF via llama-liquid-audio-server

  Replaces the PyTorch-based liquid_audio library (~4GB VRAM) with a native
  llama-liquid-audio-server subprocess that loads quantized GGUF files (~2GB VRAM).
  The plugin spawns the server internally and proxies TTS/STT requests through it,
  keeping the unified media server architecture intact.

## 0.12.3

### Patch Changes

- 5eb4e83: fix: remove unsupported model types from registry

  Remove registry entries for model types (reranking, vision, embedding) that
  are not yet supported, eliminating the "SKIP: unknown type" warnings on startup.

- 3a984de: fix: strengthen skill descriptions to prevent external API usage

## 0.12.2

### Patch Changes

- 0a1cc70: fix: read llm port before starting media server

## 0.12.1

### Patch Changes

- 7c94692: fix: install go cli binary in docker image, rename python registry tool

## 0.12.0

### Minor Changes

- 368a723: feat: LFM2.5-Audio unified media server plugin using liquid-audio

  Replaces the broken native llama-liquid-audio-server approach with a Python-based
  media plugin using LiquidAI's `liquid-audio` library. Both TTS and STT work through
  the unified media server on port 8001.

### Patch Changes

- 16f8f39: fix: avoid GitHub API rate limit in install scripts and self-update

## 0.11.0

### Minor Changes

- 40d9d5c: feat: add Gemma 4 model family (31B, 26B-A4B, E4B, E2B) with GGUF and MLX configs
- 07cd1a4: unified media server with plugin architecture, a2go env var rename

### Patch Changes

- 89c0380: Fix layout shift caused by scrollbar appearing/disappearing in the config panel when selecting models.

## 0.10.0

### Minor Changes

- 0f460af: feat: show parameter size on image and audio model cards

  - Display parameter count (e.g., 4B, 1.5B) as a pill in the specs table for image and audio models
  - Strip size from display name so card titles read cleanly (e.g., "FLUX.2 Klein" instead of "FLUX.2 Klein 4B")
  - Group Qwen3-TTS 0.6B and 1.7B into one family entry with switchable size pills, matching LLM behavior

## 0.9.0

### Minor Changes

- e11e93b: feat: group same-family models into one card with size selector, add user-controlled device count

  - Collapse models of the same family (e.g., Qwen 3.5) into a single catalog row with SIZE pill selector in the detail panel
  - Replace auto-scaling GPU count (1–8) with a user-controlled device count stepper in the Hardware section header
  - Rename URL params: `gpu` → `device`, add `deviceCount` for shareable configuration links
  - Add TB formatting for VRAM values ≥ 1000 GB
  - Unify SectionHeader component to consistently center inline controls (stepper, reset, copy link)

## 0.8.0

### Minor Changes

- dcb9efd: feat: add Qwen3.5 Claude 4.6 Opus Reasoning Distilled v2 models (4B, 9B, 27B) with GGUF and MLX variants

### Patch Changes

- 4f0d6a2: Prune AGENTS.md to only sharp edges and gotchas, removing everything inferable from the codebase

## 0.7.0

### Minor Changes

- 347e713: feat: unified dev build pipeline with CLI pre-releases on PR branches

## 0.6.2

### Patch Changes

- 6214173: fix: port conflict detection for hermes gateway and audio pre-flight

## 0.6.1

### Patch Changes

- df5fe3d: chore: test synchronized release pipeline

## 0.6.0

### Minor Changes

- 7bb4455: feat: add `--agent` flag with Hermes support and unified `a2go tool` subcommands

  Add required `--agent` CLI flag (`openclaw` or `hermes`) to select agent framework. Integrates Hermes Agent (NousResearch) as a second option alongside OpenClaw with full tool calling, skills (SKILL.md), terminal exec, and memory support.

  Replace 3 separate Python scripts (openclaw-image-gen, openclaw-tts, openclaw-stt) with `a2go tool` subcommands (image-generate, text-to-speech, speech-to-text) that go through the unified web proxy on port 8080. Move skills to config/workspace/skills/ and update Docker path to /opt/a2go/skills.

## 0.5.0

### Minor Changes

- 6a077a0: Add unified web proxy to MLX backend, matching Docker's single-API-on-port-8080 architecture. Strip `:quant` suffix from model references for MLX. Rename `openclaw-web-proxy` to `web-proxy`. Remove legacy per-model `models/` directory.

## 0.4.0

### Minor Changes

- e984389: Rename `a2go start` CLI subcommand to `a2go run` to match the product domain (a2go.run)

## 0.3.1

### Patch Changes

- 54c08c3: fix: use correct GitHub org (runpod-labs) in install scripts, CLI self-update, download URLs, and site links

## 0.3.0

### Minor Changes

- 292aca6: Docker images tagged latest + version are now only built on releases, PRs get branch-based tags for testing

## 0.2.1

### Patch Changes

- 6508c10: Fix CLI build by unignoring the a2go/internal/venv Go package from .gitignore

## 0.2.0

### Minor Changes

- 1281be0: Always-on web proxy with redesigned adaptive UI, CI migration to Blacksmith runners, path filters for unified image builds, favicon and title update to a2go, TypeScript build fixes, and CORS restriction to RunPod proxy URL with branch-based Docker tags
- 1281be0: VRAM-aware auto-detection for model selection: when A2GO_CONFIG is empty, resolve-profile.py now picks the best LLM that fits the detected GPU VRAM instead of always defaulting to GLM-4.7 Flash. Adds autoTier field to 7 models spanning 8GB to 96GB+ GPUs, with Qwen3.5 models covering 8-48GB and Nemotron-3-Super for 56GB+.

## 0.1.0

### Minor Changes

- 3a3c6e5: Initial public release of OpenClaw2Go — self-contained Docker images with LLM + media services for GPU pods.

  - Unified Docker image supporting A100/H100/B200/RTX 5090
  - Model registry with community-contributed configs
  - Web configurator for VRAM-first GPU pod setup
  - Dual llama.cpp engines (openclaw2go-llamacpp + ik-llamacpp)
  - Support for LLM, Audio (TTS/STT), Image Gen, Vision, Embeddings, Reranking
  - External registry with automatic fetch and 1-hour TTL cache
  - Contributing guide and GitHub issue templates
