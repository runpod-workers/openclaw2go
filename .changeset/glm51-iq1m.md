---
"a2go": patch
---

feat: add glm-5.1 754b iq1m 1-bit gguf model config

Adds GLM-5.1-754B IQ1_M (1-bit, ~194GB) from unsloth/GLM-5.1-GGUF.
MoE architecture with 40B active parameters. Supports tool calling
and reasoning/thinking. Tested on 3x A100 SXM4 80GB at ~22 tok/s.
