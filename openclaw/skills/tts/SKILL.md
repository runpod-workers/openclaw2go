---
name: tts
description: Convert text to speech audio with a local LFM2.5-Audio model.
metadata: {"openclaw":{"emoji":"🔊","requires":{"bins":["openclaw-tts"]}}}
---
Use this skill to convert text to speech audio. Invoke the `exec` tool to run
the CLI and save the output under `/workspace/openclaw/audio/`.

Required inputs:
- text (string) - The text to convert to speech
- output (string) - The output WAV file path

Optional inputs:
- voice (string) - Voice to use: "US male", "UK male", "US female", "UK female" (default: US male)

Examples:
- `openclaw-tts "Hello, how can I help you today?" --output /workspace/openclaw/audio/greeting.wav`
- `openclaw-tts --text "Welcome to OpenClaw" --output /workspace/openclaw/audio/welcome.wav`
- `openclaw-tts "Good morning" --output /tmp/greeting.wav --voice "UK female"`

Notes:
- Output format is WAV audio at 16kHz
- The model runs on CPU, so longer texts may take more time
- Keep text reasonably short for best results (a few sentences)
- Available voices: US male, UK male, US female, UK female
