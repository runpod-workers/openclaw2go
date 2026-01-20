#!/bin/bash
# entrypoint.sh - GLM-4.7-Flash FP16 + Clawdbot startup script
set -e

echo "============================================"
echo "  GLM-4.7-Flash FP16 + Clawdbot Startup"
echo "============================================"
echo ""
echo "IMPORTANT: This requires vLLM NIGHTLY (not PyPI stable)!"
echo "Install: pip install -U vllm --pre --extra-index-url https://wheels.vllm.ai/nightly"
echo ""

# Auto-detect GPU and set optimal context length
# GLM-4.7-Flash: ~31GB model weights, KV cache ~160KB/token (BF16) or ~80KB/token (FP8)
detect_optimal_context() {
    local gpu_mem_mb=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
    local gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)

    echo "Detected GPU: $gpu_name with ${gpu_mem_mb}MB VRAM"

    # Calculate optimal context based on GPU memory
    # Model weights: ~31GB, leaving rest for KV cache
    # Using conservative estimates with FP8 KV cache
    if [ -z "$gpu_mem_mb" ]; then
        echo "32768"  # Fallback
    elif [ "$gpu_mem_mb" -ge 180000 ]; then
        # B200 180GB: Can do 200k+ easily
        echo "196608"  # 192k
    elif [ "$gpu_mem_mb" -ge 140000 ]; then
        # H200 141GB: Can do ~150k
        echo "131072"  # 128k
    elif [ "$gpu_mem_mb" -ge 80000 ]; then
        # H100/A100 80GB: Can do ~64k safely, maybe 96k with FP8 KV
        echo "65536"   # 64k
    elif [ "$gpu_mem_mb" -ge 48000 ]; then
        # A100 40GB or similar: ~32k
        echo "32768"   # 32k
    else
        # Smaller GPUs
        echo "16384"   # 16k
    fi
}

# Configuration from environment (with smart defaults)
MODEL_NAME="${MODEL_NAME:-zai-org/GLM-4.7-Flash}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-glm-4.7-flash}"
VLLM_API_KEY="${VLLM_API_KEY:-changeme}"
GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.92}"
# glm47 parser requires vLLM nightly from wheels.vllm.ai
TOOL_CALL_PARSER="${TOOL_CALL_PARSER:-glm47}"
# Keep model on container disk (requires 100GB containerDiskInGb)
HF_HOME="${HF_HOME:-/root/.cache/huggingface}"
CLAWDBOT_STATE_DIR="${CLAWDBOT_STATE_DIR:-/workspace/.clawdbot}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

# Auto-detect optimal context if not explicitly set
if [ -z "$MAX_MODEL_LEN" ]; then
    MAX_MODEL_LEN=$(detect_optimal_context)
    echo "Auto-detected optimal context length: $MAX_MODEL_LEN tokens"
else
    echo "Using configured context length: $MAX_MODEL_LEN tokens"
fi

export HF_HOME
export CLAWDBOT_STATE_DIR
export MAX_MODEL_LEN

# Set CUDA 13.1 paths for B200 (no-op on other GPUs if not installed)
if [ -d "/usr/local/cuda-13.1" ]; then
    export PATH=/usr/local/cuda-13.1/bin:$PATH
    export CUDA_HOME=/usr/local/cuda-13.1
    export LD_LIBRARY_PATH=/usr/local/cuda-13.1/lib64:$LD_LIBRARY_PATH
    echo "Using CUDA 13.1 for B200 support"
fi

# Ensure directories exist (HF cache on container disk, state on workspace)
mkdir -p "$HF_HOME" "$CLAWDBOT_STATE_DIR" /workspace/clawd

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

# Initialize Clawdbot config if not exists
if [ ! -f "$CLAWDBOT_STATE_DIR/clawdbot.json" ]; then
    echo "Creating Clawdbot configuration..."

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

    cat > "$CLAWDBOT_STATE_DIR/clawdbot.json" << EOF
{
  "agents": {
    "defaults": {
      "model": { "primary": "local-vllm/${SERVED_MODEL_NAME}" },
      "workspace": "/workspace/clawd",
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
    "mode": "local"
  },
  "logging": { "level": "info" }
}
EOF
    chmod 600 "$CLAWDBOT_STATE_DIR/clawdbot.json"
    echo "Config created. Telegram token: ${TELEGRAM_BOT_TOKEN:+provided}${TELEGRAM_BOT_TOKEN:-NOT SET - add manually}"
else
    echo "Existing config found at $CLAWDBOT_STATE_DIR/clawdbot.json - preserving it"
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

# Start Clawdbot gateway
echo ""
echo "Starting Clawdbot gateway..."
CLAWDBOT_STATE_DIR=$CLAWDBOT_STATE_DIR clawdbot gateway &
GATEWAY_PID=$!

echo ""
echo "============================================"
echo "  Services Running"
echo "============================================"
echo "  vLLM API: http://localhost:8000"
echo "  Clawdbot Gateway: ws://localhost:18789"
echo ""
echo "  vLLM PID: $VLLM_PID"
echo "  Gateway PID: $GATEWAY_PID"
echo "============================================"
echo ""

# Keep container running and handle signals
trap "kill $VLLM_PID $GATEWAY_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either process to exit
wait -n $VLLM_PID $GATEWAY_PID
EXIT_CODE=$?

echo "A process exited with code $EXIT_CODE"
kill $VLLM_PID $GATEWAY_PID 2>/dev/null || true
exit $EXIT_CODE
