# Fixes & Key Findings — Qwen 3.6 Model Testing

Discovered during Qwen 3.6 model testing (2026-04-24). Apply fixes before next image build.

---

## Test Results Summary

### Qwen 3.6 27B (Dense) — RTX 5090 (32GB)
- **TPS:** 73 tok/s generation, 437-597 tok/s prompt processing
- **VRAM:** 21,616 MiB with 262K context + q4_0 KV cache
- **Tests passed:** basic chat, tool calling (OpenAI JSON format), multi-turn with tool results, reasoning/thinking (correct "3 r's in strawberry"), Hermes gateway (full tool suite), OpenClaw web UI (chat + tool calling)

### Qwen 3.6 35B-A3B (MoE, 3B active) — RTX 5090 (32GB)
- **TPS:** 185 tok/s generation (~2.5x faster than 27B dense!), 86 tok/s prompt processing
- **VRAM:** 23,463 MiB with 262K context + q4_0 KV cache
- **Tests passed:** basic chat, tool calling, multi-turn with tool results, reasoning/thinking (correct), Hermes gateway (full tool suite + live web search), OpenClaw web UI (chat + tool calling)

### Key Takeaways
1. The 35B MoE model is significantly faster than the 27B dense (185 vs 73 tok/s) with only ~2GB more VRAM. MoE is the clear winner for speed-constrained use cases.
2. Both models fit on a single RTX 5090 (32GB) with full 262K context using q4_0 KV cache quantization.
3. Reasoning mode works well — the model's `<think>` content is properly separated into `reasoning_content` when using auto reasoning format.
4. Tool calling works perfectly in OpenAI JSON format through llama-server's Jinja template engine.

### Speculative Decoding — TESTED, NOT WORKING (llama.cpp build issue)

Attempted speculative decoding with a smaller draft model to speed up the dense 27B model. **It does not work with our current llama.cpp build** (build 1, d0d729a).

**What we tested:**
1. ❌ `Qwen3-1.7B-Q4_K_M.gguf` as draft — vocab mismatch (151K vs 248K), incompatible
2. ✅ `Qwen3.5-2B-Q4_K_M.gguf` as draft — same 248K vocab, vocabs match
3. ❌ But: `common_speculative_is_compat: the target context does not support partial sequence removal` — speculative decoding rejected by the CUDA backend regardless of settings

**Configurations attempted (all failed with same error):**
- 8K context, q8_0 KV, flash attention ON
- 8K context, q8_0 KV, flash attention OFF
- 8K context, no KV quantization, no flash attention (bare minimum)
- All attempts: `--draft-max 12 --draft-min 3 --draft-p-min 0.6`

**Root cause:** Our llama.cpp build (`build: 1 (d0d729a)`) doesn't support "partial sequence removal" in the CUDA context backend, which is required for speculative decoding. This is a known limitation of older/custom builds. Newer llama.cpp releases (b4000+) support this properly.

**Action for later:** When we update the llama.cpp build in the Docker image, re-test speculative decoding with:
```
llama-server \
  -m Qwen3.6-27B-Q4_K_M.gguf \
  -md Qwen3.5-2B-Q4_K_M.gguf \     # MUST be Qwen3.5+ (248K vocab), NOT Qwen3 (151K vocab)
  -ngl 999 -ngld 999 \
  -c 8192 -cd 4096 \
  -fa on -ctk q8_0 -ctv q8_0 \
  --draft-max 12 --draft-min 3 --draft-p-min 0.6
```
Draft model adds ~1.2GB VRAM. If it works, expected speedup is 1.5-2.5x for the dense 27B model. The MoE 35B model (already 185 tok/s) would benefit less.

---

## Fixes to Apply

## 1. resolve-profile.py: Auto-discovery for unknown models

**Problem:** When a user passes a HuggingFace repo not in the registry (e.g., `"llm":"unsloth/Qwen3.6-27B-GGUF:4bit"`), the entrypoint creates a synthetic fallback with `files: []` and no `downloadDir`. This means no model is downloaded and llama-server tries to load from `/`, crashing instantly.

**Fix:** Updated `scripts/resolve-profile.py` to auto-discover GGUF files from HuggingFace using `huggingface_hub.list_repo_files()`. When an unknown model is encountered, it now:
- Lists all `.gguf` files in the repo
- Matches the `:Nbit` suffix to the best quant (e.g., `:4bit` → `Q4_K_M`)
- Auto-detects mmproj files for vision models
- Sets a proper `downloadDir` (`/workspace/models/{repo-name}`)
- Estimates VRAM from actual HuggingFace file size

