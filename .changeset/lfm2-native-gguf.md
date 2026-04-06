---
"a2go": patch
---

feat: switch LFM2.5-Audio plugin to native GGUF via llama-liquid-audio-server

Replaces the PyTorch-based liquid_audio library (~4GB VRAM) with a native
llama-liquid-audio-server subprocess that loads quantized GGUF files (~2GB VRAM).
The plugin spawns the server internally and proxies TTS/STT requests through it,
keeping the unified media server architecture intact.
