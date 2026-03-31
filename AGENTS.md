# AGENTS.md

<!-- Do not edit or remove this section -->
This document exists for non-obvious, error-prone shortcomings in the codebase, the model, or the tooling that an agent cannot figure out by reading the code alone. No architecture overviews, file trees, build commands, or standard behavior. When you encounter something that belongs here, first consider whether a code change could eliminate it and suggest that to the user. Only document it here if it can't be reasonably fixed.

---

## VRAM & KV Cache
- **MLX KV rate = GGUF rate × 1.88** (rounded). MLX uses fp16 KV cache (no quantization), measured at ~1.88x the llama.cpp q8_0 rate. Always set MLX configs separately — do NOT copy the GGUF value.
- `vram.overhead` in model config must include compute graph buffers (~1.5-3GB for large models).
- Minimum 16k context — OpenClaw requires at least 16k tokens. All model configs MUST set `defaults.contextLength` >= 16384.

## Qwen3.5 Override-KV Keys
- MoE variants (35B-A3B, 122B-A10B, 397B-A17B): `qwen35moe.context_length`
- Dense 27B: `qwen35.context_length` (NOT qwen35moe!)

## Build Gotchas
- `GGML_NATIVE=OFF` is required — CI runner CPU differs from target GPUs.
- `CUDA_ARCHITECTURES` must include `100` for GB10/B200 (sm_100) and `120` for Blackwell (sm_120). CUDA 12.8+ required for sm_120; official llama.cpp Docker images ship CUDA 12.4 which lacks it.
- PyTorch cu128 required for RTX 5090 Blackwell sm_120, works on all other GPUs too.
- Diffusers installed from git — stable release lacks `Flux2KleinPipeline`.
- Engine compilation takes ~70min. Pre-built as `a2go-engines` image, only rebuild when `engines/` changes.
- ARM64 engine builds only compile sm_100 — skip unnecessary architectures to save build time.
- DGX Spark unified memory: nvidia-smi reports GPU-accessible portion (128GB for GB10), not full 141GB unified.

## Entrypoint Service Loop
- Variables from one iteration **leak** into the next — always re-extract `MODEL_FILES`, `FIRST_FILE`, etc. at the start of each role case.
- The `audio)` role case must check `ENGINE_TYPE` to distinguish native llama.cpp audio (LFM2.5) from Python-based audio (Qwen3-TTS). Same pattern as the `tts)` case.
- When testing new model configs that aren't in the baked-in Docker image: the external registry (`/workspace/.openclaw/registry`) overrides baked-in registry. Inject configs there, not just `/opt/openclaw/registry/`.

## Nemotron-3-Super
- Multi-file GGUF: Q2_K_XL = 3 splits, Q8_0 = 4 splits. The entrypoint passes only the first split to `-m`; llama.cpp auto-discovers the rest.

## External Registry
- Engines and GPUs are **never externalized** — `engines.json` maps to physical binaries, `gpus/` is safety-critical.

## Changesets
- Without a changeset file, merging to `main` will NOT produce a release — the workflow detects the existing version tag and skips.
- **Always create a changeset** by running `npx changeset` before creating a PR.

## CI/CD
- `workflow_dispatch` only works from default branch — feature branch workflows can't be manually triggered until merged to main.
- Fork CI tag convention: `{upstream-tag}-openclaw.{patch}`.
