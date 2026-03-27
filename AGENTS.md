# AGENTS.md

agent2go: self-contained Docker images with LLM + media services for GPU pods on RunPod.

This is a living document. When you encounter a non-obvious gotcha, error-prone pattern, or tricky decision while working in this codebase, add it here. Don't add anything an agent can figure out by reading the code.

## Non-Obvious Rules

### Model Type Taxonomy
The site/configurator uses 3 global categories: `llm`, `image`, `audio`. Individual models in the registry may have more specific `type` values (`vision`, `embedding`, `reranking`, `tts`) — these are model-level tags, not separate UI categories. Vision models appear under LLM, TTS under Audio, embedding/reranking are auxiliary services without their own UI category.

### llama.cpp Engine
- `a2go-llamacpp`: unified fork with cherry-picked unmerged PRs (audio, Eagle-3, Nemotron-3-Super)

### VRAM & KV Cache
- Each LLM model declares `kvCacheMbPer1kTokens` in its JSON config. Fallback: 40 MB/1k if not specified.
- `kvCacheMbPer1kTokens` values already account for q8_0 KV quantization (all models use `-ctk q8_0 -ctv q8_0`).
- **MLX KV rate = GGUF rate × 1.88** (rounded). MLX uses fp16 KV cache (no quantization), measured at ~1.88x the llama.cpp q8_0 rate. Always set MLX configs separately — do NOT copy the GGUF value.
- Minimum 16k context — OpenClaw requires at least 16k tokens. All model configs MUST set `defaults.contextLength` >= 16384.
- `vram.overhead` in model config must include compute graph buffers (~1.5-3GB for large models).
- `resolve-profile.py` auto-computes max context: `(availableVRAM - model - overhead) / kvRate`.
- Use `nvidia-smi` for actual VRAM, not registry values (can differ significantly).

### Qwen3.5 Override-KV Keys
- MoE variants (35B-A3B, 122B-A10B, 397B-A17B): `qwen35moe.context_length`
- Dense 27B: `qwen35.context_length` (NOT qwen35moe!)

### External Registry
- Optional — if fetch fails, baked-in `registry/` is used as fallback. Never blocks startup.
- Engines and GPUs are **never externalized** — `engines.json` maps to physical binaries, `gpus/` is safety-critical.
- `downloadDir` must start with `/workspace/models/` (security restriction).
- `OPENCLAW_REGISTRY_OFFLINE=true` skips fetch entirely (air-gapped environments).

### Build Gotchas
- `GGML_NATIVE=OFF` is required — CI runner CPU differs from target GPUs.
- `CUDA_ARCHITECTURES` must include `100` for GB10/B200 (sm_100). Currently: `80;89;90;100;120`.
- CUDA 12.8+ required for Blackwell (sm_120). Official llama.cpp Docker images ship CUDA 12.4 which lacks sm_120.
- PyTorch cu128 required for RTX 5090 Blackwell sm_120, works on all other GPUs too.
- Diffusers installed from git — stable release lacks `Flux2KleinPipeline`.
- Engine compilation takes ~70min. Pre-built as `a2go-engines` image, only rebuild when `engines/` changes.
- ARM64 engine builds only compile sm_100 — skip unnecessary architectures to save build time.
- DGX Spark unified memory: nvidia-smi reports GPU-accessible portion (128GB for GB10).

### Entrypoint Service Loop
- The service loop in `entrypoint-unified.sh` iterates over resolved services (llm, audio, image, etc.). Variables from one iteration **leak** into the next — always re-extract `MODEL_FILES`, `FIRST_FILE`, etc. at the start of each role case.
- The `audio)` role case must check `ENGINE_TYPE` to distinguish native llama.cpp audio (LFM2.5) from Python-based audio (Qwen3-TTS). Same pattern as the `tts)` case.
- When testing new model configs that aren't in the baked-in Docker image: the external registry (`/workspace/.openclaw/registry`) overrides baked-in registry. Inject configs there, not just `/opt/openclaw/registry/`.

### Nemotron-3-Super
- Architecture: `nemotron_h_moe` (Mamba-2 + Transformer hybrid with LatentMoE). Requires cherry-picked llama.cpp support.
- Multi-file GGUF: Q2_K_XL = 3 splits, Q8_0 = 4 splits. The entrypoint passes only the first split to `-m`; llama.cpp auto-discovers the rest.
- MLX support via `sjug/Nemotron-3-Super-120B-A12B-MLX-4bit` (community quantization, experimental).

### Shell Script Gotchas
- Never use `echo | while read` for background processes — pipe creates a subshell, PIDs from `&` aren't children of the main shell, `wait $PID` fails. Use `while read < file` instead.

### Operational Gotchas
- Control UI requires device pairing: `OPENCLAW_GATEWAY_TOKEN=<token> openclaw devices list` then `openclaw devices approve <request-id>`.
- Image previews need public proxy URL (port 8080). RunPod may 403 non-browser requests.
- External image skills are disabled in `/workspace/.openclaw/openclaw.json` (entrypoint handles this automatically).

### Ports
Exposed on RunPod: 8000 (LLM), 8080 (web proxy), 18789 (OpenClaw gateway), 22 (SSH).
Internal only: 8001 (audio), 8002 (image), 8003 (vision), 8004 (embedding), 8005 (reranking), 8006 (TTS).

