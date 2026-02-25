# AGENTS.md

OpenClaw2Go on Runpod: self-contained Docker images with LLM + media services for GPU pods.

## Architecture

### Unified Image (primary)

One Docker image works on all GPUs (A100/H100/B200/RTX 5090). Configuration at runtime via `OPENCLAW_CONFIG` env var.

**Core abstraction: models + GPU VRAM = what fits.** The system detects GPU VRAM, computes which models fit, and auto-adjusts context length. Users pick models, not infrastructure.

**Supported tasks**: LLM, Audio (TTS/STT), Image Gen, Vision, Embeddings, Reranking, Native TTS.

```
OPENCLAW_CONFIG examples:
  {"llm": true, "audio": true, "image": true}                                    — all default models
  {"llm": true, "audio": true}                                                    — LLM + audio only (more VRAM for context)
  {"llm": "unsloth/GLM-4.7-Flash-GGUF", "contextLength": 200000}                — specific model + context override
  {"llm": "unsloth/Nemotron-3-Nano-30B-A3B-GGUF"}                               — Nemotron-3-Nano (MoE, low KV cache)
  {"llm": "unsloth/Nemotron-3-Nano-30B-A3B-GGUF", "audio": true}                — Nemotron + audio
  {"llm": "unsloth/gpt-oss-20b-GGUF"}                                           — OpenAI GPT-OSS 20B (fits any GPU)
  {"llm": "unsloth/Qwen3-Coder-Next-GGUF"}                                      — Qwen3 Coder Next 80B MoE (L40/A100)
  {"llm": "ubergarm/Step-3.5-Flash-GGUF"}                                       — Step 3.5 Flash 197B MoE (A100, IQ2_KS)
  {"llm": "TeichAI/GLM-4.7-Flash-Claude-Opus-4.5-High-Reasoning-Distill-GGUF"} — GLM-4.7 Claude distill
  {"llm": "arcee-ai/Trinity-Mini-GGUF"}                                          — Arcee Trinity Mini 26B/3B MoE (Apache 2.0)
  {"llm": "unsloth/Olmo-3.1-32B-Think-GGUF"}                                    — OLMo 3.1 Think 32B (Allen AI, fully open)
  {"llm": "unsloth/GLM-4.7-GGUF"}                                                — GLM-4.7 full 355B/32B MoE (B200)
  {"llm": "unsloth/glm5-tq1-gguf"}                                               — GLM-5-754B TQ1_0 1-bit (B200, experimental)
  {"llm": "unsloth/glm5-iq2xxs-gguf"}                                             — GLM-5-754B IQ2_XXS 2-bit (2x H200, experimental)
  {"llm": "ubergarm/minimax-m25-iq4xs-gguf"}                                      — MiniMax M2.5 229B MoE IQ4_XS (B200, experimental)
  {"llm": "ubergarm/minimax-m25-iq2ks-gguf"}                                      — MiniMax M2.5 IQ2_KS 2-bit (A100/H100, ik_llama.cpp, experimental)
  {"llm": "ubergarm/minimax-m25-iq3ks-gguf"}                                      — MiniMax M2.5 smol-IQ3_KS 3-bit (B200, ik_llama.cpp, experimental)
  {"llm": "unsloth/kimi-k25-tq1-gguf"}                                             — Kimi K2.5 1T MoE TQ1_0 1-bit (B200 w/ offload, experimental)
  {"llm": "unsloth/kimi-k25-q2kxl-gguf"}                                           — Kimi K2.5 1T MoE Q2_K_XL 2-bit (2x H200 w/ offload, experimental)
  {"llm": "unsloth/Qwen3.5-397B-A17B-GGUF"}                                       — Qwen3.5 397B/17B MoE Q2_K_XL (B200, experimental)
  {"llm": "unsloth/Qwen3.5-122B-A10B-GGUF"}                                      — Qwen3.5 122B/10B MoE Q2_K_XL (A100/H100)
  {"llm": "unsloth/qwen35-122b-a10b-q4km-gguf"}                                  — Qwen3.5 122B/10B MoE Q4_K_M (B200)
  {"llm": "unsloth/Qwen3.5-35B-A3B-GGUF"}                                        — Qwen3.5 35B/3B MoE Q4_K_M (RTX 5090+)
  {"llm": "unsloth/Qwen3.5-27B-GGUF"}                                            — Qwen3.5 27B hybrid Q4_K_M (RTX 5090+)
  {"llm": "LiquidAI/LFM2-24B-A2B-GGUF"}                                         — LFM2 24B/2B MoE Q4_K_M (any GPU)
  {"vision": "unsloth/Qwen2.5-VL-7B-Instruct-GGUF"}                             — vision model as LLM (multimodal)
  {"llm": true, "vision": "unsloth/Qwen2.5-VL-7B-Instruct-GGUF"}              — LLM + standalone vision
  {"llm": true, "embedding": true}                                                — LLM + embeddings (Qwen3-Embedding-0.6B)
  {"llm": true, "reranking": true}                                                — LLM + reranking (Jina v3, experimental)
  {"llm": true, "tts": true}                                                      — LLM + TTS (Qwen3-TTS 0.6B, default)
  {"llm": true, "tts": "qwen/qwen3-tts-17b"}                                      — LLM + TTS (Qwen3-TTS 1.7B, higher quality)
  {"llm": true, "tts": "outeai/outetss-02-500m-gguf"}                             — LLM + TTS (OuteTTS 0.2, experimental)
  {"profile": "rtx5090-full-stack"}                                               — use a preset (optional shorthand)
  {}                                                                               — auto-detect GPU, use all defaults that fit
```

