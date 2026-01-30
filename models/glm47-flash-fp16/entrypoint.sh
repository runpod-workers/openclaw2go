#!/bin/bash
# entrypoint.sh - GLM-4.7-Flash FP16 + OpenClaw startup script
set -e
source /opt/openclaw/entrypoint-common.sh

echo "============================================"
echo "  GLM-4.7-Flash FP16 + OpenClaw Startup"
echo "============================================"
echo ""
echo "IMPORTANT: This requires vLLM NIGHTLY (not PyPI stable)!"
echo "Install: pip install -U vllm --pre --extra-index-url https://wheels.vllm.ai/nightly"
echo ""

# Auto-detect GPU and set optimal context length
# GLM-4.7-Flash: ~31GB model weights, KV cache ~160KB/token (BF16) or ~80KB/token (FP8)
detect_optimal_context() {
    local gpu_mem_mb
    gpu_mem_mb=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
    local gpu_name
    gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)

    echo "Detected GPU: $gpu_name with ${gpu_mem_mb}MB VRAM"

    if [ -z "$gpu_mem_mb" ]; then
        echo "32768"
    elif [ "$gpu_mem_mb" -ge 180000 ]; then
        echo "196608"
    elif [ "$gpu_mem_mb" -ge 140000 ]; then
        echo "131072"
    elif [ "$gpu_mem_mb" -ge 80000 ]; then
        echo "65536"
    elif [ "$gpu_mem_mb" -ge 48000 ]; then
        echo "32768"
    else
        echo "16384"
    fi
}

# Configuration from environment (with smart defaults)
MODEL_NAME="${MODEL_NAME:-zai-org/GLM-4.7-Flash}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-glm-4.7-flash}"
VLLM_API_KEY="${VLLM_API_KEY:-changeme}"
GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.92}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-}"
# glm47 parser requires vLLM nightly from wheels.vllm.ai
TOOL_CALL_PARSER="${TOOL_CALL_PARSER:-glm47}"
# Keep model on container disk (requires 100GB containerDiskInGb)
HF_HOME="${HF_HOME:-/root/.cache/huggingface}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/workspace/.openclaw}"
OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/workspace/openclaw}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
OPENCLAW_WEB_PASSWORD="${OPENCLAW_WEB_PASSWORD:-openclaw}"

if [ -z "$MAX_MODEL_LEN" ]; then
    MAX_MODEL_LEN=$(detect_optimal_context)
    echo "Auto-detected optimal context length: $MAX_MODEL_LEN tokens"
else
    echo "Using configured context length: $MAX_MODEL_LEN tokens"
fi

export HF_HOME
export OPENCLAW_STATE_DIR
export MAX_MODEL_LEN

BOT_CMD="openclaw"

# Set CUDA 13.1 paths for B200 (no-op on other GPUs if not installed)
if [ -d "/usr/local/cuda-13.1" ]; then
    export PATH=/usr/local/cuda-13.1/bin:$PATH
    export CUDA_HOME=/usr/local/cuda-13.1
    export LD_LIBRARY_PATH=/usr/local/cuda-13.1/lib64:$LD_LIBRARY_PATH
    echo "Using CUDA 13.1 for B200 support"
fi

# Ensure directories exist (HF cache on container disk, state on workspace)
mkdir -p "$HF_HOME" "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents/main/sessions" \
    "$OPENCLAW_STATE_DIR/credentials" "$OPENCLAW_WORKSPACE"
chmod 700 "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents" "$OPENCLAW_STATE_DIR/agents/main" \
    "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" 2>/dev/null || true

# Configure GitHub CLI
# Priority: 1) GITHUB_TOKEN env var, 2) Persisted config in /workspace/.config/gh
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring GitHub CLI from GITHUB_TOKEN..."
    echo "$GITHUB_TOKEN" | gh auth login --with-token
    gh auth setup-git

    # Persist for future restarts
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

# Show GitHub status if configured
if command -v gh &> /dev/null && gh auth status &> /dev/null; then
    gh auth status 2>&1 | head -5
fi

echo ""
echo "Configuration:"
echo "  Model: $MODEL_NAME"
echo "  Served as: $SERVED_MODEL_NAME"
echo "  Max context: $MAX_MODEL_LEN"
echo "  GPU utilization: $GPU_MEMORY_UTILIZATION"
echo "  Tool parser: $TOOL_CALL_PARSER"
if command -v nvcc &> /dev/null; then
    echo "  CUDA: $(nvcc --version | grep release | awk '{print $5}' | tr -d ',')"
fi
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

    # Calculate reasonable token limits based on context
    # Reserve 20% of context for compaction headroom
    CONTEXT_TOKENS=$((MAX_MODEL_LEN * 80 / 100))
    # Max output tokens: 8k or 10% of context, whichever is larger
    MAX_OUTPUT_TOKENS=$((MAX_MODEL_LEN / 10))
    [ "$MAX_OUTPUT_TOKENS" -lt 8192 ] && MAX_OUTPUT_TOKENS=8192
    # Reserve tokens for compaction: 15% of context
    RESERVE_TOKENS=$((MAX_MODEL_LEN * 15 / 100))

    cat > "$OPENCLAW_STATE_DIR/openclaw.json" << EOF
{
  "agents": {
    "defaults": {
      "model": { "primary": "local-vllm/${SERVED_MODEL_NAME}" },
      "workspace": "/workspace/openclaw",
      "contextTokens": ${CONTEXT_TOKENS},
      "systemPrompt": "Be concise and direct. Avoid unnecessary verbosity.",
      "compaction": {
        "mode": "safeguard",
        "reserveTokensFloor": ${RESERVE_TOKENS},
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": $((RESERVE_TOKENS / 2))
        }
      }
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
          "name": "GLM-4.7-Flash (Local)",
          "contextWindow": ${MAX_MODEL_LEN},
          "maxTokens": ${MAX_OUTPUT_TOKENS},
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

# Build vLLM command
# Note: GLM-4.7-Flash requires:
# - --block-size 32 (workaround for FlashInfer bug with head_size 256)
# - glm47 tool parser
# - glm45 reasoning parser
# - --kv-cache-dtype fp8 to reduce KV cache memory by ~50% (more context!)
VLLM_CMD="vllm serve $MODEL_NAME"
VLLM_CMD+=" --host 0.0.0.0 --port 8000"
VLLM_CMD+=" --max-model-len $MAX_MODEL_LEN"
VLLM_CMD+=" --gpu-memory-utilization $GPU_MEMORY_UTILIZATION"
VLLM_CMD+=" --kv-cache-dtype fp8"
VLLM_CMD+=" --served-model-name $SERVED_MODEL_NAME"
VLLM_CMD+=" --api-key $VLLM_API_KEY"
VLLM_CMD+=" --trust-remote-code"
VLLM_CMD+=" --enable-auto-tool-choice"
VLLM_CMD+=" --tool-call-parser $TOOL_CALL_PARSER"
VLLM_CMD+=" --reasoning-parser glm45"
VLLM_CMD+=" --block-size 32"

echo "Starting vLLM server..."
echo "Command: $VLLM_CMD"
echo ""

# Start vLLM in background
$VLLM_CMD &
VLLM_PID=$!

# Wait for vLLM to be ready
echo "Waiting for vLLM to start (model loading + CUDA graph capture)..."
MAX_WAIT=600  # 10 minutes should be enough for Flash model
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
