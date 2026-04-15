---
"a2go": minor
---

Add Wandler (ONNX) as a third inference engine alongside llama.cpp and MLX. Includes end-to-end support: engine filter UI with 9 ONNX model configs, `--engine` CLI flag with auto-detection from catalog, `a2go doctor` installs Wandler on Mac, Docker image includes Wandler, and entrypoint handles Wandler service startup.
