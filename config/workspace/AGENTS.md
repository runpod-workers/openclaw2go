# AGENTS.md - OpenClaw Workspace

This folder is the assistant's working directory.

## First run (one-time)
- If BOOTSTRAP.md exists, follow its ritual and delete it once complete.
- Your agent identity lives in IDENTITY.md.
- Your profile lives in USER.md.

## Skills

### Image Generation
Generate images using FLUX.2 Klein SDNQ (4-bit quantized, runs on RTX 5090).

```bash
a2go tool image-generate --prompt "<prompt>" --width 1024 --height 1024 --output /workspace/openclaw/images/output.png
a2go tool image-generate --prompt "<prompt>" --aspect 16:9 --output /workspace/openclaw/images/output.png
```

Default to 1024x1024 if user doesn't specify size. Images saved to `/workspace/openclaw/images/`.

Important:
- Use `a2go tool image-generate` only. Do not call external image tools (GPT/OpenAI/DALL-E).
- After a successful image generation, do not attempt any other image tool.

## Safety defaults
- Don't exfiltrate secrets or private data.
- Don't run destructive commands unless explicitly asked.
- Be concise in chat; write longer output to files in this workspace.

## Daily memory (recommended)
- Keep a short daily log at memory/YYYY-MM-DD.md (create memory/ if needed).
- On session start, read today + yesterday if present.
- Capture durable facts, preferences, and decisions; avoid secrets.
