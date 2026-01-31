# AGENTS.md

## Build commands

```bash
# Build specific model variant
docker build -f models/glm47-flash-gguf-llamacpp/Dockerfile -t openclaw-gguf .
docker build -f models/glm47-flash-awq-4bit/Dockerfile -t openclaw-awq .
docker build -f models/glm47-flash-fp16/Dockerfile -t openclaw-fp16 .
```

## Test commands

```bash
# Health check
curl http://localhost:8000/health

# List models
curl http://localhost:8000/v1/models -H "Authorization: Bearer $VLLM_API_KEY"

# Run test suites
./tests/test-vllm.sh
./tests/test-tool-calling.sh
```

## Code style

- Shell scripts: Use `set -e` at top, quote variables
- Dockerfiles: Combine RUN commands to reduce layers, add comments for non-obvious steps
- Python: Standard formatting, type hints where helpful

## Testing on RunPod

```bash
# SSH into pod
ssh -i ~/.ssh/id_runpod root@<ip> -p <port>

# Check GPU
nvidia-smi

# Test image generation
openclaw-image-gen --prompt "test" --width 512 --height 512 --output /tmp/test.png
```

## Important notes

- RTX 5090 requires PyTorch cu128 (not cu124) for Blackwell sm_120 support
- Diffusers must be installed from git for `Flux2KleinPipeline`
- Never start/stop servers — user handles that
- Use RunPod MCP tools to manage pods
