---
name: add-model
description: Add a new model to the a2go registry — both GGUF (Linux/Windows) and MLX (macOS) variants, with full testing on Runpod.
---

# Add Model to a2go Registry

Follow every step in order. Do NOT skip testing. Do NOT create a PR until all steps pass.

## Step 1: Research the Model

1. Find the model on HuggingFace. Identify:
   - Architecture (dense, MoE, hybrid)
   - Base parameter count and active parameters (for MoE)
   - Supported features: tool calling, reasoning/thinking, vision, audio
   - Native context length
   - Any special requirements (override-KV keys, multimodal projections, etc.)

2. Find quantized variants:
   - **GGUF (Linux/Windows):** Look in `unsloth/`, `bartowski/`, or the official org. Pick the **best quant that fits on an RTX 4090 (24GB)** — prefer Q8_0 if it fits, otherwise Q4_K_M. For very large models, check Q2_K_XL or IQ4_XS.
   - **MLX (macOS):** Look in `mlx-community/`. Pick the **best quant that fits in 24GB unified memory** (M3 Pro baseline). Prefer 8-bit, fall back to 4-bit.

## Step 2: Create Model JSON Configs

Create two files in `registry/models/`:
- `{model-name}-gguf.json` — for Linux/Windows (engine: `a2go-llamacpp`)
- `{model-name}-mlx.json` — for macOS (engine: `mlx-lm`)

Use existing models in the same family as templates. Both files MUST share the same `group`, `family`, and `catalogKey`.

Key fields to get right:
- `id`: `org/model-name` format (lowercase)
- `group`: shared identifier across GGUF/MLX variants (e.g. `qwen35-9b`)
- `family`: broader family (e.g. `qwen35`)
- `catalogKey`: same as `group` unless the family has models that need separate catalog rows
- `vram.model`: model weight size in MB (check HuggingFace file sizes)
- `vram.overhead`: compute graph buffers (1.5-3GB for large models, 0 for MLX)
- `kvCacheMbPer1kTokens`: KV cache rate. **MLX rate must be ~1.88x the GGUF rate** (MLX uses fp16, GGUF uses q8_0)
- `defaults.contextLength`: must be >= 16384 (OpenClaw minimum)
- `platform`: set to `"mlx"` for MLX variants, omit for GGUF

For GGUF models, also set:
- `files`: array of GGUF files to download (include mmproj if vision)
- `downloadDir`: must start with `/workspace/models/`
- `extraStartArgs`: any extra llama.cpp flags (check existing similar models)
- `startDefaults.gpuLayers`: `"999"` to offload all layers to GPU
- `provider.name`: `"local-llamacpp"`

## Step 3: Validate

```bash
cd site && npx tsx scripts/validate.ts
```

Fix any errors. Warnings about MLX/GGUF KV ratio should be investigated.

## Step 4: Build a Test Image

Push your branch and let CI build a Docker image with the branch tag:

```bash
git add registry/models/
git commit -m "feat: add {model-name} model configs"
git push origin {branch-name}
```

The CI builds images tagged as `runpod/a2go:{branch-name}` (slashes/underscores become hyphens, lowercased).

## Step 5: Test on Runpod

Use the `/runpodctl` skill to deploy a Runpod GPU pod with the branch-tagged image. Test on **every supported GPU where the model fits** — at minimum RTX 4090, RTX 5090, and RTX 3090.

### 5a: Test through the LLM API (port 8000)

1. **Basic chat completion** — simple factual question:
   ```bash
   curl http://localhost:8000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model": "{served-as}", "messages": [{"role": "user", "content": "What is the capital of France?"}], "max_tokens": 100}'
   ```

2. **Tool/function calling** — run the test suite:
   ```bash
   bash tests/test-tool-calling.sh
   ```
   All tests must pass. If they fail, the model may not support tool calling or needs a different tool call parser.

3. **Reasoning/thinking mode** (if supported) — verify `reasoning_content` is populated:
   ```bash
   curl http://localhost:8000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model": "{served-as}", "messages": [{"role": "user", "content": "How many r'\''s are in strawberry? Think step by step."}], "max_tokens": 512}'
   ```

### 5b: Test through Hermes gateway (port 8642)

Hermes is the agent framework that sits on top of the LLM. It must work correctly for agent use cases.

1. **Basic Hermes chat** — verify the gateway responds:
   ```bash
   curl http://localhost:8642/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model": "{served-as}", "messages": [{"role": "user", "content": "Hello, what tools do you have available?"}], "max_tokens": 256}'
   ```

2. **Hermes tool calling** — Hermes uses the `hermes` tool call parser. Verify tool calls work through the gateway:
   ```bash
   curl http://localhost:8642/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model": "{served-as}", "messages": [{"role": "user", "content": "What is the weather in Berlin?"}], "tools": [{"type": "function", "function": {"name": "get_weather", "description": "Get weather for a location", "parameters": {"type": "object", "properties": {"location": {"type": "string"}}, "required": ["location"]}}}], "max_tokens": 256}'
   ```

3. **Hermes multi-turn with tool results** — verify the agent can incorporate tool results:
   ```bash
   curl http://localhost:8642/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model": "{served-as}", "messages": [{"role": "user", "content": "What is the weather in Berlin?"}, {"role": "assistant", "content": null, "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "get_weather", "arguments": "{\"location\": \"Berlin\"}"}}]}, {"role": "tool", "tool_call_id": "call_1", "content": "{\"temp\": 18, \"condition\": \"cloudy\"}"}], "max_tokens": 256}'
   ```

### 5c: Test through OpenClaw gateway (port 18789)

1. **Device pairing:**
   ```bash
   OPENCLAW_GATEWAY_TOKEN=<token> openclaw devices list
   openclaw devices approve <request-id>
   ```

2. **Full flow** — verify profile resolution, model download, server start, and gateway connectivity all work end-to-end.

### 5d: Test the OpenClaw web UI with `/agent-browser`

OpenClaw has a web UI on port 8080. Hermes is API-only (no web UI). Use the `/agent-browser` skill to test the OpenClaw UI end-to-end:

1. **Open the agent UI** — navigate to the pod's proxy URL on port 8080
2. **Device pairing** — approve the device when prompted. Use `/agent-browser` to click through the pairing flow in the browser.
3. **Send a chat message** — verify the agent responds correctly through the web UI
4. **Test tool calling in the UI** — ask the agent to perform a task that requires tools and verify it works visually
5. **Test image generation** (if image service is running) — ask the agent to generate an image and verify it renders in the UI

### 5e: Record measurements

For each GPU tested:

1. **Actual VRAM** from `nvidia-smi` — update `vram.model` in the config to match reality
2. **Generation speed** (tok/s) from the API response `timings.predicted_per_second` — add to `tps` field
3. **Verify `kvCacheMbPer1kTokens`** — calculate: `(vram_with_context - vram_model_only) / (context_tokens / 1000)`
4. Add GPU IDs to `verifiedOn` array

Always test with the model's **full default context length** — never reduce it. If it OOMs, that's a real finding.

## Step 6: Update Config with Results

Update both GGUF and MLX model JSON files with:
- Corrected `vram.model` from actual nvidia-smi readings
- `tps` object with measured tok/s per GPU
- `verifiedOn` array with tested GPU IDs
- Any adjusted `kvCacheMbPer1kTokens` values

## Step 7: Final Validation & PR

```bash
cd site && npx tsx scripts/validate.ts
```

Create a changeset:
```bash
npx changeset
```

Then create the PR. Include test results (VRAM, tok/s, GPUs tested) in the PR description.
