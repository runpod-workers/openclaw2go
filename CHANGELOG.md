# openclaw2go

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
