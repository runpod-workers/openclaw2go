---
"a2go": minor
---

VRAM-aware auto-detection for model selection: when A2GO_CONFIG is empty, resolve-profile.py now picks the best LLM that fits the detected GPU VRAM instead of always defaulting to GLM-4.7 Flash. Adds autoTier field to 7 models spanning 8GB to 96GB+ GPUs, with Qwen3.5 models covering 8-48GB and Nemotron-3-Super for 56GB+.