**File:** `scripts/resolve-profile.py` (local copy already updated)

## 2. LD_LIBRARY_PATH for llama-server

**Problem:** When manually starting llama-server, it fails with `error while loading shared libraries: libmtmd.so.0: cannot open shared object file`. The library exists at `/opt/engines/a2go-llamacpp/lib/libmtmd.so.0` but `LD_LIBRARY_PATH` is not set.

**Fix:** The entrypoint should ensure `LD_LIBRARY_PATH` includes `/opt/engines/a2go-llamacpp/lib` before launching llama-server. Check if the existing entrypoint already does this — it may only fail when llama-server is started manually outside the entrypoint.

**Workaround:** `export LD_LIBRARY_PATH=/opt/engines/a2go-llamacpp/lib`

## 3. Do NOT use `--reasoning-format none` for Qwen 3.6

**Problem:** With `--reasoning-format none`, the model's `<think>` tags and tool calls appear as raw text in the `content` field. The model outputs `<tool_call><function=exec>...` XML in the content instead of structured `tool_calls` JSON. This breaks OpenClaw's tool call parser (error: "Failed to parse input at pos 227").

**Fix:** Remove `--reasoning-format none` from extraStartArgs. The default auto mode properly:
- Separates reasoning into `reasoning_content` field
- Returns tool calls as structured `tool_calls` JSON array
- Works with both streaming and non-streaming requests

**Impact:** Without this fix, OpenClaw cannot use Qwen 3.6 for agentic tasks (tool calling fails). Hermes works because it manages tool calls differently.

## 4. `--reasoning-format none` likely affects ALL models with OpenClaw

**Scope:** All existing GGUF model configs use `--reasoning-format none`. This means none of them work properly with OpenClaw for agentic tool calling. Only Hermes is unaffected (it manages tools internally).

**Action:** When we roll out OpenClaw support broadly, we need to remove `--reasoning-format none` from ALL model configs, not just Qwen 3.6. The default auto mode (which uses Jinja templates from the model) handles reasoning + tool calls correctly for every model we tested.

**Models affected:** `qwen35-*`, `glm47-*`, `gpt-oss-*` (13 configs total).

## 5. Hermes requires `config.yaml` with model settings

**Problem:** Hermes gateway starts but rejects requests with "Model has a context window of 32,768 tokens, which is below the minimum 64,000 required" when `config.yaml` is missing or incomplete. The `.env` file alone is not enough.

**Fix:** The entrypoint must create `/root/.hermes/config.yaml` with:
```yaml
model:
  provider: custom
  default: {model-alias}
  base_url: http://localhost:8000/v1
  api_key: {api-key}
  context_length: {context-length}
memory:
  memory_enabled: true
  user_profile_enabled: true
terminal:
  backend: local
  persistent_shell: true
```

Without `context_length` in config.yaml, Hermes reads the model's default (often 32K) and rejects it.

## 6. OpenClaw requires `models.providers` + `agents.defaults.model` in config

**Problem:** OpenClaw defaults to `openai/gpt-5.4` when no model config is set. Simply setting env vars (`OPENCLAW_MODEL`, `OPENAI_BASE_URL`) does NOT work.

**Fix:** The entrypoint must create `/root/.openclaw/openclaw.json` with:
```json
{
  "models": {
    "providers": {
      "local": {
        "baseUrl": "http://localhost:8000/v1",
        "apiKey": "{api-key}",
        "models": [{"id": "{model-alias}", "name": "{model-name}"}]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "local/{model-alias}"
    }
  }
}
```

Also requires:
- `gateway.controlUi.allowedOrigins` must include the RunPod proxy URL (`https://{pod-id}-18789.proxy.runpod.net`)
- `gateway.controlUi.dangerouslyDisableDeviceAuth: true` for headless/automated access (or implement proper device pairing flow)

## 7. Docker Hub rate limits on RunPod

**Problem:** RunPod nodes pull `runpod/a2go:latest` from Docker Hub unauthenticated, frequently hitting rate limits (`toomanyrequests`). This is especially bad on EU datacenters (NL, NO).

**Fix:** This is a RunPod platform issue. Consider:
- Pushing the image to a registry with higher rate limits (GHCR, RunPod's own registry if available)
- Or caching the image on more nodes
