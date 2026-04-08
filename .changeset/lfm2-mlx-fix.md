---
"a2go": patch
---

feat: add native LFM2.5-Audio MLX server for macOS

mlx-audio's get_model_category() doesn't support the STS category where
LFM2.5 lives. This adds a dedicated server (mlx-lfm2-server) that imports
directly from mlx_audio.sts.models.lfm_audio, with /health, TTS and STT
endpoints. Auto-selected when the audio model contains "lfm2".
