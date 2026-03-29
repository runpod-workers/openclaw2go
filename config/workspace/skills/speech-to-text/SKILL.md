---
name: speech-to-text
description: Transcribe speech audio to text with a local audio model.
metadata: {"openclaw":{"emoji":"🎤","requires":{"bins":["a2go"]}}}
---
Use this skill to transcribe speech audio to text (ASR - Automatic Speech Recognition).
Invoke the `exec` tool to run the CLI.

Required inputs:
- audio file path (positional argument) - Path to the input WAV audio file

Optional inputs:
- output (string) - Path to save the transcript (if not provided, prints to stdout)

Examples:
- `a2go tool speech-to-text /workspace/openclaw/audio/recording.wav`
- `a2go tool speech-to-text /tmp/voice.wav --output /workspace/openclaw/transcripts/voice.txt`
- `a2go tool speech-to-text /workspace/openclaw/audio/meeting.wav`

Notes:
- Input should be WAV audio format
- Best results with clear speech and minimal background noise
- The transcript is printed to stdout unless --output is specified
