#!/bin/bash
set -e

echo "================================================"
echo "  GLM-4.7-Flash AWQ (4-bit) on A100 80GB"
echo "================================================"

# Start SSH for RunPod - setup authorized_keys and start sshd
echo "Setting up SSH..."
mkdir -p /var/run/sshd /root/.ssh
chmod 700 /root/.ssh

# Add PUBLIC_KEY to authorized_keys if provided
if [ -n "$PUBLIC_KEY" ]; then
    echo "$PUBLIC_KEY" > /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
    echo "SSH key configured"
fi

# Generate host keys if missing
if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    ssh-keygen -A
fi

# Start SSH daemon
/usr/sbin/sshd
echo "SSH server started"

# Download model if not present
MODEL_PATH="${MODEL_PATH:-/workspace/models/GLM-4.7-Flash-AWQ-4bit}"
if [ ! -d "$MODEL_PATH" ]; then
    echo "Downloading model to $MODEL_PATH..."
    mkdir -p /workspace/models
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
CLAWDBOT_HOME="${CLAWDBOT_HOME:-/workspace/.clawdbot}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

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
    --block-size 32 &

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
      "contextTokens": 98304
    }
  },
  "channels": {
    ${TELEGRAM_CONFIG}
  },
  "gateway": {
    "mode": "local"
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$CLAWDBOT_HOME/clawdbot.json"
fi

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

# Start Clawdbot gateway if Telegram token provided or config exists
echo ""
echo "Starting Clawdbot gateway..."
CLAWDBOT_STATE_DIR=$CLAWDBOT_HOME clawdbot gateway &
GATEWAY_PID=$!

echo ""
echo "================================================"
echo "  Ready!"
echo "  vLLM API: http://localhost:8000"
echo "  Clawdbot Gateway: ws://localhost:18789"
echo "  Model: $SERVED_MODEL_NAME"
echo "  Context: $MAX_MODEL_LEN tokens"
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
