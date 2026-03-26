#!/bin/bash
# Don't use set -e - we want to continue even if some commands fail

source /opt/openclaw/entrypoint-common.sh

echo "================================================"
echo "  GLM-4.7-Flash NVFP4 on RTX 5090 (Blackwell)"
echo "================================================"

# Setup SSH for remote access (mirrors Runpod's /start.sh behavior)
oc_setup_ssh_manual || echo "SSH setup had issues but continuing..."

# Persist vLLM cache (CUDA graphs, torch compile) on network storage
# This speeds up subsequent pod starts by reusing cached compiled kernels
export XDG_CACHE_HOME=/workspace/.cache
export HF_HOME=/workspace/.cache/huggingface
mkdir -p /workspace/.cache/vllm /workspace/.cache/huggingface

# Download model if not present
MODEL_PATH="${MODEL_PATH:-/workspace/models/GLM-4.7-Flash-NVFP4}"
if [ ! -d "$MODEL_PATH" ] || [ -z "$(ls -A $MODEL_PATH 2>/dev/null)" ]; then
    echo "Downloading model to $MODEL_PATH..."
    mkdir -p /workspace/models

    # Check for HF_TOKEN for faster downloads
    if [ -z "$HF_TOKEN" ]; then
        echo "TIP: Set HF_TOKEN env var for faster downloads (https://huggingface.co/settings/tokens)"
    else
        echo "Using HF_TOKEN for authenticated downloads"
    fi

    # Use huggingface-cli for downloading
    huggingface-cli download GadflyII/GLM-4.7-Flash-NVFP4 --local-dir "$MODEL_PATH" || {
        echo "ERROR: Failed to download model"
        echo "Keeping container alive for debugging..."
        sleep infinity
    }
fi

# Set defaults
VLLM_API_KEY="${VLLM_API_KEY:-changeme}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-glm-4.7-flash}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-200000}"
oc_create_path_symlinks
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/workspace/openclaw}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
# Web UI password - users enter this to access the OpenClaw control panel
OPENCLAW_WEB_PASSWORD="${OPENCLAW_WEB_PASSWORD:-changeme}"

BOT_CMD="openclaw"

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
    echo "Container will stay running for debugging. Check logs with: ps aux"
    # Don't exit - keep container running for debugging
fi

# Setup OpenClaw config
mkdir -p "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents/main/sessions" \
    "$OPENCLAW_STATE_DIR/credentials" "$OPENCLAW_WORKSPACE"
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
    # contextTokens: 180000 leaves room for output within 200K context
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
      "contextTokens": 180000,
      "workspace": "$OPENCLAW_WORKSPACE"
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
    "auth": { "mode": "password", "password": "$OPENCLAW_WEB_PASSWORD" }
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json"
fi

# Auto-fix config to match current OpenClaw version's schema
echo "Running openclaw doctor to validate/fix config..."
OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR "$BOT_CMD" doctor --fix 2>/dev/null || true
chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json" 2>/dev/null || true
oc_sync_gateway_auth "password"

# Setup GitHub CLI if token provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring GitHub CLI..."
    echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null || true
    gh auth setup-git 2>/dev/null || true
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
OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR "$BOT_CMD" gateway --auth password --password "$OPENCLAW_WEB_PASSWORD" 2>/dev/null &
GATEWAY_PID=$!

echo ""
oc_print_ready "vLLM API" "$SERVED_MODEL_NAME (NVFP4)" "$MAX_MODEL_LEN tokens" "password" \
    "Cost: ~\$0.89/hr (36% savings vs A100)"

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