### CI/CD
- `workflow_dispatch` only works from default branch — feature branch workflows can't be manually triggered until merged to main.
- Fork CI auto-rebases cherry-picks onto new llama.cpp releases. Tag convention: `{upstream-tag}-openclaw.{patch}`.
- Engine and unified images built per-architecture (amd64/arm64) with multi-arch manifests. Tags: `image:tag-amd64`, `image:tag-arm64`, `image:tag` (manifest).
- ARM64 builds run on `blacksmith-4vcpu-ubuntu-2404-arm`. amd64 builds run on `blacksmith-4vcpu-ubuntu-2404`. All CI runs on Blacksmith runners.
- Docker images from `main` tag as `latest`. Feature branches get their own tag (branch name sanitized: slashes/underscores → hyphens, lowercased). E.g. `feat/update-template` → `a2go:feat-update-template`. Use branch tags to test on RunPod before merging.

### Catalog Grouping — `catalogKey`
Every model JSON has a `catalogKey` field that determines which catalog row the model appears in. Models with the same `catalogKey` are grouped into a single `CatalogEntry`. Sub-variants (e.g., GLM 4.7 Flash vs Claude Distill) are detected automatically by comparing group keys within the same catalogKey. When adding a new model:
- Set `catalogKey` to match an existing entry if it's a new quant/platform variant of an existing model
- Create a new `catalogKey` if it's a genuinely different model (e.g., `nemotron3-nano` vs `nemotron3-super`)
- The `catalogKey` is typically the same as `family`, except when one family contains models that should be separate catalog rows (different architectures/sizes)
- Quant and sub-variant selection happens in the selected model card, not the catalog list

### Site: OS Tab State in Selected Models
The selected model cards share a synchronized OS tab state (`sharedOs` in `ConfigPanel.tsx`). Platform tabs on the cards are **card-local** — they never change the global OS filter.
- Clicking a platform tab on a card swaps the displayed model variant (via `swapModelVariant`) and updates the shared tab state for VRAM gauge consistency.
- The global OS filter (Linux/Windows/macOS buttons at the top) is only changed by clicking those buttons directly.
- **Unavailable models look identical in the catalog**: when the global OS is set to Mac, models without MLX variants (e.g. Nemotron Super) appear with the same style and are fully clickable. When selected, the model card's macOS tab shows "no macOS variant available" and offers sibling alternatives from the same family.
- **Unified platform tabs**: `FilledSlotCard` uses a single `platformTabs` array for all OS tabs (both available and unavailable). There is no separate "synthetic" tab — unavailable OS tabs are entries in the same array with `available: false`. This prevents layout shifts and duplicated rendering logic.
- When a global OS filter is active, platform tabs in the cards are filtered to only show that OS. When no global OS filter is set, all available platform tabs are shown.

### Testing New Models on RunPod
When adding a new model, it MUST be tested on actual RunPod GPU pods before merging. Follow this checklist:

1. **Always test with the model's full default context length** — never use a reduced context. If the model config says `contextLength: 131072`, test with exactly that. If it OOMs on a specific GPU, that's a real finding to document.
2. **Test on every supported GPU where the model fits** — at minimum RTX 4090, RTX 5090, and RTX 3090 (all 3 are in the registry). If a GPU is unavailable, document it and retry later.
3. **Test through OpenClaw, not just raw llama-server** — inject the model config into `/opt/openclaw/registry/models/` AND `/workspace/.openclaw/registry/models/`, then let the entrypoint handle startup. Verify the full flow: profile resolution → model download → server start → OpenClaw gateway.
4. **Test all capabilities**:
   - Basic chat completion (simple factual question)
   - Tool/function calling (define a tool, verify the model calls it correctly with `finish_reason: "tool_calls"`)
   - Reasoning/thinking mode (verify `reasoning_content` is populated if the model supports it)
   - OpenClaw device pairing: `OPENCLAW_GATEWAY_TOKEN=<token> openclaw devices list` then approve
5. **Record actual VRAM usage** from `nvidia-smi` for each GPU tested. Update `vram.model` in the config to match reality.
6. **Record generation speed** (tok/s) from the API response `timings.predicted_per_second`. Add to the `tps` field in the model config.
7. **Verify `kvCacheMbPer1kTokens`** — calculate from actual VRAM: `(vram_with_context - vram_model_only) / (context_tokens / 1000)`. This value is used by the site to show users how much context fits on their GPU.

### Updating the a2go-llamacpp Fork
The fork at `runpod-labs/a2go-llamacpp` carries cherry-picked PRs on top of upstream llama.cpp releases. Current cherry-picks (as of b8475):
- **PR #18641** — LFM2.5 audio (TTS/STT for LFM2.5-Audio-1.5B)
- **PR #18039** — Eagle-3 speculative decoding

To update to a new upstream release:
```bash
# 1. Trigger the rebase workflow on the fork
gh workflow run rebase-on-release.yml \
  --repo runpod-labs/a2go-llamacpp \
  -f upstream_tag=<new-tag>

# 2. If conflicts, resolve manually (clone fork, merge PR branches, fix conflicts, push)

# 3. Trigger the engines build (~70 min for amd64+arm64)
gh workflow run "Build Engines Base Image" \
  --repo runpod-labs/a2go \
  -f llamacpp_openclaw_tag=<new-tag>-openclaw.1

# 4. Trigger the unified image build (~10 min)
gh workflow run "Build and Push Docker Images" \
  --repo runpod-labs/a2go
```

When a cherry-picked PR gets merged upstream, remove it from the rebase workflow's merge steps. When adding a new cherry-pick, add it to both the workflow and the `engines/Dockerfile` comment.

## Where to Make Changes

| Task | Location |
|------|----------|
| Add new model | Create JSON in `registry/models/`, run `cd site && npm run validate` |
| Add new GPU | Create JSON in `registry/gpus/` |
| Change startup logic | `scripts/entrypoint-unified.sh` |
| Modify config resolution | `scripts/resolve-profile.py` |
| Update CI/CD | `.github/workflows/docker-build.yml` |
| Update engine fork | `runpod-labs/a2go-llamacpp` repo |