Model names are **case-insensitive**. You can use the HuggingFace repo name (e.g., `unsloth/GLM-4.7-Flash-GGUF`) or the short model ID (e.g., `unsloth/glm47-flash-gguf`). `true` = default model for that type.

### Registry (`registry/` + External)

JSON-based configuration registry. Models declare their VRAM cost; the system computes fit at runtime.

**Baked-in registry** (fallback, always available):
```
registry/
├── engines.json                    # Engine definitions (openclaw2go-llamacpp, ik-llamacpp, image-gen, qwen3-tts)
├── models/                         # Model specs (VRAM, repo, start args, KV cache rates)
│   ├── glm47-flash-gguf.json       # LLM: GLM-4.7-Flash Q4_K_M (default: true, kvCache: 40 MB/1k)
│   ├── nemotron3-nano-gguf.json    # LLM: Nemotron-3-Nano-30B MoE (kvCache: 4 MB/1k)
│   ├── arcee-trinity-mini-gguf.json # LLM: Arcee Trinity Mini 26B/3B MoE
│   ├── olmo31-think-32b-gguf.json  # LLM: OLMo 3.1 Think 32B dense
│   ├── lfm25-audio.json            # Audio: LFM2.5-Audio-1.5B (default: true)
│   ├── qwen35-397b-a17b-gguf.json  # LLM: Qwen3.5 397B/17B MoE Q2_K_XL (B200)
│   ├── qwen35-122b-a10b-gguf.json # LLM: Qwen3.5 122B/10B MoE Q2_K_XL (A100/H100)
│   ├── qwen35-122b-a10b-q4km-gguf.json # LLM: Qwen3.5 122B/10B MoE Q4_K_M (B200)
│   ├── qwen35-35b-a3b-gguf.json   # LLM: Qwen3.5 35B/3B MoE Q4_K_M (RTX 5090+)
│   ├── qwen35-27b-gguf.json       # LLM: Qwen3.5 27B hybrid Q4_K_M (RTX 5090+)
│   ├── lfm2-24b-a2b-gguf.json     # LLM: LFM2 24B/2B MoE Q4_K_M (any GPU)
│   ├── qwen25-vl-7b-gguf.json     # Vision: Qwen2.5-VL-7B + mmproj (default: true)
│   ├── qwen3-embedding-06b-gguf.json # Embedding: Qwen3-Embedding-0.6B (default: true)
│   ├── jina-reranker-v3-gguf.json  # Reranking: Jina Reranker v3 (default: true, experimental)
│   ├── outetss-02-500m-gguf.json   # TTS: OuteTTS 0.2-500M (experimental, native llama-tts)
│   ├── qwen3-tts-06b.json          # TTS: Qwen3-TTS 0.6B Base (default: true, PyTorch)
│   ├── qwen3-tts-17b.json          # TTS: Qwen3-TTS 1.7B Base (higher quality, PyTorch)
│   └── flux2-klein-sdnq.json       # Image: FLUX.2 Klein 4B SDNQ (default: true)
├── gpus/                           # GPU specs (VRAM, arch, CUDA requirements)
│   ├── rtx-5090.json               # 32GB, SM120, Blackwell
│   ├── a100-80gb.json              # 80GB, SM80, Ampere
│   ├── h100-80gb.json              # 80GB, SM90, Hopper
│   └── b200-180gb.json             # 180GB, SM100, Blackwell
└── profiles/                       # Optional presets (convenience shortcuts)
    ├── rtx5090-full-stack.json     # LLM + Audio + Image with tuned gpuLayers
    ├── rtx5090-llm-audio.json      # LLM + Audio only
    └── rtx5090-llm-only.json       # LLM only
```

