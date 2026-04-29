---
"a2go": patch
---

Fix Hermes gateway failing to start when `A2GO_AUTH_TOKEN` is a short or placeholder value. Hermes rejects weak API keys when binding to 0.0.0.0 — the entrypoint now auto-generates a secure 32-byte hex key and displays it in the ready banner. Also fix the LFM2.5-Audio plugin to use `llama-server` instead of the removed `llama-liquid-audio-server` binary (audio support merged upstream in llama.cpp b8967 via mtmd).
