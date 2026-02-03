#!/bin/bash
# entrypoint.sh - GLM-4.7-REAP W4A16 + OpenClaw startup script for Runpod B200
set -e
source /opt/openclaw/entrypoint-common.sh

echo "============================================"
echo "  GLM-4.7-REAP W4A16 + OpenClaw Startup"
echo "============================================"

# Configuration from environment
MODEL_NAME="${MODEL_NAME:-0xSero/GLM-4.7-REAP-40-W4A16}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-glm-4.7-reap}"
VLLM_API_KEY="${VLLM_API_KEY:-changeme}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-32768}"
GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.90}"
TOOL_CALL_PARSER="${TOOL_CALL_PARSER:-glm45}"
HF_HOME="${HF_HOME:-/workspace/huggingface}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/workspace/.openclaw}"
OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/workspace/openclaw}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
OPENCLAW_WEB_PASSWORD="${OPENCLAW_WEB_PASSWORD:-changeme}"

export HF_HOME
export OPENCLAW_STATE_DIR
export PATH=/usr/local/cuda-13.1/bin:$PATH
export CUDA_HOME=/usr/local/cuda-13.1
export LD_LIBRARY_PATH=/usr/local/cuda-13.1/lib64:$LD_LIBRARY_PATH

# Ensure directories exist
mkdir -p "$HF_HOME" "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents/main/sessions" \
    "$OPENCLAW_STATE_DIR/credentials" "$OPENCLAW_WORKSPACE"
chmod 700 "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents" "$OPENCLAW_STATE_DIR/agents/main" \
    "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" 2>/dev/null || true

BOT_CMD="openclaw"

# Configure GitHub CLI
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring GitHub CLI from GITHUB_TOKEN..."
    echo "$GITHUB_TOKEN" | gh auth login --with-token
    gh auth setup-git
    mkdir -p /workspace/.config/gh
    cp -r /root/.config/gh/* /workspace/.config/gh/ 2>/dev/null || true
    echo "GitHub authentication configured and persisted"
elif [ -d "/workspace/.config/gh" ] && [ -f "/workspace/.config/gh/hosts.yml" ]; then
    echo "Restoring GitHub CLI from persisted config..."
    mkdir -p /root/.config/gh
    cp -r /workspace/.config/gh/* /root/.config/gh/
    gh auth setup-git 2>/dev/null || true
    echo "GitHub authentication restored"
else
    echo "NOTE: GitHub not configured. Set GITHUB_TOKEN env var or run 'gh auth login'"
fi

echo "Configuration:"
echo "  Model: $MODEL_NAME"
echo "  Served as: $SERVED_MODEL_NAME"
echo "  Max context: $MAX_MODEL_LEN"
echo "  GPU utilization: $GPU_MEMORY_UTILIZATION"
echo "  Tool parser: $TOOL_CALL_PARSER"
echo "  CUDA: $(nvcc --version | grep release | awk '{print $5}' | tr -d ',')"
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
          "name": "GLM-4.7-REAP (Local)",
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
    "load": { "extraDirs": ["/opt/openclaw/skills"] }
  },
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": { "mode": "password", "password": "${OPENCLAW_WEB_PASSWORD}" }
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json"
    echo "Config created. Telegram token: ${TELEGRAM_BOT_TOKEN:+provided}${TELEGRAM_BOT_TOKEN:-NOT SET - add manually}"
else
    echo "Existing config found at $OPENCLAW_STATE_DIR/openclaw.json - preserving it"
fi

oc_sync_gateway_auth "password"

# Build vLLM command
# Note: GLM-4.7-REAP requires:
# - FlashInfer attention (downloads pre-compiled B200 cubins from NVIDIA)
# - CUDA graphs enabled (no --enforce-eager)
# - glm45 tool parser (glm47 doesn't exist in vLLM yet)
VLLM_CMD="vllm serve $MODEL_NAME"
VLLM_CMD+=" --host 0.0.0.0 --port 8000"
VLLM_CMD+=" --max-model-len $MAX_MODEL_LEN"
VLLM_CMD+=" --gpu-memory-utilization $GPU_MEMORY_UTILIZATION"
VLLM_CMD+=" --served-model-name $SERVED_MODEL_NAME"
VLLM_CMD+=" --api-key $VLLM_API_KEY"
VLLM_CMD+=" --trust-remote-code"
VLLM_CMD+=" --enable-auto-tool-choice"
VLLM_CMD+=" --tool-call-parser $TOOL_CALL_PARSER"

echo "Starting vLLM server..."
echo "Command: $VLLM_CMD"
echo ""

# Start vLLM in background
$VLLM_CMD &
VLLM_PID=$!

# Wait for vLLM to be ready (model loading + FlashInfer cubin download + CUDA graph capture)
echo "Waiting for vLLM to start (this may take 10-15 minutes for first run)..."
MAX_WAIT=900  # 15 minutes for model loading + cubin download + CUDA graphs
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "vLLM is ready!"
        break
    fi
    sleep 10
    WAITED=$((WAITED + 10))
    echo "  Waiting... ($WAITED/${MAX_WAIT}s)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "ERROR: vLLM failed to start within ${MAX_WAIT} seconds"
    exit 1
fi

# Start OpenClaw gateway
echo ""
echo "Starting OpenClaw gateway..."
OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR "$BOT_CMD" gateway --auth password --password "$OPENCLAW_WEB_PASSWORD" &
GATEWAY_PID=$!

echo ""
oc_print_ready "vLLM API" "$SERVED_MODEL_NAME" "$MAX_MODEL_LEN tokens" "password"

# Keep container running and handle signals
trap "kill $VLLM_PID $GATEWAY_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either process to exit
wait -n $VLLM_PID $GATEWAY_PID
EXIT_CODE=$?

echo "A process exited with code $EXIT_CODE"
kill $VLLM_PID $GATEWAY_PID 2>/dev/null || true
exit $EXIT_CODE
