---
"a2go": patch
---

Remove `--reasoning-format none` from the existing Qwen 3.5, GLM 4.7, and GPT-OSS GGUF configs so OpenClaw tool calling uses llama.cpp's default auto handling. Also update the unified Docker entrypoint and generated OpenClaw config shape so llama-server keeps the a2go llama.cpp library path, the resolved model is synced into `openclaw.json`, and the Control UI gets the RunPod origin plus device-auth bypass for headless access.
