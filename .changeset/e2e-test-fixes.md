---
"a2go": minor
---

fix: e2e test issues across all platforms

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
