# AGENTS.md

OpenClaw2Go on Runpod: self-contained Docker images with LLM + media services for GPU pods.

## Architecture

### Unified Image (primary)

One Docker image works on all GPUs (A100/H100/B200/RTX 5090). Configuration at runtime via `OPENCLAW_CONFIG` env var.

**Core abstraction: models + GPU VRAM = what fits.** The system detects GPU VRAM, computes which models fit, and auto-adjusts context length. Users pick models, not infrastructure.

```
OPENCLAW_CONFIG examples:
  {"llm": true, "audio": true, "image": true}                                    — all default models
  {"llm": true, "audio": true}                                                    — LLM + audio only (more VRAM for context)
  {"llm": "unsloth/GLM-4.7-Flash-GGUF", "contextLength": 200000}                — specific model + context override
  {"llm": "unsloth/Nemotron-3-Nano-30B-A3B-GGUF"}                               — Nemotron-3-Nano (MoE, low KV cache)
  {"llm": "unsloth/Nemotron-3-Nano-30B-A3B-GGUF", "audio": true}                — Nemotron + audio
  {"llm": "zai-org/GLM-4.7-Flash"}                                               — FP16 via vLLM (A100/H100)
  {"llm": "cyankiwi/GLM-4.7-Flash-AWQ-4bit"}                                    — AWQ 4-bit via vLLM (A100)
  {"llm": "GadflyII/GLM-4.7-Flash-NVFP4"}                                       — NVFP4 via vLLM (RTX 5090, experimental)
  {"llm": "zai-org/GLM-4.7-Flash", "audio": true, "image": true}                — vLLM + audio + image
  {"llm": "unsloth/gpt-oss-20b-GGUF"}                                           — OpenAI GPT-OSS 20B (fits any GPU)
  {"llm": "unsloth/Qwen3-Coder-Next-GGUF"}                                      — Qwen3 Coder Next 80B MoE (L40/A100)
  {"llm": "ubergarm/Step-3.5-Flash-GGUF"}                                       — Step 3.5 Flash 197B MoE (A100, IQ2_KS)
  {"llm": "TeichAI/GLM-4.7-Flash-Claude-Opus-4.5-High-Reasoning-Distill-GGUF"} — GLM-4.7 Claude distill
  {"profile": "rtx5090-full-stack"}                                               — use a preset (optional shorthand)
  {}                                                                               — auto-detect GPU, use all defaults that fit
```

Model names are **case-insensitive**. You can use the HuggingFace repo name (e.g., `unsloth/GLM-4.7-Flash-GGUF`) or the short model ID (e.g., `unsloth/glm47-flash-gguf`). `true` = default model for that type.

### Registry (`registry/`)

JSON-based configuration registry. Models declare their VRAM cost; the system computes fit at runtime.

