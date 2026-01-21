#!/bin/bash
set -e

echo "================================================"
echo "  GLM-4.7-Flash NVFP4 on RTX 5090 (Blackwell)"
echo "================================================"

# RunPod's /start.sh handles SSH setup using PUBLIC_KEY env var
# It ends with 'sleep infinity' so we run it in background
if [ -f /start.sh ]; then
    echo "Running RunPod start script (background)..."
    /start.sh &
    # Give it a moment to set up SSH
    sleep 5
fi

# Persist vLLM cache (CUDA graphs, torch compile) on network storage
# This speeds up subsequent pod starts by reusing cached compiled kernels
export XDG_CACHE_HOME=/workspace/.cache
export HF_HOME=/workspace/.cache/huggingface
mkdir -p /workspace/.cache/vllm /workspace/.cache/huggingface

# Download model if not present
MODEL_PATH="${MODEL_PATH:-/workspace/models/GLM-4.7-Flash-NVFP4}"
if [ ! -d "$MODEL_PATH" ]; then
    echo "Downloading model to $MODEL_PATH..."
    mkdir -p /workspace/models
    # Use 'hf download' - the modern Hugging Face CLI command
    # Falls back to python module if 'hf' command not in PATH
    if command -v hf &> /dev/null; then
        hf download Gadflyll/GLM-4.7-Flash-NVFP4 --local-dir "$MODEL_PATH"
    else
        python -m huggingface_hub.cli download Gadflyll/GLM-4.7-Flash-NVFP4 \
            --local-dir "$MODEL_PATH" \
            --local-dir-use-symlinks False
    fi
fi

# Set defaults
VLLM_API_KEY="${VLLM_API_KEY:-changeme}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-glm-4.7-flash}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-200000}"
CLAWDBOT_HOME="${CLAWDBOT_HOME:-/workspace/.clawdbot}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
# Web UI password - users enter this to access the Clawdbot control panel
CLAWDBOT_WEB_PASSWORD="${CLAWDBOT_WEB_PASSWORD:-clawdbot}"

echo "Starting vLLM server..."
echo "  Model: $MODEL_PATH"
echo "  Context: $MAX_MODEL_LEN tokens"
echo "  API Key: ${VLLM_API_KEY:0:4}..."

# Start vLLM with RTX 5090 optimized settings
# - gpu-memory-utilization 0.95: Tighter for 32GB VRAM (model ~20GB + KV ~10GB)
# - kv-cache-dtype fp8: Required for MLA memory efficiency
vllm serve "$MODEL_PATH" \
    --host 0.0.0.0 \
    --port 8000 \
    --max-model-len "$MAX_MODEL_LEN" \
    --gpu-memory-utilization 0.95 \
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

# Setup Clawdbot config
mkdir -p "$CLAWDBOT_HOME"

if [ ! -f "$CLAWDBOT_HOME/clawdbot.json" ]; then
    echo "Creating Clawdbot config..."

    # Build telegram config based on whether token is provided
    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true, \"botToken\": \"${TELEGRAM_BOT_TOKEN}\" }"
    else
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true }"
    fi

    # Create a minimal config - clawdbot doctor will fix any missing fields
    # contextTokens: 180000 leaves room for output within 200K context
    cat > "$CLAWDBOT_HOME/clawdbot.json" << EOF
{
  "models": {
    "providers": {
      "local-vllm": {
        "baseUrl": "http://localhost:8000/v1",
        "apiKey": "$VLLM_API_KEY",
        "api": "openai-completions",
        "models": [{
          "id": "$SERVED_MODEL_NAME",
          "name": "GLM-4.7-Flash NVFP4",
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
      "contextTokens": 180000
    }
  },
  "channels": {
    ${TELEGRAM_CONFIG}
  },
  "gateway": {
    "mode": "local",
    "bind": "lan"
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$CLAWDBOT_HOME/clawdbot.json"
fi

# Auto-fix config to match current Clawdbot version's schema
echo "Running clawdbot doctor to validate/fix config..."
CLAWDBOT_STATE_DIR=$CLAWDBOT_HOME clawdbot doctor --fix || true

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

# Start Clawdbot gateway with password auth for web UI access
echo ""
echo "Starting Clawdbot gateway..."
CLAWDBOT_STATE_DIR=$CLAWDBOT_HOME clawdbot gateway --auth password --password "$CLAWDBOT_WEB_PASSWORD" &
GATEWAY_PID=$!

echo ""
echo "================================================"
echo "  Ready! (RTX 5090 Blackwell SM120)"
echo "  vLLM API: http://localhost:8000"
echo "  Clawdbot Gateway: ws://localhost:18789"
echo "  Web UI: https://<pod-id>-18789.proxy.runpod.net"
echo "  Web UI Password: $CLAWDBOT_WEB_PASSWORD"
echo "  Model: $SERVED_MODEL_NAME (NVFP4)"
echo "  Context: $MAX_MODEL_LEN tokens"
echo "  Cost: ~\$0.89/hr (36% savings vs A100)"
echo "================================================"

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