**External registry** (fetched at startup from GitHub Pages):
- URL: `https://openclaw2go.io/v1/catalog.json`
- Built from `site/` + `registry/` in this repo, deployed via GitHub Pages
- Fetched by `openclaw2go registry fetch` before profile resolution
- Cached at `/workspace/.openclaw/registry/` (1h TTL, survives pod restarts)
- Falls back to baked-in registry on fetch failure or offline mode
- Models/profiles are merged: external overrides baked-in by ID
- Engines and GPUs always come from baked-in (tied to physical binaries/hardware)

Each model has `"default": true` marking it as the recommended/most-capable choice for its type. LLM models declare `kvCacheMbPer1kTokens` for per-model KV cache VRAM estimation (fallback: 40 MB/1k).

### Engine Architecture

Two llama.cpp engines cover all tasks. A shared PyTorch venv serves both image-gen and Qwen3-TTS:

```
/opt/engines/
├── openclaw2go-llamacpp/  # Unified fork: LLM, Audio, Vision, Embeddings, TTS, GLM-5 DSA, Eagle-3
│   ├── bin/llama-server              # LLM, Vision, Embeddings, Reranking
│   ├── bin/llama-tts                 # Native TTS (OuteTTS)
│   ├── bin/llama-liquid-audio-server # Audio TTS/STT (LFM2.5)
│   ├── bin/llama-liquid-audio-cli
│   ├── bin/llama-cli
│   └── lib/*.so
├── ik-llamacpp/        # ik_llama.cpp fork (custom quants: IQ2_KS, smol-IQ3_KS, type 139+)
│   ├── bin/llama-server
│   ├── bin/llama-cli
│   └── lib/*.so
└── pytorch/            # Shared PyTorch venv (torch cu128 + diffusers + sdnq + qwen-tts)
    └── venv/           # Used by image-gen and qwen3-tts engines
```

