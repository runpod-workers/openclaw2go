---
name: stt
description: Transcribe speech audio to text with a local LFM2.5-Audio model.
metadata: {"openclaw":{"emoji":"🎤","requires":{"bins":["openclaw-stt"]}}}
---
Use this skill to transcribe speech audio to text (ASR - Automatic Speech Recognition).
Invoke the `exec` tool to run the CLI.

Required inputs:
- audio (string) - Path to the input WAV audio file

Optional inputs:
- output (string) - Path to save the transcript (if not provided, prints to stdout)

Examples:
- `openclaw-stt /workspace/openclaw/audio/recording.wav`
- `openclaw-stt --audio /tmp/voice.wav --output /workspace/openclaw/transcripts/voice.txt`
- `openclaw-stt /workspace/openclaw/audio/meeting.wav`

Notes:
- Input should be WAV audio format
- The model runs on CPU, so longer audio may take more time
- Best results with clear speech and minimal background noise
- The transcript is printed to stdout unless --output is specified
