# AGENTS.md

<!-- Do not edit or remove this section -->
This document exists for non-obvious, error-prone shortcomings in the codebase, the model, or the tooling that an agent cannot figure out by reading the code alone. No architecture overviews, file trees, build commands, or standard behavior. When you encounter something that belongs here, first consider whether a code change could eliminate it and suggest that to the user. Only document it here if it can't be reasonably fixed.

---

## Adding Models
- Use the `/add-model` skill. It covers the full workflow: creating GGUF + MLX configs, validation, testing on Runpod (LLM API, Hermes gateway, OpenClaw gateway, agent web UI), and recording VRAM/tok/s measurements.

## VRAM & KV Cache
- `vram.overhead` in model config must include compute graph buffers (~1.5-3GB for large models).

## Build Gotchas
- `GGML_NATIVE=OFF` is required — CI runner CPU differs from target GPUs.
- `CUDA_ARCHITECTURES` must include `100` for GB10/B200 (sm_100) and `120` for Blackwell (sm_120). CUDA 12.8+ required for sm_120; official llama.cpp Docker images ship CUDA 12.4 which lacks it.
- PyTorch cu128 required for RTX 5090 Blackwell sm_120, works on all other GPUs too.
- Diffusers installed from git — stable release lacks `Flux2KleinPipeline`.
- Engine compilation takes ~70min. Pre-built as `a2go-engines` image, only rebuild when `engines/` changes.
- ARM64 engine builds only compile sm_100 — skip unnecessary architectures to save build time.
- DGX Spark unified memory: nvidia-smi reports GPU-accessible portion (128GB for GB10), not full 141GB unified.

## Entrypoint Service Loop
- Agent-specific env vars (e.g. `OPENCLAW_WEB_PASSWORD`) are accepted as fallbacks for users migrating from those frameworks, but the canonical config is `A2GO_*` (e.g. `A2GO_AUTH_TOKEN`) — never remove the fallback bridge in the entrypoint, agents read their own vars from the environment.
- Variables from one iteration **leak** into the next — always re-extract `MODEL_FILES`, `FIRST_FILE`, etc. at the start of each role case.
- **Unified media server**: Python-venv `image)`, `tts)`, and `audio)` cases accumulate plugin configs into `MEDIA_PLUGINS_JSON` instead of starting separate processes. After the loop, one `a2go-media-server` process starts on port 8001 with all plugins. Native C++ cases (e.g., llama-liquid-audio-server) still start their own binaries — they're mutually exclusive with the media server on port 8001.
- When testing new model configs that aren't in the baked-in Docker image: the external registry (`/workspace/.openclaw/registry`) overrides baked-in registry. Inject configs there, not just `/opt/a2go/registry/`.

## Nemotron-3-Super
- Multi-file GGUF: Q2_K_XL = 3 splits, Q8_0 = 4 splits. The entrypoint passes only the first split to `-m`; llama.cpp auto-discovers the rest.

## Changesets
- Without a changeset file, merging to `main` will NOT produce a release — the workflow detects the existing version tag and skips.
- **Always create a changeset** by running `npx changeset` before creating a PR.

## CI/CD
- `workflow_dispatch` only works from default branch — feature branch workflows can't be manually triggered until merged to main.
- Fork CI tag convention: `{upstream-tag}-openclaw.{patch}`.
- **Testing workflow changes on a branch**: New/modified workflows won't trigger via `workflow_dispatch` or `pull_request` until they exist on main. To test on a feature branch: (1) add a temporary `push` trigger filtered to your branch (`push: branches: [your-branch]`), (2) if the workflow triggers other workflows via `gh workflow run ... -f`, use dry-run echo instead (the `-f` inputs won't exist on main yet), (3) rebase onto current main so `dev-build.yml` and other base-branch workflows are present, (4) push to trigger, (5) revert the temp triggers before merging.
