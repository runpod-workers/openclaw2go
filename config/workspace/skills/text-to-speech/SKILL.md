---
name: text-to-speech
description: Convert text to speech audio with a local audio model.
metadata: {"openclaw":{"emoji":"🔊","requires":{"bins":["a2go"]}}}
---
Use this skill to convert text to speech audio. Invoke the `exec` tool to run
the CLI and save the output under `/workspace/openclaw/audio/`.

Required inputs:
- text (string) - The text to convert to speech
- output (string) - The output WAV file path

Optional inputs:
- voice (string) - Voice to use: "US male", "UK male", "US female", "UK female"

Examples:
- `a2go tool text-to-speech "Hello, how can I help you today?" --output /workspace/openclaw/audio/greeting.wav`
- `a2go tool text-to-speech --text "Welcome" --output /workspace/openclaw/audio/welcome.wav`
- `a2go tool text-to-speech "Good morning" --output /tmp/greeting.wav --voice "UK female"`

Notes:
- Output format is WAV audio
- Keep text reasonably short for best results (a few sentences)
- Available voices: US male, UK male, US female, UK female
