---
name: a2go-text-to-speech
description: Convert text to speech audio using the local LFM2.5 model on the GPU.
metadata: {"openclaw":{"emoji":"🔊","requires":{"bins":["a2go"]}}}
---
Convert text to speech audio using the local LFM2.5-Audio model running on the GPU.

Use the `exec` tool to run:
```
a2go tool text-to-speech "Your text here" --output /tmp/speech.wav
```

Options:
- `--voice`: "US male", "UK male", "US female", "UK female"
- `--output`: WAV file path (required)

Examples:
- `a2go tool text-to-speech "Hello world" --output /tmp/hello.wav`
- `a2go tool text-to-speech "Good morning" --output /tmp/morning.wav --voice "UK female"`
