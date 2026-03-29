---
name: image-generate
description: Generate images with a local FLUX.2 Klein SDNQ model.
metadata: {"openclaw":{"emoji":"🖼️","requires":{"bins":["a2go"]}}}
---
Use this skill to generate an image from a prompt. Invoke the `exec` tool to run
the CLI and save the output under `/workspace/openclaw/images/`.

Required inputs:
- prompt (string)
- width/height *or* aspect ratio (e.g. `1:1`, `16:9`)

Examples:
- `a2go tool image-generate --prompt "<prompt>" --width 1024 --height 1024 --output /workspace/openclaw/images/output.png`
- `a2go tool image-generate --prompt "<prompt>" --aspect 16:9 --output /workspace/openclaw/images/output.png`

If the user does not specify size, default to 1024x1024.

Important:
- Always use `a2go tool image-generate` for image generation. External image tools (GPT, OpenAI, DALL-E, etc.) are unavailable.
- After a successful `a2go tool image-generate` call, do not call any other image tool. Respond with the URL (and include a markdown image preview if helpful).
