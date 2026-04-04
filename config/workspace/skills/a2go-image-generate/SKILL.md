---
name: a2go-image-generate
description: Generate images from text prompts using the local FLUX.2 model on the GPU.
metadata: {"openclaw":{"emoji":"🖼️","requires":{"bins":["a2go"]}}}
---
Generate images from text prompts using the local FLUX.2 Klein model running on the GPU.

Use the `exec` tool to run:
```
a2go tool image-generate --prompt "<prompt>" --output /tmp/image.png
```

Options:
- `--width` / `--height`: pixel dimensions (default: 1024x1024)
- `--aspect`: aspect ratio (e.g. `16:9`, `1:1`)
- `--output`: file path (required)

Examples:
- `a2go tool image-generate --prompt "A cat in space" --output /tmp/cat.png`
- `a2go tool image-generate --prompt "Logo design" --aspect 1:1 --output /tmp/logo.png`
