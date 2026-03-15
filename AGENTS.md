# AGENTS.md

OpenClaw2Go: self-contained Docker images with LLM + media services for GPU pods on RunPod.

This is a living document. When you encounter a non-obvious gotcha, error-prone pattern, or tricky decision while working in this codebase, add it here. Don't add anything an agent can figure out by reading the code.

## Non-Obvious Rules

### Model Type Taxonomy
The site/configurator uses 3 global categories: `llm`, `image`, `audio`. Individual models in the registry may have more specific `type` values (`vision`, `embedding`, `reranking`, `tts`) — these are model-level tags, not separate UI categories. Vision models appear under LLM, TTS under Audio, embedding/reranking are auxiliary services without their own UI category.

### llama.cpp Engine
- `openclaw2go-llamacpp`: unified fork with cherry-picked unmerged PRs (audio, Eagle-3, Nemotron-3-Super)

### VRAM & KV Cache
- Each LLM model declares `kvCacheMbPer1kTokens` in its JSON config. Fallback: 40 MB/1k if not specified.
- `kvCacheMbPer1kTokens` values already account for q8_0 KV quantization (all models use `-ctk q8_0 -ctv q8_0`).
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
- Engine compilation takes ~70min. Pre-built as `openclaw2go-engines` image, only rebuild when `engines/` changes.
- ARM64 engine builds only compile sm_100 — skip unnecessary architectures to save build time.
- DGX Spark unified memory: nvidia-smi reports GPU-accessible portion (128GB for GB10).

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
- ARM64 builds run on `ubuntu-24.04-arm` GitHub runners. amd64 builds run on `DO` (DigitalOcean).
- Docker images always tag as `latest` — no version branching. We ship from feature branches directly to production.

### Site: OS Tab State in Selected Models
The selected model cards share a synchronized OS tab state (`sharedOs` in `SelectedModels.tsx`). This is **separate** from the global OS selector:
- **Global OS** (`os` prop from `ConfigPanel`) **filters** which variant tabs are visible (e.g. Mac selected → only Mac tabs shown).
- **Shared tab state** (`sharedOs`) syncs which tab is **active** across all cards when a user clicks a tab — it does NOT change the global OS.
- `FilledSlotCard` must NOT have its own local tab state — the active tab index and `onTabSelect` callback are passed in as props. If you add local `useState` for the active tab, cross-card sync will break silently.

## Where to Make Changes

| Task | Location |
|------|----------|
| Add new model | Create JSON in `registry/models/`, run `cd site && npm run validate` |
| Add new GPU | Create JSON in `registry/gpus/` |
| Change startup logic | `scripts/entrypoint-unified.sh` |
| Modify config resolution | `scripts/resolve-profile.py` |
| Update CI/CD | `.github/workflows/docker-build.yml` |
| Update engine fork | `runpod-workers/openclaw2go-llamacpp` repo |
