---
"a2go": minor
---

Add Qwen 3.6 model support: 27B dense (73 tok/s) and 35B-A3B MoE (185 tok/s) with GGUF and MLX configs. Both verified on RTX 5090 with full 262K context using q4_0 KV cache quantization. Fix resolve-profile.py to auto-discover GGUF files from HuggingFace for unknown model repos instead of crashing.
