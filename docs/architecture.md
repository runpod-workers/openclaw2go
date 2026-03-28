# Architecture

## Startup flow

```
A2GO_CONFIG (env var)
        |
        v
  resolve-profile.py  -->  detect GPU (nvidia-smi)
        |                   compute VRAM budget
        v                   auto-adjust context length
  entrypoint-unified.sh
        |
        +-- llama-server (LLM)         port 8000
        +-- llama-audio-server (Audio)  port 8001 (internal)
        +-- openclaw-image-server       port 8002 (internal)
        +-- web-proxy                   port 8080
        +-- openclaw gateway            port 18789
```

All engines are llama.cpp. LLM and Audio use separate builds with isolated shared libraries (incompatible `.so` files).

## Path mapping

The canonical config path is `~/.openclaw`, matching official OpenClaw defaults. On RunPod, `/workspace` is a persistent network volume — the entrypoint symlinks `~/.openclaw` → `/workspace/.openclaw` so data survives pod restarts while the canonical path stays standard. When running locally via `docker run`, `~/.openclaw` is a regular directory (or a user-provided volume mount).

| Path | Purpose | On RunPod |
|---|---|---|
| `~/.openclaw` (`OPENCLAW_STATE_DIR`) | Config, credentials, agents | Symlinked → `/workspace/.openclaw` |
| `/workspace/openclaw` (`OPENCLAW_WORKSPACE`) | Agent workspace (files, images, audio) | Direct on network volume |

The symlink is created by `oc_create_path_symlinks()` in `scripts/entrypoint-common.sh`. It is only created if `/workspace` exists and nothing already exists at `~/.openclaw`, so user-provided volume mounts (e.g. `docker run -v mydata:/root/.openclaw`) are never overwritten.

### Remote Control UI access

CORS origins for the Control UI are auto-configured at startup. When `RUNPOD_POD_ID` is set (always available on RunPod pods), the entrypoint writes `"allowedOrigins": ["https://<pod-id>-18789.proxy.runpod.net"]` into `openclaw.json`. When running locally (no `RUNPOD_POD_ID`), the origins array is empty — CORS is not needed for local access.

For development/testing, you can set `dangerouslyAllowHostHeaderOriginFallback: true` in the gateway config to allow any origin that matches the `Host` header. This is less secure and should not be used in production.