```
registry/
├── engines.json                    # Engine definitions (llamacpp, llamacpp-audio, image-gen, vllm)
├── models/                         # Model specs (VRAM, repo, start args, KV cache rates)
│   ├── glm47-flash-gguf.json       # LLM: GLM-4.7-Flash Q4_K_M (default: true, kvCache: 40 MB/1k)
│   ├── nemotron3-nano-gguf.json    # LLM: Nemotron-3-Nano-30B MoE (kvCache: 4 MB/1k)
│   ├── glm47-flash-fp16-vllm.json  # LLM: GLM-4.7-Flash FP16 via vLLM (A100/H100)
│   ├── glm47-flash-awq-vllm.json   # LLM: GLM-4.7-Flash AWQ 4-bit via vLLM (A100)
│   ├── glm47-flash-nvfp4-vllm.json # LLM: GLM-4.7-Flash NVFP4 via vLLM (5090, experimental)
│   ├── lfm25-audio.json            # Audio: LFM2.5-Audio-1.5B (default: true)
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

Each model has `"default": true` marking it as the recommended/most-capable choice for its type. LLM models declare `kvCacheMbPer1kTokens` for per-model KV cache VRAM estimation (fallback: 40 MB/1k).

### Engine Isolation

LLM and Audio use separate llama.cpp builds with incompatible shared libraries. They are isolated via `LD_LIBRARY_PATH`. vLLM and image-gen use isolated Python venvs:

```
/opt/engines/
├── llamacpp-llm/       # LLM: main branch llama.cpp
│   ├── bin/llama-server
│   └── lib/*.so
├── llamacpp-audio/     # Audio: PR #18641 branch
│   ├── bin/llama-liquid-audio-server
│   └── lib/*.so
├── vllm/               # LLM: vLLM (Python venv, pre-built CUDA kernels)
│   └── venv/           # Isolated from image-gen (different torch/transformers)
└── image-gen/          # Image: Python venv (torch cu128 + diffusers + sdnq)
    └── venv/
```

### Resolution Flow

1. Parse `OPENCLAW_CONFIG` env var (JSON)
2. `resolve-profile.py` → detect GPU via `nvidia-smi`, resolve models, compute VRAM fit + context length
3. Entrypoint downloads models, starts services with correct engine/env/args
4. Web proxy + OpenClaw gateway start

## Codebase Structure

```
openclaw2go/
├── Dockerfile.unified              # Unified multi-stage build (primary)
├── registry/                       # Configuration registry (models, GPUs, presets)
├── models/                         # Legacy per-GPU Dockerfiles
│   ├── glm47-flash-gguf-llamacpp/  # RTX 5090 - llama.cpp (legacy)
│   ├── glm47-flash-awq-4bit/       # A100 80GB - vLLM (disabled)
│   ├── glm47-flash-fp16/           # H100/A100 - vLLM (disabled)
│   ├── glm47-flash-nvfp4-5090/     # RTX 5090 - vLLM (disabled)
│   └── glm47-reap-w4a16/           # B200 - vLLM (disabled)
├── scripts/
│   ├── entrypoint-unified.sh       # Unified entrypoint (primary)
│   ├── entrypoint-common.sh        # Shared helpers (SSH, auth, skills)
│   ├── resolve-profile.py          # Config resolution + GPU detection + VRAM budget
│   ├── vram-budget.py              # Standalone VRAM budget calculator
│   ├── openclaw-profiles            # CLI: list models, check fit, manage presets
│   ├── openclaw-image-gen           # Image generation CLI
│   ├── openclaw-image-server        # FLUX.2 persistent server
│   ├── openclaw-tts                 # Text-to-speech CLI
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

- **Unified image with multi-arch CUDA** — `DCMAKE_CUDA_ARCHITECTURES="80;89;90;120"` for A100/4090/L40/H100/5090
- **Model-centric config** — users pick models (e.g., `unsloth/glm47-flash-gguf`, `unsloth/nemotron3-nano-gguf`), system computes VRAM fit + context length using per-model KV cache rates
- **vLLM engine** — FP16/AWQ/NVFP4 models via vLLM in isolated Python venv. vLLM auto-manages KV cache via `--gpu-memory-utilization` (no manual computation). Models use `downloadMode: "repo"` for full HuggingFace repo downloads.
- **RTX 5090 NVFP4 via vLLM is experimental** — GLM-4.7 MLA attention bugs on Blackwell being fixed in vLLM v0.15.x
- **PyTorch cu128** — required for RTX 5090 Blackwell sm_120, works on all other GPUs too
- **Diffusers from git** — stable release lacks `Flux2KleinPipeline`
- **LLM and Audio binaries MUST be separate** — incompatible .so files. LLM libs in `/opt/engines/llamacpp-llm/lib/`, Audio in `/opt/engines/llamacpp-audio/lib/`. Mixing them breaks LLM server.
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

# Legacy: build per-GPU image
docker build -f models/glm47-flash-gguf-llamacpp/Dockerfile -t openclaw-gguf .
```

## CLI Tools (inside container)

```bash
# List available models
openclaw-profiles models

# Show what fits on this GPU
openclaw-profiles fit

# Simulate fit on a specific VRAM
openclaw-profiles fit --vram 81920

# List preset profiles
openclaw-profiles presets

# VRAM budget calculator
python3 /opt/openclaw/scripts/vram-budget.py --gpu rtx-5090 --models unsloth/glm47-flash-gguf,liquidai/lfm25-audio
```

## Testing

```bash
curl http://localhost:8000/health
curl http://localhost:8000/v1/models
./tests/test-tool-calling.sh
openclaw-image-gen --prompt "test" --width 512 --height 512 --output /tmp/test.png
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
| 8000/http | LLM server | llama.cpp or vLLM — OpenAI-compatible API |
| 8080/http | Web proxy | OpenClaw media proxy + web UI |
| 18789/http | OpenClaw gateway | OpenClaw control UI + chat |
| 22/tcp | SSH | Remote access |

Audio (8001) and Image (8002) servers are internal only — accessed by the LLM via localhost, not exposed externally.

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
| Add new model | Create JSON in `registry/models/` with VRAM costs + start args |
| Add new GPU | Create JSON in `registry/gpus/` |
| Add preset profile | Create JSON in `registry/profiles/` |
| Change startup logic | `scripts/entrypoint-unified.sh` or `scripts/entrypoint-common.sh` |
| Modify config resolution | `scripts/resolve-profile.py` |
| Add agent skill | Create folder in `skills/` with SKILL.md |
| Modify OpenClaw workspace | `config/workspace/` |
| Update CI/CD | `.github/workflows/docker-build.yml` |

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

### Nemotron-3-Nano (MoE LLM, kvCache: 4 MB/1k — calibrated on RTX 5090)
| Component | VRAM | Notes |
|-----------|------|-------|
| Nemotron-3-Nano LLM only (150k ctx) | ~22.5 GB | Model ~21.5GB + compute ~0.5GB + KV ~0.5GB |
| **+ Audio + Image** | **~28.5 GB** | **Comfortable on 32GB (~4 GB free)** |

Context length is auto-computed by `resolve-profile.py` based on available VRAM after accounting for all selected models.

### vLLM Models (KV cache auto-managed)
| Model | GPU | VRAM (model+overhead) | Context | Notes |
|-------|-----|----------------------|---------|-------|
| GLM-4.7-Flash FP16 | A100/H100 80GB | ~33 GB | 65k default | Full precision, highest quality |
| GLM-4.7-Flash AWQ 4-bit | A100 80GB | ~19 GB | 114k default | Efficient quantization, large context |
| GLM-4.7-Flash NVFP4 | RTX 5090 32GB | ~14 GB | 200k default | Experimental (vLLM bugs pending) |

vLLM models use `--gpu-memory-utilization` to auto-size KV cache. When combined with audio/image services, `gpuMemoryUtilization` is auto-adjusted to leave room for non-LLM VRAM.

## Important Notes

- Never start/stop servers in code — user handles that
- Use Runpod MCP tools to manage pods
- Model downloads go to `/workspace/models/` (persisted volume)
- **CRITICAL**: LLM and Audio .so files must stay in separate directories under `/opt/engines/`

## Lessons Learned

### Build & Compilation

- **CUDA 12.8+ required for Blackwell (sm_120)** — Official llama.cpp Docker images ship CUDA 12.4 which lacks sm_120. No pre-built Linux CUDA binaries exist for llama.cpp. We must compile from source.
- **`GGML_NATIVE=OFF` is required** — CI runner CPU differs from target GPUs. Without this, llama.cpp optimizes for the build machine's CPU and may fail on target hardware.
- **Separate engines from runtime builds** — llama.cpp compilation takes ~70min. Pre-build as `openclaw2go-engines` image, only rebuild when `engines/` changes. Runtime image build takes ~4min.
- **PyTorch cu128 + diffusers from git** — Blackwell needs cu128 wheels. Stable diffusers lacks `Flux2KleinPipeline`, must install from git.

### Runtime & Entrypoint

- **Engine isolation is mandatory** — LLM and Audio llama.cpp builds produce incompatible `.so` files. Each service MUST have its own `LD_LIBRARY_PATH`. Mixing them silently breaks the LLM server.
- **Audio uses a PR branch, not main** — llama.cpp Audio requires PR #18641 (`liquid-audio` branch). No pre-built binaries anywhere.
- **Never use `echo | while read` for background processes** — Pipe creates a subshell. PIDs from `&` inside it aren't children of the main shell, so `wait $PID` fails. Use `while read < file` instead.
- **Use nvidia-smi for actual VRAM, not registry values** — Registry has theoretical max; nvidia-smi reports what's actually available (can differ significantly).
- **Default to LLM-only when no config** — Empty `OPENCLAW_CONFIG` (`{}`) defaults to LLM only. Users explicitly opt-in to audio/image.

### VRAM & Context

- **Per-model KV cache rates** — Each LLM model declares `kvCacheMbPer1kTokens` in its JSON config. GLM-4.7 uses 40 MB/1k (dense attention), Nemotron-3-Nano uses 4 MB/1k (only 6 attention layers + Mamba-2 SSM, calibrated on RTX 5090: actual KV=467MB + RS=48MB for 150k ctx = ~3.4 MB/1k, rounded up to 4). The resolver reads this per-model rate and falls back to 40 MB/1k if not specified.

### CI/CD

- **GitHub `workflow_dispatch` only works from default branch** — Workflows on feature branches can't be manually triggered until merged to main.
