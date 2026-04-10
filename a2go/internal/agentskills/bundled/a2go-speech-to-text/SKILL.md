---
name: a2go-speech-to-text
description: Transcribe speech audio to text using the local LFM2.5 model on the GPU.
metadata: {"openclaw":{"emoji":"🎤","requires":{"bins":["a2go"]}}}
---
Transcribe speech audio to text using the local LFM2.5-Audio model running on the GPU.

Use the `exec` tool to run:
```
a2go tool speech-to-text /path/to/audio.wav
```

Options:
- `--output`: save transcript to file (default: prints to stdout)

Examples:
- `a2go tool speech-to-text /tmp/recording.wav`
- `a2go tool speech-to-text /tmp/voice.wav --output /tmp/transcript.txt`
