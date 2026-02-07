# Video Script: OpenClaw fully self-hosted on RTX 5090 (GLM‑4.7‑Flash GGUF + llama.cpp)

This doc turns the repo learnings into a demo-first video script for two audiences:

- **How to set it up and use it** (first half)
- **How it works** (later), with **vLLM/NVFP4** as a short end note

---

## Benchmark slide: where to get the “graph” + the numbers (Artificial Analysis)

### Option A (fastest): screenshot Artificial Analysis model pages

Use these pages and grab the **Artificial Analysis Intelligence Index** number shown on each page:

- **GLM-4.7-Flash (Reasoning)**: 30 — <https://artificialanalysis.ai/models/glm-4-7-flash>
- **GLM-4.7 (Reasoning)**: 42 — <https://artificialanalysis.ai/models/glm-4-7>
- **GPT-5.2 (xhigh)**: 51 — <https://artificialanalysis.ai/models/gpt-5-2>
- **GPT-5.2 Codex (xhigh)**: 48 — <https://artificialanalysis.ai/models/gpt-5-2-codex>
- **Claude Opus 4.5 (Reasoning)**: 50 — <https://artificialanalysis.ai/models/claude-opus-4-5-thinking>
- **Claude 4.5 Sonnet (Reasoning)**: 42 — <https://artificialanalysis.ai/models/claude-4-5-sonnet-thinking>

If you want a single AA page on screen as a citation backdrop, use a comparison page:

- **GLM‑4.7 vs GPT‑5.2**: <https://artificialanalysis.ai/models/comparisons/glm-4-7-vs-gpt-5-2>

### Option B (cleanest): create your own bar chart, cite AA

- Build a simple bar chart using the numbers above.
- Add a footer like: **Source: Artificial Analysis (Intelligence Index v4.0), accessed Jan 2026**.

**Note on “Composer 1”**: The AA model page for “Composer 1” wasn’t reliably fetchable during prep (timeouts). If you want “Composer 1” in the slide, verify its page exists in AA and grab the index number from there; otherwise swap it for a different widely-known coding model that AA lists reliably.

---

## Video script (demo-first; usage first; deep technical notes last)

### 0:00–0:25 — Cold open / hook (call out fake “self-hosted”)

**On screen**: quick montage: Telegram/WhatsApp agent convo → “Powered by Claude API” / billing pain → cut to local terminal + GPU.

**You say**:
People call these “self-hosted agents”… but then the brain is still a paid API. If your agent stops working the second Claude is down or your token budget runs out, that’s not self-hosted.

Today I’ll show a fully self-contained OpenClaw setup: local model, local inference, agent UI—no external model API needed.

### 0:25–0:55 — What you’ll build + requirements (set expectations)

**On screen**: one slide: “OpenClaw + GLM‑4.7‑Flash + llama.cpp (OpenAI API)”.

**You say**:
We’re running GLM‑4.7‑Flash locally via llama.cpp and pointing OpenClaw at it using an OpenAI-compatible API.

If you’ve got an RTX 5090 (32GB), you can run the full 200k context. With 24GB, it can still work, just with a reduced context window—because the model weights alone are ~17GB.

### 0:55–2:10 — Quick demo first (prove it works before you explain anything)

**On screen**:
- Open OpenClaw web UI
- Show the agent doing a quick code task (small repo change / explanation)
- Show a raw API call to the model (`/v1/chat/completions`)

**You say**:
Let me prove it’s real before we talk architecture. This is OpenClaw running against a model in the same environment. No Claude key. No OpenAI key.

If you’re using Telegram integration, the same idea applies: messages go to a local model, not a hosted API.

### 2:10–3:40 — Two ways to run it: local GPU vs Runpod (choose your path)

**On screen**: split screen: local machine vs Runpod pod.

**You say**:
You’ve got two options:

- Local: lowest latency and everything stays on your machine.
- Runpod: if you don’t have a 5090—or you don’t want your workstation pinned all day—you can still keep it self-contained. You pay for compute time, not per-token API calls.

### 3:40–5:30 — Runpod setup walkthrough (the “do this, then this” part)

**On screen**: Runpod UI checklist.

