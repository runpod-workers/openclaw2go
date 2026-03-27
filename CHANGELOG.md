# openclaw2go

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