**Why two llama.cpp engines?**
- `openclaw2go-llamacpp` is our unified fork (`runpod-workers/openclaw2go-llamacpp`) that cherry-picks unmerged PRs: audio (PR #18641), OuteTTS 1.0 (PR #12794), Eagle-3 spec decode (PR #18039). GLM-5 DSA (PR #19460) was merged upstream.
- `ik-llamacpp` must stay separate: its custom GGML types (139+) are fundamentally incompatible with standard llama.cpp

**Fork maintenance**: Automated CI on the fork attempts rebase when llama.cpp creates new releases. Tag convention: `{upstream-tag}-openclaw.{patch}`.

### Resolution Flow

1. `openclaw2go registry fetch` → fetch external model catalog (5s timeout, cache 1h)
2. Parse `OPENCLAW_CONFIG` env var (JSON)
3. `resolve-profile.py` → detect GPU via `nvidia-smi`, resolve models, compute VRAM fit + context length
4. Entrypoint downloads models, starts services with correct engine/env/args
5. Web proxy + OpenClaw gateway start

## Codebase Structure

```
openclaw2go/
├── Dockerfile.unified              # Multi-stage build: engines + shared PyTorch venv (image-gen + Qwen3-TTS)
├── engines/
│   └── Dockerfile                  # Engine builder: openclaw2go-llamacpp + ik-llamacpp
├── fork/                           # Scaffolding for openclaw2go-llamacpp fork repo
│   ├── workflows/rebase-on-release.yml  # Auto-rebase CI for the fork
│   └── README.md                   # Fork setup instructions
├── registry/                       # Configuration registry (models, GPUs, presets, schemas)
│   └── schemas/                    # JSON Schema validation (model, gpu)
├── site/                           # Web configurator (React + Vite + TypeScript)
│   ├── scripts/build-catalog.ts    # Merges registry JSONs → dist/v1/catalog.json
│   ├── scripts/validate.ts         # Schema validation, duplicate checks, HF repo verification
│   ├── src/                        # React source (components, lib, types)
│   └── public/                     # Static assets (logos)
├── models/                         # Legacy per-GPU Dockerfiles
├── scripts/
│   ├── entrypoint-unified.sh       # Unified entrypoint (primary)
│   ├── entrypoint-common.sh        # Shared helpers (SSH, auth, skills)
│   ├── resolve-profile.py          # Config resolution + GPU detection + VRAM budget
│   ├── vram-budget.py              # Standalone VRAM budget calculator
│   ├── openclaw2go                  # CLI: models, fit, presets, registry fetch/export/status
│   ├── openclaw-profiles            # CLI: list models, check fit, manage presets (legacy)
│   ├── openclaw-image-gen           # Image generation CLI
│   ├── openclaw-image-server        # FLUX.2 persistent server
│   ├── openclaw-tts                 # Text-to-speech CLI
│   ├── openclaw-tts-server          # Qwen3-TTS persistent server
│   ├── openclaw-stt                 # Speech-to-text CLI
│   └── openclaw-web-proxy           # Reverse proxy + media UI
├── skills/                          # Agent capabilities
│   └── image-gen/                   # FLUX.2 image generation
├── config/
│   ├── openclaw.json                # OpenClaw config template
│   └── workspace/                   # Files copied to /workspace/openclaw/
├── web/                             # Media proxy web UI
├── plugins/                         # OpenClaw plugins
└── tests/                           # Test scripts
```

## Key Decisions

- **Unified llama.cpp fork** — `runpod-workers/openclaw2go-llamacpp` cherry-picks unmerged PRs (audio, OuteTTS, Eagle-3) into one build. 2 engines instead of 4, saves ~1GB image size. GLM-5 DSA already merged upstream.
- **Unified image with multi-arch CUDA** — `DCMAKE_CUDA_ARCHITECTURES="80;89;90;120"` for A100/4090/L40/H100/5090
- **Model-centric config** — users pick models (e.g., `unsloth/glm47-flash-gguf`, `unsloth/nemotron3-nano-gguf`), system computes VRAM fit + context length using per-model KV cache rates
- **All models via llama.cpp** — All current models work with llama.cpp (including FP16 via GGUF). llama.cpp handles concurrent sub-agent requests via `--parallel`.
- **Vision as LLM replacement** — A vision model (e.g., Qwen2.5-VL-7B) can replace the base LLM. Uses `--mmproj` flag. No extra VRAM, vision is a bonus capability.
- **Lightweight auxiliary services** — Embedding (0.6B), Reranking (0.6B), TTS (Qwen3-TTS 0.6B ~3GB or 1.7B ~5GB) models are small enough to run alongside the LLM.
- **PyTorch cu128** — required for RTX 5090 Blackwell sm_120, works on all other GPUs too
- **Diffusers from git** — stable release lacks `Flux2KleinPipeline`
- **Persistent servers for low latency** — Audio (8001) and Image (8002) run with models pre-loaded. CLI scripts call via HTTP.

## Build Commands

```bash
# Build unified image (works on all GPUs)
docker build -f Dockerfile.unified -t openclaw2go .

# Run with auto-detection (all defaults)
docker run --gpus all openclaw2go

# Run with specific config
docker run --gpus all -e OPENCLAW_CONFIG='{"llm":true,"audio":true,"image":true}' openclaw2go

# Run specific model (HuggingFace repo name — case-insensitive)
docker run --gpus all -e OPENCLAW_CONFIG='{"llm":"unsloth/GLM-4.7-Flash-GGUF"}' openclaw2go

# Run LLM only with max context
docker run --gpus all -e OPENCLAW_CONFIG='{"llm":true,"contextLength":200000}' openclaw2go

# Run vision model as primary LLM (multimodal)
docker run --gpus all -e OPENCLAW_CONFIG='{"vision":"unsloth/Qwen2.5-VL-7B-Instruct-GGUF"}' openclaw2go

# Run LLM + embeddings + reranking
docker run --gpus all -e OPENCLAW_CONFIG='{"llm":true,"embedding":true,"reranking":true}' openclaw2go

# Legacy: build per-GPU image
docker build -f models/glm47-flash-gguf-llamacpp/Dockerfile -t openclaw-gguf .
```

## Web Configurator (`site/`)

Interactive VRAM-first GPU pod configurator served via GitHub Pages.

```bash
cd site

# Install dependencies
npm install

# Validate all model/GPU JSON files
npm run validate

# Validate + check HuggingFace repos exist
npm run validate:hf

# Development (builds catalog to public/v1, starts Vite dev server)
npm run dev

# Production build (catalog + site → ../dist/)
npm run build:prod
```

Reads model configs from `registry/models/` and GPU configs from `registry/gpus/`. The configurator lets users pick platform → VRAM → model → services → context and generates deploy commands.

## CLI Tools (inside container)

```bash
# List available models
openclaw2go models
openclaw2go models --type llm
openclaw2go models --type vision
openclaw2go models --type embedding

# Show what fits on this GPU
openclaw2go fit
openclaw2go fit --vram 81920

# List preset profiles
openclaw2go presets
openclaw2go presets show rtx5090-full-stack

# Registry tools
openclaw2go registry status               # Show registry source, cache info, model counts
openclaw2go registry export               # Export current model config as JSON
openclaw2go registry export --format issue # Formatted for GitHub Issue submission

# Validate a config
openclaw2go validate '{"llm":true,"audio":true}'

# VRAM budget calculator
python3 /opt/openclaw/scripts/vram-budget.py --gpu rtx-5090 --models unsloth/glm47-flash-gguf,liquidai/lfm25-audio
```

## Testing

```bash
curl http://localhost:8000/health
curl http://localhost:8000/v1/models
./tests/test-tool-calling.sh
openclaw-image-gen --prompt "test" --width 512 --height 512 --output /tmp/test.png
# Vision test (if vision model is loaded):
curl http://localhost:8003/v1/chat/completions -d '{"messages":[...]}'
# Embedding test:
curl http://localhost:8004/v1/embeddings -d '{"input":"test"}'
```

## Operational Gotchas

- Control UI requires device pairing; without it, chat stays disconnected and previews won't render.
  Use `OPENCLAW_GATEWAY_TOKEN=<token> openclaw devices list` then
  `OPENCLAW_GATEWAY_TOKEN=<token> openclaw devices approve <request-id>`.
- Image previews need a public proxy URL (port 8080). Runpod may 403 non-browser
  requests; verify with a browser user agent when testing.
- Disable external image skills in `/workspace/.openclaw/openclaw.json` so the model
  never tries GPT/OpenAI image tools. The entrypoint handles this automatically.

## Ports

Only 3 HTTP ports need to be exposed on Runpod pods (plus SSH):

| Port | Service | Description |
|------|---------|-------------|
| 8000/http | LLM server | llama.cpp — OpenAI-compatible API |
| 8080/http | Web proxy | OpenClaw media proxy + web UI |
| 18789/http | OpenClaw gateway | OpenClaw control UI + chat |
| 22/tcp | SSH | Remote access |

Internal ports (accessed via localhost only, not exposed):

| Port | Service | Description |
|------|---------|-------------|
| 8001 | Audio | LFM2.5 TTS/STT |
| 8002 | Image | FLUX.2 image generation |
| 8003 | Vision | Standalone vision model (if enabled) |
| 8004 | Embedding | Qwen3-Embedding-0.6B (if enabled) |
| 8005 | Reranking | Jina Reranker v3 (if enabled, experimental) |
| 8006 | TTS | Qwen3-TTS (default) or OuteTTS 0.2 (if enabled) |

## Runpod Pod Access

```bash
ssh -i ~/.ssh/id_runpod root@<ip> -p <port>
nvidia-smi
curl http://localhost:8000/health
curl http://localhost:8000/v1/models
```

## Where to Make Changes

| Task | Location |
|------|----------|
| Add new model | Create JSON in `registry/models/` with VRAM costs + start args, run `cd site && npm run validate` |
| Add new GPU | Create JSON in `registry/gpus/` |
| Add preset profile | Create JSON in `registry/profiles/` |
| Change startup logic | `scripts/entrypoint-unified.sh` or `scripts/entrypoint-common.sh` |
| Modify config resolution | `scripts/resolve-profile.py` |
| Modify registry fetch | `scripts/openclaw2go` (`registry fetch` subcommand) |
| Add agent skill | Create folder in `skills/` with SKILL.md |
| Modify OpenClaw workspace | `config/workspace/` |
| Update CI/CD | `.github/workflows/docker-build.yml` |
| Update engine fork | `runpod-workers/openclaw2go-llamacpp` repo |

## VRAM Usage (RTX 5090 - 32GB)

### GLM-4.7-Flash (default LLM, kvCache: 40 MB/1k)
| Component | VRAM | Notes |
|-----------|------|-------|
| GLM-4.7 LLM (150k ctx) | ~28 GB | Model ~17.3GB + KV cache ~10GB (q8_0) |
| Audio Server (TTS/STT) | ~2 GB | LFM2.5-Audio-1.5B-Q4_0 |
| Image Server (FLUX.2) | ~4 GB | FLUX.2-klein-4B-SDNQ-4bit-dynamic |
| **All 3 (150k ctx)** | **~29-30 GB** | **~2 GB free** |
| **LLM + Audio (200k ctx)** | **~26 GB** | **~6 GB free** |
| **LLM only (200k ctx)** | **~22 GB** | **~10 GB free** |

### New Lightweight Services (additive VRAM)
| Service | VRAM | Notes |
|---------|------|-------|
| Embedding (Qwen3-0.6B) | ~0.8 GB | Can run alongside any LLM |
| Reranking (Jina v3) | ~0.8 GB | Experimental, can run alongside any LLM |
| TTS (Qwen3-TTS 0.6B) | ~3 GB | Default TTS, PyTorch venv |
| TTS (Qwen3-TTS 1.7B) | ~5 GB | Higher quality TTS, PyTorch venv |
| Native TTS (OuteTTS 0.2) | ~0.8 GB | Legacy, native llama-tts binary |
| Vision (Qwen2.5-VL-7B) | ~7 GB | As standalone; 0 extra if replacing LLM |

Context length is auto-computed by `resolve-profile.py` based on available VRAM after accounting for all selected models.

## Important Notes

- Never start/stop servers in code — user handles that
- Use Runpod MCP tools to manage pods
- Model downloads go to `/workspace/models/` (persisted volume)
- **CRITICAL**: ik-llamacpp engine MUST stay separate (custom GGML types incompatible with openclaw2go-llamacpp)

## Lessons Learned

### Build & Compilation

- **CUDA 12.8+ required for Blackwell (sm_120)** — Official llama.cpp Docker images ship CUDA 12.4 which lacks sm_120. No pre-built Linux CUDA binaries exist for llama.cpp. We must compile from source.
- **`GGML_NATIVE=OFF` is required** — CI runner CPU differs from target GPUs. Without this, llama.cpp optimizes for the build machine's CPU and may fail on target hardware.
- **Separate engines from runtime builds** — llama.cpp compilation takes ~70min. Pre-build as `openclaw2go-engines` image, only rebuild when `engines/` changes. Runtime image build takes ~4min.
- **PyTorch cu128 + diffusers from git** — Blackwell needs cu128 wheels. Stable diffusers lacks `Flux2KleinPipeline`, must install from git.
- **Unified fork saves image size** — 2 engines instead of 4 saves ~1GB+ of duplicate llama.cpp code.

### Runtime & Entrypoint

- **Engine isolation still required for ik-llamacpp** — Each engine MUST have its own `LD_LIBRARY_PATH`. openclaw2go-llamacpp is ldconfig'd; ik-llamacpp uses per-process LD_LIBRARY_PATH.
- **Never use `echo | while read` for background processes** — Pipe creates a subshell. PIDs from `&` inside it aren't children of the main shell, so `wait $PID` fails. Use `while read < file` instead.
- **Use nvidia-smi for actual VRAM, not registry values** — Registry has theoretical max; nvidia-smi reports what's actually available (can differ significantly).
- **Default to LLM-only when no config** — Empty `OPENCLAW_CONFIG` (`{}`) defaults to LLM only. Users explicitly opt-in to audio/image/vision/embedding/etc.

### VRAM & Context

- **Minimum 16k context length** — OpenClaw requires at least 16k tokens of context to function properly. All model configs MUST set `defaults.contextLength` to at least 16384. When computing whether a model fits on a GPU, ensure there's enough VRAM headroom for 16k context worth of KV cache at minimum.
- **Per-model KV cache rates** — Each LLM model declares `kvCacheMbPer1kTokens` in its JSON config. GLM-4.7 uses 40 MB/1k (dense attention), Nemotron-3-Nano uses 4 MB/1k (only 6 attention layers + Mamba-2 SSM, calibrated on RTX 5090: actual KV=467MB + RS=48MB for 150k ctx = ~3.4 MB/1k, rounded up to 4). The resolver reads this per-model rate and falls back to 40 MB/1k if not specified. Note: `kvCacheMbPer1kTokens` values already account for q8_0 KV quantization (all models use `-ctk q8_0 -ctv q8_0`).

### External Registry

- **External registry is optional** — If fetch fails (network, timeout, invalid JSON), the baked-in `registry/` is used as fallback. Never blocks startup.
- **Cache at `/workspace/.openclaw/registry/`** — Persisted across pod restarts. TTL-based freshness (default 1h). Stale cache is used over no cache.
- **Engines and GPUs are never externalized** — `engines.json` maps to physical binaries in the image, `gpus/` is safety-critical. Only models and profiles are fetched.
- **Security**: Schema validation on fetch, engine whitelist, `downloadDir` path restriction (`/workspace/models/`), no code execution from JSON.
- **`OPENCLAW_REGISTRY_OFFLINE=true`** — Skip fetch entirely (air-gapped environments).

### CI/CD

- **GitHub `workflow_dispatch` only works from default branch** — Workflows on feature branches can't be manually triggered until merged to main.
- **Fork CI auto-rebases** — `openclaw2go-llamacpp` fork (`main` branch) has automated CI that rebases cherry-picks onto new llama.cpp releases. Conflicts create a PR for manual resolution.
