---
"a2go": patch
---

fix: mac audio proxy routing and missing mlx-audio dependencies

- Web proxy now falls back to probing audio server directly when no metadata
  files exist (Mac native MLX path doesn't write /tmp/oc_audio_engine)
- Doctor installs uvicorn, fastapi, python-multipart required by mlx-audio 0.4.2
