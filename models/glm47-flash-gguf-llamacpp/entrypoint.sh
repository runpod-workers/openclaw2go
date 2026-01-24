#!/bin/bash
# Don't exit on error - we want the container to stay alive for debugging
set +e

# ============================================================
# Setup SSH server FIRST so we can always connect
# ============================================================
echo "Setting up SSH server..."

# Generate host keys if they don't exist
if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N ''
    ssh-keygen -t ecdsa -f /etc/ssh/ssh_host_ecdsa_key -N ''
    ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ''
fi

# Setup authorized_keys from PUBLIC_KEY env var
if [ -n "$PUBLIC_KEY" ]; then
    mkdir -p ~/.ssh
    echo "$PUBLIC_KEY" > ~/.ssh/authorized_keys
    chmod 700 ~/.ssh
    chmod 600 ~/.ssh/authorized_keys
    echo "SSH public key configured"
fi

# Start SSH daemon
mkdir -p /var/run/sshd
/usr/sbin/sshd
echo "SSH server started on port 22"

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
CLAWDBOT_HOME="${CLAWDBOT_HOME:-/workspace/.clawdbot}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
CLAWDBOT_WEB_PASSWORD="${CLAWDBOT_WEB_PASSWORD:-clawdbot}"

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

# Setup Clawdbot config
mkdir -p "$CLAWDBOT_HOME"

if [ ! -f "$CLAWDBOT_HOME/clawdbot.json" ]; then
    echo "Creating Clawdbot config..."

    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true, \"botToken\": \"${TELEGRAM_BOT_TOKEN}\" }"
    else
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true }"
    fi

    cat > "$CLAWDBOT_HOME/clawdbot.json" << EOF
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
      "contextTokens": 180000
    }
  },
  "channels": {
    ${TELEGRAM_CONFIG}
  },
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": { "token": "$CLAWDBOT_WEB_PASSWORD" },
    "remote": { "token": "$CLAWDBOT_WEB_PASSWORD" }
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$CLAWDBOT_HOME/clawdbot.json"
fi

# Auto-fix config
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

# Setup Claude Code environment (OpenAI-compatible)
export OPENAI_API_KEY="$LLAMA_API_KEY"
export OPENAI_BASE_URL="http://localhost:8000/v1"

# Start Clawdbot gateway (use token auth for URL parameter support)
echo ""
echo "Starting Clawdbot gateway..."
CLAWDBOT_STATE_DIR=$CLAWDBOT_HOME CLAWDBOT_GATEWAY_TOKEN="$CLAWDBOT_WEB_PASSWORD" clawdbot gateway --auth token --token "$CLAWDBOT_WEB_PASSWORD" &
GATEWAY_PID=$!

echo ""
echo "================================================"
echo "  Ready!"
echo "  llama.cpp API: http://localhost:8000"
echo "  Clawdbot Gateway: ws://localhost:18789"
echo "  Web UI: https://<pod-id>-18789.proxy.runpod.net/?token=$CLAWDBOT_WEB_PASSWORD"
echo "  Web UI Token: $CLAWDBOT_WEB_PASSWORD"
echo "  Model: $SERVED_MODEL_NAME"
echo "  Context: $MAX_MODEL_LEN tokens (200k!)"
echo "  VRAM: ~28GB / 32GB"
echo "================================================"

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
