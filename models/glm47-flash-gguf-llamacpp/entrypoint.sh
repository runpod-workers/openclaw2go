#!/bin/bash
# Don't exit on error - we want the container to stay alive for debugging
set +e

source /opt/openclaw/entrypoint-common.sh

# ============================================================
# Setup SSH server FIRST so we can always connect
# ============================================================
oc_setup_ssh_manual

echo ""
echo "================================================"
echo "  GLM-4.7-Flash GGUF on RTX 5090 (llama.cpp)"
echo "================================================"

# ============================================================
# Download model if not present
# ============================================================
MODEL_PATH="${MODEL_PATH:-/workspace/models/GLM-4.7-Flash-GGUF}"
MODEL_FILE="${MODEL_FILE:-GLM-4.7-Flash-Q4_K_M.gguf}"
MODEL_NAME="${MODEL_NAME:-unsloth/GLM-4.7-Flash-GGUF}"

if [ ! -f "$MODEL_PATH/$MODEL_FILE" ]; then
    echo "Downloading model to $MODEL_PATH..."
    mkdir -p "$MODEL_PATH"

    if [ -z "$HF_TOKEN" ]; then
        echo "TIP: Set HF_TOKEN env var for faster downloads"
    else
        echo "Using HF_TOKEN for authenticated downloads"
    fi

    # Download specific GGUF file using Python API (huggingface-cli not available in newer versions)
    echo "Attempting download with Python huggingface_hub..."
    python3 -c "
from huggingface_hub import hf_hub_download
hf_hub_download(
    repo_id='$MODEL_NAME',
    filename='$MODEL_FILE',
    local_dir='$MODEL_PATH',
    local_dir_use_symlinks=False
)
print('Download complete!')
" || {
        echo "ERROR: Model download failed!"
        echo "Debug info:"
        echo "  python3 location: $(which python3)"
        echo "  pip packages:"
        python3 -m pip list | grep -i hugging || echo "  huggingface not found"
        echo ""
        echo "Container staying alive for debugging. SSH in and fix manually."
        sleep infinity
    }
fi

# Set defaults
LLAMA_API_KEY="${LLAMA_API_KEY:-changeme}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-glm-4.7-flash}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-200000}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/workspace/.openclaw}"
OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/workspace/openclaw}"
export OPENCLAW_STATE_DIR OPENCLAW_WORKSPACE
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
OPENCLAW_WEB_PASSWORD="${OPENCLAW_WEB_PASSWORD:-openclaw}"

BOT_CMD="openclaw"
if ! command -v "$BOT_CMD" >/dev/null 2>&1; then
    echo "ERROR: openclaw command not found in PATH"
    echo "PATH=$PATH"
    echo "Container staying alive for debugging."
    sleep infinity
fi

echo "Starting llama.cpp server..."
echo "  Model: $MODEL_PATH/$MODEL_FILE"
echo "  Context: $MAX_MODEL_LEN tokens"
echo "  API Key: ${LLAMA_API_KEY:0:4}..."

# Start llama-server with OpenAI-compatible API
# Key flags:
#   -ngl 999: Offload all layers to GPU
#   -c: Context length (200k tokens)
#   --jinja: Required for GLM-4.7 chat template
#   -ctk q8_0 -ctv q8_0: Quantize KV cache to fit 200k in 32GB VRAM
#   --api-key: Enable API key authentication
llama-server \
    -m "$MODEL_PATH/$MODEL_FILE" \
    --host 0.0.0.0 \
    --port 8000 \
    -ngl 999 \
    -c "$MAX_MODEL_LEN" \
    --jinja \
    -ctk q8_0 \
    -ctv q8_0 \
    --api-key "$LLAMA_API_KEY" \
    2>&1 &

LLAMA_PID=$!

# Wait for llama-server to be ready
echo "Waiting for llama-server to start..."
MAX_WAIT=600
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "llama-server is ready!"
        break
    fi
    sleep 5
    WAITED=$((WAITED + 5))
    echo "  Waiting... ($WAITED/$MAX_WAIT seconds)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "ERROR: llama-server failed to start within $MAX_WAIT seconds"
    echo "Container will stay running for debugging."
fi

# Setup OpenClaw config
mkdir -p "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" "$OPENCLAW_WORKSPACE"
chmod 700 "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents" "$OPENCLAW_STATE_DIR/agents/main" \
    "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" 2>/dev/null || true

if [ ! -f "$OPENCLAW_STATE_DIR/openclaw.json" ]; then
    echo "Creating OpenClaw config..."

    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true, \"botToken\": \"${TELEGRAM_BOT_TOKEN}\" }"
    else
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true }"
    fi

    cat > "$OPENCLAW_STATE_DIR/openclaw.json" << EOF
{
  "models": {
    "providers": {
      "local-llamacpp": {
        "baseUrl": "http://localhost:8000/v1",
        "apiKey": "$LLAMA_API_KEY",
        "api": "openai-completions",
        "models": [{
          "id": "$SERVED_MODEL_NAME",
          "name": "GLM-4.7-Flash GGUF Q4_K_M (llama.cpp)",
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
      "model": { "primary": "local-llamacpp/$SERVED_MODEL_NAME" },
      "contextTokens": 180000,
      "workspace": "$OPENCLAW_WORKSPACE"
    }
  },
  "channels": {
    ${TELEGRAM_CONFIG}
  },
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": { "mode": "token", "token": "$OPENCLAW_WEB_PASSWORD" },
    "remote": { "token": "$OPENCLAW_WEB_PASSWORD" }
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json"
fi

# Auto-fix config
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

# Setup Claude Code environment (OpenAI-compatible)
export OPENAI_API_KEY="$LLAMA_API_KEY"
export OPENAI_BASE_URL="http://localhost:8000/v1"

# Start OpenClaw gateway (use token auth for URL parameter support)
echo ""
echo "Starting OpenClaw gateway..."
OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR OPENCLAW_GATEWAY_TOKEN="$OPENCLAW_WEB_PASSWORD" \
"$BOT_CMD" gateway --auth token --token "$OPENCLAW_WEB_PASSWORD" &
GATEWAY_PID=$!

echo ""
oc_print_ready "llama.cpp API" "$SERVED_MODEL_NAME" "$MAX_MODEL_LEN tokens (200k!)" "token" \
    "VRAM: ~28GB / 32GB"

# Handle shutdown
cleanup() {
    echo "Shutting down..."
    [ -n "$GATEWAY_PID" ] && kill $GATEWAY_PID 2>/dev/null
    kill $LLAMA_PID 2>/dev/null
    exit 0
}
trap cleanup SIGTERM SIGINT

# Keep running
if [ -n "$LLAMA_PID" ] && kill -0 $LLAMA_PID 2>/dev/null; then
    wait $LLAMA_PID
else
    echo "llama-server not running, keeping container alive for debugging..."
    sleep infinity
fi
