#!/bin/bash
set -e
source /opt/openclaw/entrypoint-common.sh

echo "================================================"
echo "  GLM-4.7-Flash AWQ (4-bit) on A100 80GB"
echo "================================================"

# RunPod's /start.sh handles SSH setup using PUBLIC_KEY env var
# It ends with 'sleep infinity' so we run it in background
oc_start_runpod_ssh

# Persist vLLM cache (CUDA graphs, torch compile) on network storage
# This speeds up subsequent pod starts by reusing cached compiled kernels
export XDG_CACHE_HOME=/workspace/.cache
export HF_HOME=/workspace/.cache/huggingface
mkdir -p /workspace/.cache/vllm /workspace/.cache/huggingface

# Download model if not present
MODEL_PATH="${MODEL_PATH:-/workspace/models/GLM-4.7-Flash-AWQ-4bit}"
if [ ! -d "$MODEL_PATH" ]; then
    echo "Downloading model to $MODEL_PATH..."
    mkdir -p /workspace/models

    # Check for HF_TOKEN for faster downloads
    if [ -z "$HF_TOKEN" ]; then
        echo "TIP: Set HF_TOKEN env var for faster downloads (https://huggingface.co/settings/tokens)"
    else
        echo "Using HF_TOKEN for authenticated downloads"
    fi

    # Use 'hf download' - the modern Hugging Face CLI command
    # Falls back to python module if 'hf' command not in PATH
    if command -v hf &> /dev/null; then
        hf download cyankiwi/GLM-4.7-Flash-AWQ-4bit --local-dir "$MODEL_PATH"
    else
        python -m huggingface_hub.cli download cyankiwi/GLM-4.7-Flash-AWQ-4bit \
            --local-dir "$MODEL_PATH" \
            --local-dir-use-symlinks False
    fi
fi

# Set defaults
VLLM_API_KEY="${VLLM_API_KEY:-changeme}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-glm-4.7-flash}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-114688}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/workspace/.openclaw}"
OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/workspace/openclaw}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
# Web UI token/password - users enter this to access the OpenClaw control panel
OPENCLAW_WEB_PASSWORD="${OPENCLAW_WEB_PASSWORD:-openclaw}"

BOT_CMD="openclaw"

echo "Starting vLLM server..."
echo "  Model: $MODEL_PATH"
echo "  Context: $MAX_MODEL_LEN tokens"
echo "  API Key: ${VLLM_API_KEY:0:4}..."

# Start vLLM
vllm serve "$MODEL_PATH" \
    --host 0.0.0.0 \
    --port 8000 \
    --max-model-len "$MAX_MODEL_LEN" \
    --gpu-memory-utilization 0.92 \
    --kv-cache-dtype fp8 \
    --served-model-name "$SERVED_MODEL_NAME" \
    --api-key "$VLLM_API_KEY" \
    --trust-remote-code \
    --enable-auto-tool-choice \
    --tool-call-parser glm47 \
    --reasoning-parser glm45 \
    --block-size 32 \
    --disable-log-requests \
    --enable-prefix-caching \
    --max-num-batched-tokens 8192 &

VLLM_PID=$!

# Wait for vLLM to be ready
echo "Waiting for vLLM to start..."
MAX_WAIT=600
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "vLLM is ready!"
        break
    fi
    sleep 5
    WAITED=$((WAITED + 5))
    echo "  Waiting... ($WAITED/$MAX_WAIT seconds)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "ERROR: vLLM failed to start within $MAX_WAIT seconds"
    echo "Container will stay running for debugging. Check logs with: ps aux; cat /var/log/*"
    # Don't exit - keep container running for debugging
fi

# Setup OpenClaw config
mkdir -p "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" "$OPENCLAW_WORKSPACE"
chmod 700 "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents" "$OPENCLAW_STATE_DIR/agents/main" \
    "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" 2>/dev/null || true

if [ ! -f "$OPENCLAW_STATE_DIR/openclaw.json" ]; then
    echo "Creating OpenClaw config..."

    # Build telegram config based on whether token is provided
    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true, \"botToken\": \"${TELEGRAM_BOT_TOKEN}\" }"
    else
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true }"
    fi

    # Create a minimal config - openclaw doctor will fix any missing fields
    cat > "$OPENCLAW_STATE_DIR/openclaw.json" << EOF
{
  "models": {
    "providers": {
      "local-vllm": {
        "baseUrl": "http://localhost:8000/v1",
        "apiKey": "$VLLM_API_KEY",
        "api": "openai-completions",
        "models": [{
          "id": "$SERVED_MODEL_NAME",
          "name": "GLM-4.7-Flash AWQ 4-bit",
          "contextWindow": $MAX_MODEL_LEN,
          "maxTokens": 8192,
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "local-vllm/$SERVED_MODEL_NAME" },
      "contextTokens": 98304,
      "workspace": "$OPENCLAW_WORKSPACE"
    }
  },
  "channels": {
    ${TELEGRAM_CONFIG}
  },
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": { "mode": "password", "password": "$OPENCLAW_WEB_PASSWORD" }
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json"
fi

# Auto-fix config to match current OpenClaw version's schema
echo "Running openclaw doctor to validate/fix config..."
OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR "$BOT_CMD" doctor --fix || true
chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json" 2>/dev/null || true

# Setup GitHub CLI if token provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring GitHub CLI..."
    echo "$GITHUB_TOKEN" | gh auth login --with-token
    gh auth setup-git
    mkdir -p /workspace/.config/gh
    cp -r ~/.config/gh/* /workspace/.config/gh/ 2>/dev/null || true
elif [ -d "/workspace/.config/gh" ] && [ -f "/workspace/.config/gh/hosts.yml" ]; then
    echo "Restoring GitHub CLI from persisted config..."
    mkdir -p ~/.config/gh
    cp -r /workspace/.config/gh/* ~/.config/gh/
    gh auth setup-git 2>/dev/null || true
fi

# Setup Claude Code environment
export OPENAI_API_KEY="$VLLM_API_KEY"
export OPENAI_BASE_URL="http://localhost:8000/v1"

# Start OpenClaw gateway with password auth for web UI access
echo ""
echo "Starting OpenClaw gateway..."
OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR "$BOT_CMD" gateway --auth password --password "$OPENCLAW_WEB_PASSWORD" &
GATEWAY_PID=$!

echo ""
oc_print_ready "vLLM API" "$SERVED_MODEL_NAME" "$MAX_MODEL_LEN tokens" "password"

# Handle shutdown
cleanup() {
    echo "Shutting down..."
    [ -n "$GATEWAY_PID" ] && kill $GATEWAY_PID 2>/dev/null
    kill $VLLM_PID 2>/dev/null
    exit 0
}
trap cleanup SIGTERM SIGINT

# Keep running - wait for vLLM or sleep forever if it failed
if [ -n "$VLLM_PID" ] && kill -0 $VLLM_PID 2>/dev/null; then
    wait $VLLM_PID
else
    echo "vLLM not running, keeping container alive for debugging..."
    sleep infinity
fi
