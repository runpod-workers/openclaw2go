# Architecture

## Startup flow

```
OPENCLAW2GO_CONFIG (env var)
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
        +-- openclaw-web-proxy          port 8080
        +-- openclaw gateway            port 18789
```

All engines are llama.cpp. LLM and Audio use separate builds with isolated shared libraries (incompatible `.so` files).