**You say (walkthrough voice)**:
Here’s the setup that actually matters:

- **Image**: `runpod/openclaw2go-glm4.7-flash-gguf-flux.2-klein-4b-sdnq-4bit-dynamic-lfm2.5-audio-1.5b-gguf:latest`
- **Ports**: `8000/http` (llama.cpp), `8080/http` (media proxy UI), `18789/http` (OpenClaw UI), `22/tcp` (SSH)
- **Network volume mounted to `/workspace`** (non-negotiable; model is ~17GB and you want persistence across restarts)
- **Environment variables**:
  - `LLAMA_API_KEY` (protects the model API)
  - `OPENCLAW_WEB_PASSWORD` (protects the web UI token)
  - optionally `TELEGRAM_BOT_TOKEN` (Telegram)

### 5:30–6:40 — Health check + raw chat completion (OpenAI-compat API)

**On screen**: terminal showing `curl` to `/health` then `/v1/chat/completions`.

**You say**:
llama.cpp runs an OpenAI-compatible API. That’s the trick: OpenClaw doesn’t need to know it’s llama.cpp.

**Show (copy/paste):**

- Health check: `GET /health` on `:8000`
- Chat completion: `POST /v1/chat/completions` with `Authorization: Bearer $LLAMA_API_KEY` and `model: "glm-4.7-flash"`

### 6:40–8:10 — The “gotcha”: first-time device pairing (and why it’s good)

**On screen**: web UI says “pairing required” → SSH → approve device → refresh UI.

**You say**:
First time you open the web UI, it won’t just let any browser control your agent. You must approve the device.

**On screen (commands):**

- List requests:
  - `OPENCLAW_STATE_DIR=/workspace/.openclaw openclaw pairing list telegram`
- Approve:
  - `OPENCLAW_STATE_DIR=/workspace/.openclaw openclaw pairing approve telegram <request-id>`

**You say**:
This is the right default for something that can run commands and touch repos.

### 8:10–9:10 — Benchmark slide (short, no methodology detour)

**On screen**: your bar chart + tiny citation footer (Artificial Analysis URLs).

**You say**:
Why GLM‑4.7‑Flash? Because it’s an open-weights model with serious benchmark performance. On Artificial Analysis’ Intelligence Index, you can see where it sits relative to the usual suspects.

Quick callout list (keep it fast):

- GLM‑4.7: 42
- GLM‑4.7‑Flash: 30
- GPT‑5.2: 51
- GPT‑5.2 Codex: 48
- Claude Opus 4.5 (Reasoning): 50
- Claude 4.5 Sonnet (Reasoning): 42

### 9:10–10:45 — How it works (high level, but concrete)

**On screen**: simple block diagram.

**You say**:
Architecture is simple:

- llama.cpp (`llama-server`) hosts the model and exposes OpenAI-style endpoints on `:8000`
- OpenClaw points its provider config at `http://localhost:8000/v1`
- The container stores everything under `/workspace` so restarts don’t wipe model + state

Then the “why it fits”:

We’re running a GGUF quantization (Q4_K_M) and using Q8 KV cache quantization—this is what makes 200k context feasible on a 32GB card.

### 10:45–12:00 — Ending note: what happened with vLLM/NVFP4 (keep it tight)

**On screen**: one screenshot of the core error + a short bullet list.

**You say**:
We tried the obvious path first: vLLM with NVFP4 for Blackwell. But as of Jan 2026, it’s blocked for GLM‑4.7 on the 5090.

Root cause: GLM‑4.7’s MLA attention isn’t handled correctly in vLLM’s fallback path, leading to an attention output dimension mismatch.

When those pieces land upstream (vLLM + cuDNN support), we’ll revisit and benchmark it.

**On screen takeaway**:
Today’s working answer: GGUF + llama.cpp.

---

## Suggested on-screen callouts (quick checklist)

- **Ports**: `8000` (model API), `18789` (web UI), `22` (SSH)
- **Persistence**: “Network volume mounted to `/workspace`”
- **Security**: “API key for model + web token + device pairing”
- **Performance tagline (repo docs)**: “~175 tok/s, ~28GB VRAM, 200k context on RTX 5090”

