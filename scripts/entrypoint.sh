#!/bin/bash
# entrypoint.sh - OpenClaw + vLLM startup script for Runpod
set -e
source /opt/a2go/entrypoint-common.sh

echo "============================================"
echo "  OpenClaw + vLLM Startup"
echo "============================================"

# Configuration from environment
MODEL_NAME="${MODEL_NAME:-Qwen/Qwen2.5-Coder-7B-Instruct}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-local-coder}"
VLLM_API_KEY="${VLLM_API_KEY:-changeme}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-16384}"
GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.90}"
TOOL_CALL_PARSER="${TOOL_CALL_PARSER:-hermes}"
TENSOR_PARALLEL_SIZE="${TENSOR_PARALLEL_SIZE:-auto}"
HF_HOME="${HF_HOME:-/workspace/huggingface}"
# Canonical A2GO_* vars with backward-compat fallback to OPENCLAW_*
A2GO_AUTH_TOKEN="${A2GO_AUTH_TOKEN:-${OPENCLAW_WEB_PASSWORD:-changeme}}"
A2GO_STATE_DIR="${A2GO_STATE_DIR:-${OPENCLAW_STATE_DIR:-$HOME/.openclaw}}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"

# Bridge to agent-specific env vars
OPENCLAW_WEB_PASSWORD="$A2GO_AUTH_TOKEN"
OPENCLAW_STATE_DIR="$A2GO_STATE_DIR"

# Symlink ~/.openclaw -> /workspace/.openclaw on RunPod (before setting defaults)
oc_create_path_symlinks

export HF_HOME
export OPENCLAW_STATE_DIR

BOT_CMD="openclaw"

# Ensure directories exist
mkdir -p "$HF_HOME" "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents/main/sessions" \
    "$OPENCLAW_STATE_DIR/credentials" /workspace/openclaw
chmod 700 "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents" "$OPENCLAW_STATE_DIR/agents/main" \
    "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" 2>/dev/null || true

# Auto-detect tensor parallel size
if [ "$TENSOR_PARALLEL_SIZE" = "auto" ]; then
    GPU_COUNT=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l || echo "1")
    TENSOR_PARALLEL_SIZE=$GPU_COUNT
fi

echo "Configuration:"
echo "  Model: $MODEL_NAME"
echo "  Served as: $SERVED_MODEL_NAME"
echo "  Max context: $MAX_MODEL_LEN"
echo "  GPU utilization: $GPU_MEMORY_UTILIZATION"
echo "  Tensor parallel: $TENSOR_PARALLEL_SIZE"
echo "  Tool parser: $TOOL_CALL_PARSER"
echo ""

# Initialize OpenClaw config if not exists
if [ ! -f "$OPENCLAW_STATE_DIR/openclaw.json" ]; then
    echo "Creating OpenClaw configuration..."

    # Build telegram config based on whether token is provided
    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true, \"botToken\": \"${TELEGRAM_BOT_TOKEN}\" }"
    else
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true }"
    fi

    cat > "$OPENCLAW_STATE_DIR/openclaw.json" << EOF
{
  "agents": {
    "defaults": {
      "model": { "primary": "local-vllm/${SERVED_MODEL_NAME}" },
      "workspace": "/workspace/openclaw"
    }
  },
  "models": {
    "providers": {
      "local-vllm": {
        "baseUrl": "http://localhost:8000/v1",
        "apiKey": "${VLLM_API_KEY}",
        "api": "openai-completions",
        "models": [{
          "id": "${SERVED_MODEL_NAME}",
          "name": "Local Coding Model",
          "contextWindow": ${MAX_MODEL_LEN},
          "maxTokens": 4096,
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }]
      }
    }
  },
  "channels": {
    ${TELEGRAM_CONFIG}
  },
  "skills": {
    "load": { "extraDirs": ["/opt/a2go/skills"] }
  },
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": { "mode": "token", "token": "${OPENCLAW_WEB_PASSWORD}" }
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json"
    echo "Config created. Telegram token: ${TELEGRAM_BOT_TOKEN:+provided}${TELEGRAM_BOT_TOKEN:-NOT SET - add manually}"
else
    echo "Existing config found at $OPENCLAW_STATE_DIR/openclaw.json - preserving it"
fi

# Keep gateway tokens in sync with OPENCLAW_WEB_PASSWORD.
oc_sync_gateway_auth "token"

# Workspace files are seeded during image build.

# Build vLLM command
VLLM_CMD="vllm serve $MODEL_NAME"
VLLM_CMD+=" --host 0.0.0.0 --port 8000"
VLLM_CMD+=" --max-model-len $MAX_MODEL_LEN"
VLLM_CMD+=" --gpu-memory-utilization $GPU_MEMORY_UTILIZATION"
VLLM_CMD+=" --served-model-name $SERVED_MODEL_NAME"
VLLM_CMD+=" --api-key $VLLM_API_KEY"
VLLM_CMD+=" --enable-auto-tool-choice"
VLLM_CMD+=" --tool-call-parser $TOOL_CALL_PARSER"

if [ "$TENSOR_PARALLEL_SIZE" -gt 1 ]; then
    VLLM_CMD+=" --tensor-parallel-size $TENSOR_PARALLEL_SIZE"
fi

echo "Starting vLLM server..."
echo "Command: $VLLM_CMD"
echo ""

# Start vLLM in background
$VLLM_CMD &
VLLM_PID=$!

# Wait for vLLM to be ready
echo "Waiting for vLLM to start..."
MAX_WAIT=300
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "vLLM is ready!"
        break
    fi
    sleep 5
    WAITED=$((WAITED + 5))
    echo "  Waiting... ($WAITED/${MAX_WAIT}s)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "ERROR: vLLM failed to start within ${MAX_WAIT} seconds"
    exit 1
fi

# Start OpenClaw gateway
echo ""
echo "Starting OpenClaw gateway..."
"$BOT_CMD" gateway --auth token --token "$OPENCLAW_WEB_PASSWORD" &
GATEWAY_PID=$!

echo ""
oc_print_ready "vLLM API" "$SERVED_MODEL_NAME" "$MAX_MODEL_LEN tokens" "token"
echo ""

# Keep container running and handle signals
trap "kill $VLLM_PID $GATEWAY_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either process to exit
wait -n $VLLM_PID $GATEWAY_PID
EXIT_CODE=$?

echo "A process exited with code $EXIT_CODE"
kill $VLLM_PID $GATEWAY_PID 2>/dev/null || true
exit $EXIT_CODE
