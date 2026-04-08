---
"a2go": patch
---

fix: stt endpoint accepts multipart file uploads (openai convention)

The /api/audio/stt endpoint now handles both multipart form data
(curl -F file=@audio.wav) and JSON base64 bodies.
