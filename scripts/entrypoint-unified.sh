#!/bin/bash
# Unified OpenClaw2Go entrypoint.
# Reads OPENCLAW_CONFIG, resolves a profile from the registry, and starts
# all services (LLM, Audio, Image, Web Proxy, OpenClaw Gateway) dynamically.
#
# Don't exit on error - we want the container to stay alive for debugging.
set +e

source /opt/openclaw/entrypoint-common.sh

# ============================================================
# Setup SSH server FIRST so we can always connect
# ============================================================
oc_setup_ssh_manual

echo ""
echo "================================================"
echo "  OpenClaw2Go — Unified Image"
echo "================================================"

# ============================================================
# CUDA sanity check
# ============================================================
oc_check_cuda() {
    if ! command -v python3 >/dev/null 2>&1; then
        oc_fatal_gpu "python3 is missing; unable to verify CUDA availability."
    fi
    local check_output=""
    check_output="$(python3 - <<'PY'
import ctypes
import os
import sys
from ctypes import c_int, c_char_p

def err_string(lib, code):
    msg = c_char_p()
    try:
        lib.cuGetErrorString(code, ctypes.byref(msg))
        return msg.value.decode() if msg.value else "unknown"
    except Exception:
        return "unknown"

try:
    lib = ctypes.CDLL("libcuda.so.1")
except OSError as exc:
    print(f"libcuda.so.1 load failed: {exc}")
    sys.exit(1)

lib.cuInit.argtypes = [ctypes.c_uint]
lib.cuInit.restype = c_int
err = lib.cuInit(0)
if err != 0:
    print(f"cuInit failed: {err} {err_string(lib, err)}")
    sys.exit(1)

lib.cuDeviceGetCount.argtypes = [ctypes.POINTER(c_int)]
lib.cuDeviceGetCount.restype = c_int
count = c_int()
err2 = lib.cuDeviceGetCount(ctypes.byref(count))
if err2 != 0 or count.value < 1:
    print(f"cuDeviceGetCount failed: {err2} {err_string(lib, err2)} count={count.value}")
    sys.exit(1)

visible = os.environ.get("CUDA_VISIBLE_DEVICES", "")
nvidia_visible = os.environ.get("NVIDIA_VISIBLE_DEVICES", "")
print(f"CUDA_VISIBLE_DEVICES={visible or '(unset)'}")
print(f"NVIDIA_VISIBLE_DEVICES={nvidia_visible or '(unset)'}")
print(f"cuda_device_count={count.value}")
PY
)"
    local check_status=$?
    if [ $check_status -ne 0 ]; then
        oc_fatal_gpu "$check_output"
    fi
}

oc_fatal_gpu() {
    local details="$1"
    echo ""
    echo "================================================================================"
    echo "!!!!!!!!!!!!!!!!!! GPU INITIALIZATION FAILED - ABORTING !!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "================================================================================"
    echo "The GPU or GPU driver has a problem that we cannot resolve."
    echo "Contact Runpod support at help@runpod.io"
    if [ -n "$details" ]; then
        echo "Details: $details"
    fi
    echo "================================================================================"
    exit 1
}

oc_check_cuda

# ============================================================
# Fetch external model registry (before profile resolution)
# ============================================================
echo ""
echo "Fetching model registry..."
FETCHED_DIR="$(openclaw2go registry fetch)" || true
if [ -n "$FETCHED_DIR" ] && [ -d "$FETCHED_DIR" ]; then
    export OPENCLAW_REGISTRY_DIR="$FETCHED_DIR"
    echo "Using registry: $FETCHED_DIR"
else
    echo "Using baked-in registry: ${OPENCLAW_REGISTRY_DIR:-/opt/openclaw/registry}"
fi

# ============================================================
# Resolve profile from OPENCLAW_CONFIG
# ============================================================
echo ""
echo "Resolving profile..."

RESOLVED_JSON="$(python3 /opt/openclaw/scripts/resolve-profile.py)" || {
    echo "ERROR: Profile resolution failed."
    echo "Container staying alive for debugging. SSH in and check OPENCLAW_CONFIG."
    sleep infinity
}

# Parse resolved profile
PROFILE_NAME="$(echo "$RESOLVED_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['profile']['name'])")"
PROFILE_ID="$(echo "$RESOLVED_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['profile']['id'])")"
WEB_PROXY_ENABLED="$(echo "$RESOLVED_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d['profile'].get('webProxy') else 'false')")"

echo "Profile: $PROFILE_NAME ($PROFILE_ID)"

# ============================================================
# Environment defaults
# ============================================================
LLAMA_API_KEY="${LLAMA_API_KEY:-changeme}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/workspace/.openclaw}"
OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/workspace/openclaw}"
OPENCLAW_WEB_PROXY_PORT="${OPENCLAW_WEB_PROXY_PORT:-8080}"

# Ensure flashinfer JIT cache dir exists on workspace volume (for any remaining runtime JIT)
if [ -d "/workspace" ]; then
    mkdir -p /workspace/.cache/flashinfer/jit
fi
OPENCLAW_WEB_PASSWORD="${OPENCLAW_WEB_PASSWORD:-changeme}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
export OPENCLAW_STATE_DIR OPENCLAW_WORKSPACE OPENCLAW_WEB_PROXY_PORT

if [ -n "${RUNPOD_POD_ID:-}" ] && [ -z "${OPENCLAW_IMAGE_PUBLIC_BASE_URL:-}" ]; then
    OPENCLAW_IMAGE_PUBLIC_BASE_URL="https://${RUNPOD_POD_ID}-${OPENCLAW_WEB_PROXY_PORT}.proxy.runpod.net"
    export OPENCLAW_IMAGE_PUBLIC_BASE_URL
fi

BOT_CMD="openclaw"
if ! command -v "$BOT_CMD" >/dev/null 2>&1; then
    echo "ERROR: openclaw command not found in PATH"
    echo "Container staying alive for debugging."
    sleep infinity
fi

# ============================================================
# Track PIDs for cleanup
# ============================================================
declare -A SERVICE_PIDS
LLAMA_PID=""
LLM_PORT=""
LLM_MODEL_NAME=""
LLM_CONTEXT=""

# ============================================================
# Download models and start services from resolved profile
# ============================================================
echo ""
echo "Starting services..."

# Process each service in the resolved profile
# Write service lines to a temp file to avoid pipe subshell (which loses PIDs and variables)
python3 -c "
import sys, json
data = json.loads('''$RESOLVED_JSON''')
for i, svc in enumerate(data['services']):
    role = svc['role']
    model = svc['model']
    engine = svc['engine']
    port = svc['port']
    overrides = svc.get('overrides', {})
    print(f'{i}|{role}|{model[\"id\"]}|{model[\"engine\"]}|{port}|{json.dumps(model)}|{json.dumps(engine)}|{json.dumps(overrides)}')
" > /tmp/oc_services.txt

while IFS='|' read -r idx role model_id engine_id port model_json engine_json overrides_json; do

    echo ""
    echo "--- Service [$role]: $model_id on port $port ---"

    # Extract model details
    MODEL_REPO="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('repo',''))")"
    MODEL_DOWNLOAD_DIR="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('downloadDir',''))")"
    MODEL_FILES="$(echo "$model_json" | python3 -c "import sys,json; print('|'.join(json.load(sys.stdin).get('files',[])))")"
    MODEL_NAME="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))")"
    MODEL_SERVED_AS="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('servedAs',''))")"
    ENGINE_BINARY="$(echo "$engine_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('binary',''))")"
    ENGINE_LIB_PATH="$(echo "$engine_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('libPath',''))")"
    ENGINE_VENV="$(echo "$engine_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('venvPath',''))")"
    ENGINE_TYPE="$(echo "$engine_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type',''))")"

    # Get overrides
    CONTEXT_LENGTH="$(echo "$overrides_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('contextLength',''))")"
    GPU_LAYERS="$(echo "$overrides_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('gpuLayers',''))")"

    # Download model files if needed
    DOWNLOAD_MODE="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('downloadMode','files'))")"

    if [ "$DOWNLOAD_MODE" = "repo" ]; then
        # Full repo download for vLLM models
        if [ -n "$MODEL_DOWNLOAD_DIR" ]; then
            if [ ! -f "$MODEL_DOWNLOAD_DIR/config.json" ]; then
                echo "Downloading model repo $MODEL_REPO..."
                mkdir -p "$MODEL_DOWNLOAD_DIR"
                python3 -c "
from huggingface_hub import snapshot_download
snapshot_download('$MODEL_REPO', local_dir='$MODEL_DOWNLOAD_DIR')
print('Done: $MODEL_REPO')
" || echo "  WARNING: Failed to download repo $MODEL_REPO"
            else
                echo "Model repo already present at $MODEL_DOWNLOAD_DIR"
            fi
        fi
    elif [ -n "$MODEL_DOWNLOAD_DIR" ] && [ -n "$MODEL_FILES" ]; then
        # Individual file download (llama.cpp models)
        IFS='|' read -ra FILES <<< "$MODEL_FILES"
        DOWNLOAD_NEEDED=false
        for f in "${FILES[@]}"; do
            if [ -n "$f" ] && [ ! -f "$MODEL_DOWNLOAD_DIR/$f" ]; then
                DOWNLOAD_NEEDED=true
                break
            fi
        done

        if [ "$DOWNLOAD_NEEDED" = true ]; then
            echo "Downloading model files from $MODEL_REPO..."
            mkdir -p "$MODEL_DOWNLOAD_DIR"
            for f in "${FILES[@]}"; do
                if [ -n "$f" ] && [ ! -f "$MODEL_DOWNLOAD_DIR/$f" ]; then
                    echo "  Downloading $f..."
                    python3 -c "
from huggingface_hub import hf_hub_download
hf_hub_download(
    repo_id='$MODEL_REPO',
    filename='$f',
    local_dir='$MODEL_DOWNLOAD_DIR',
    local_dir_use_symlinks=False
)
print('  Done: $f')
" || echo "  WARNING: Failed to download $f"
                fi
            done
        else
            echo "Model files already present at $MODEL_DOWNLOAD_DIR"
        fi
    fi

    # Start service based on engine type
    case "$role" in
        llm)
            if [ "$engine_id" = "vllm" ]; then
                # ── vLLM engine ──
                DEFAULT_CTX="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('defaults',{}).get('contextLength',65536))")"
                CTX="${CONTEXT_LENGTH:-$DEFAULT_CTX}"

                GPU_MEM_UTIL="$(echo "$overrides_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('gpuMemoryUtilization','0.92'))")"
                KV_CACHE_DTYPE="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('startDefaults',{}).get('kvCacheDtype','auto'))")"
                EXTRA_START_ARGS="$(echo "$model_json" | python3 -c "import sys,json; args=json.load(sys.stdin).get('extraStartArgs',[]); print(' '.join(args))")"

                # Activate vLLM venv
                source "$ENGINE_VENV/bin/activate"

                # Determine model path (pre-downloaded dir or HF repo name)
                if [ -n "$MODEL_DOWNLOAD_DIR" ] && [ -d "$MODEL_DOWNLOAD_DIR" ]; then
                    VLLM_MODEL="$MODEL_DOWNLOAD_DIR"
                else
                    VLLM_MODEL="$MODEL_REPO"
                fi

                echo "Starting vLLM LLM server..."
                echo "  Model: $VLLM_MODEL"
                echo "  Context: $CTX tokens, GPU util: $GPU_MEM_UTIL"
                if [ -n "$EXTRA_START_ARGS" ]; then
                    echo "  Extra args: $EXTRA_START_ARGS"
                fi

                VLLM_ARGS=(
                    serve "$VLLM_MODEL"
                    --host 0.0.0.0 --port "$port"
                    --max-model-len "$CTX"
                    --gpu-memory-utilization "$GPU_MEM_UTIL"
                    --served-model-name "$MODEL_SERVED_AS"
                    --api-key "$LLAMA_API_KEY"
                )

                if [ "$KV_CACHE_DTYPE" != "auto" ]; then
                    VLLM_ARGS+=(--kv-cache-dtype "$KV_CACHE_DTYPE")
                fi

                if [ -n "$EXTRA_START_ARGS" ]; then
                    read -ra EXTRA_ARGS <<< "$EXTRA_START_ARGS"
                    VLLM_ARGS+=("${EXTRA_ARGS[@]}")
                fi

                vllm "${VLLM_ARGS[@]}" 2>&1 &
                echo "$!" > /tmp/oc_llm_pid

                deactivate 2>/dev/null || true

            else
                # ── llama.cpp engine ──
                DEFAULT_CTX="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('defaults',{}).get('contextLength',150000))")"
                DEFAULT_LAYERS="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('startDefaults',{}).get('gpuLayers','999'))")"
                DEFAULT_PARALLEL="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('startDefaults',{}).get('parallel','1'))")"

                CTX="${CONTEXT_LENGTH:-$DEFAULT_CTX}"
                LAYERS="${GPU_LAYERS:-$DEFAULT_LAYERS}"
                PARALLEL="${LLAMA_PARALLEL:-$DEFAULT_PARALLEL}"
                FIRST_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f1)"

                # Parse extraStartArgs from model JSON (space-separated list)
                EXTRA_START_ARGS="$(echo "$model_json" | python3 -c "import sys,json; args=json.load(sys.stdin).get('extraStartArgs',[]); print(' '.join(args))")"

                # Parse extraEnvVars from model JSON (key=value pairs for env command)
                EXTRA_ENV_VARS="$(echo "$model_json" | python3 -c "
import sys,json
env_vars = json.load(sys.stdin).get('extraEnvVars', {})
print(' '.join(f'{k}={v}' for k,v in env_vars.items()))
")"

                echo "Starting LLM server..."
                echo "  Binary: $ENGINE_BINARY"
                echo "  Model: $MODEL_DOWNLOAD_DIR/$FIRST_FILE"
                echo "  Context: $CTX tokens, GPU layers: $LAYERS, Parallel: $PARALLEL"
                if [ -n "$EXTRA_START_ARGS" ]; then
                    echo "  Extra args: $EXTRA_START_ARGS"
                fi
                if [ -n "$EXTRA_ENV_VARS" ]; then
                    echo "  Extra env vars: $EXTRA_ENV_VARS"
                fi

                # Build args array
                LLM_ARGS=(
                    -m "$MODEL_DOWNLOAD_DIR/$FIRST_FILE"
                    --host 0.0.0.0
                    --port "$port"
                    -ngl "$LAYERS"
                    --parallel "$PARALLEL"
                    -c "$CTX"
                    --jinja
                    -ctk q8_0
                    -ctv q8_0
                    --api-key "$LLAMA_API_KEY"
                )

                # Append extra start args if present
                if [ -n "$EXTRA_START_ARGS" ]; then
                    read -ra EXTRA_ARGS <<< "$EXTRA_START_ARGS"
                    LLM_ARGS+=("${EXTRA_ARGS[@]}")
                fi

                # Build env command with optional extra env vars
                ENV_CMD=(env LD_LIBRARY_PATH="$ENGINE_LIB_PATH")
                if [ -n "$EXTRA_ENV_VARS" ]; then
                    read -ra ENV_PAIRS <<< "$EXTRA_ENV_VARS"
                    ENV_CMD+=("${ENV_PAIRS[@]}")
                fi

                "${ENV_CMD[@]}" \
                    "$ENGINE_BINARY" "${LLM_ARGS[@]}" \
                    2>&1 &

                echo "$!" > /tmp/oc_llm_pid
            fi

            # Write provider name from model JSON
            PROVIDER_NAME="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('provider',{}).get('name','local-llamacpp'))")"
            echo "$PROVIDER_NAME" > /tmp/oc_llm_provider

            echo "$port" > /tmp/oc_llm_port
            echo "$MODEL_SERVED_AS" > /tmp/oc_llm_model_name
            echo "$CTX" > /tmp/oc_llm_context
            ;;

        audio)
            FIRST_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f1)"
            SECOND_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f2)"
            THIRD_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f3)"
            FOURTH_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f4)"

            echo "Starting Audio server (TTS/STT)..."
            echo "  Binary: $ENGINE_BINARY"
            echo "  Model: $MODEL_DOWNLOAD_DIR/$FIRST_FILE"
            echo "  Port: $port (GPU accelerated)"

            env LD_LIBRARY_PATH="$ENGINE_LIB_PATH" \
                "$ENGINE_BINARY" \
                -m "$MODEL_DOWNLOAD_DIR/$FIRST_FILE" \
                -mm "$MODEL_DOWNLOAD_DIR/$SECOND_FILE" \
                -mv "$MODEL_DOWNLOAD_DIR/$THIRD_FILE" \
                --tts-speaker-file "$MODEL_DOWNLOAD_DIR/$FOURTH_FILE" \
                -ngl 99 \
                --host 0.0.0.0 \
                --port "$port" \
                2>&1 &

            echo "$!" > /tmp/oc_audio_pid
            ;;

        image)
            echo "Starting Image generation server..."
            echo "  Model: $MODEL_REPO"
            echo "  Port: $port (GPU accelerated)"

            if [ -n "$ENGINE_VENV" ] && [ -d "$ENGINE_VENV" ]; then
                source "$ENGINE_VENV/bin/activate"
            fi

            "$ENGINE_BINARY" --model "$MODEL_REPO" --port "$port" > /tmp/image-server.log 2>&1 &
            echo "$!" > /tmp/oc_image_pid

            if [ -n "$ENGINE_VENV" ] && [ -d "$ENGINE_VENV" ]; then
                deactivate 2>/dev/null || true
            fi
            ;;
    esac

done < /tmp/oc_services.txt

# Read PIDs and metadata from temp files
LLAMA_PID="$(cat /tmp/oc_llm_pid 2>/dev/null || echo "")"
LLM_PORT="$(cat /tmp/oc_llm_port 2>/dev/null || echo "8000")"
LLM_MODEL_NAME="$(cat /tmp/oc_llm_model_name 2>/dev/null || echo "glm-4.7-flash")"
LLM_CONTEXT="$(cat /tmp/oc_llm_context 2>/dev/null || echo "150000")"
LLM_PROVIDER_NAME="$(cat /tmp/oc_llm_provider 2>/dev/null || echo "local-llamacpp")"
AUDIO_PID="$(cat /tmp/oc_audio_pid 2>/dev/null || echo "")"
IMAGE_PID="$(cat /tmp/oc_image_pid 2>/dev/null || echo "")"

# Start web proxy if enabled
WEB_PROXY_PID=""
if [ "$WEB_PROXY_ENABLED" = "true" ]; then
    echo ""
    echo "Starting OpenClaw media web proxy..."
    openclaw-web-proxy --port "$OPENCLAW_WEB_PROXY_PORT" --web-root "/opt/openclaw/web" > /tmp/openclaw-web-proxy.log 2>&1 &
    WEB_PROXY_PID=$!
fi

# ============================================================
# Wait for LLM health check
# ============================================================
if [ -n "$LLAMA_PID" ]; then
    echo ""
    echo "Waiting for LLM server to start..."
    MAX_WAIT=600
    WAITED=0
    while [ $WAITED -lt $MAX_WAIT ]; do
        if curl -s "http://localhost:${LLM_PORT}/health" > /dev/null 2>&1; then
            echo "LLM server is ready!"
            break
        fi
        sleep 5
        WAITED=$((WAITED + 5))
        echo "  Waiting... ($WAITED/$MAX_WAIT seconds)"
    done

    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "ERROR: LLM server failed to start within $MAX_WAIT seconds"
        echo "Container will stay running for debugging."
    fi
fi

# ============================================================
# Setup OpenClaw config
# ============================================================
mkdir -p "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" "$OPENCLAW_WORKSPACE"
mkdir -p "$OPENCLAW_WORKSPACE/images" "$OPENCLAW_WORKSPACE/audio"
chmod 700 "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents" "$OPENCLAW_STATE_DIR/agents/main" \
    "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" 2>/dev/null || true

# Install tool_result hook plugins into workspace (if bundled)
OPENCLAW_EXT_DIR="$OPENCLAW_WORKSPACE/.openclaw/extensions"
if [ -d "/opt/openclaw/plugins/toolresult-images" ]; then
    mkdir -p "$OPENCLAW_EXT_DIR"
    if [ ! -d "$OPENCLAW_EXT_DIR/toolresult-images" ]; then
        cp -r "/opt/openclaw/plugins/toolresult-images" "$OPENCLAW_EXT_DIR/"
    fi
fi

if [ ! -f "$OPENCLAW_STATE_DIR/openclaw.json" ]; then
    echo "Creating OpenClaw config from resolved profile..."

    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true, \"botToken\": \"${TELEGRAM_BOT_TOKEN}\" }"
    else
        TELEGRAM_CONFIG="\"telegram\": { \"enabled\": true }"
    fi

    cat > "$OPENCLAW_STATE_DIR/openclaw.json" << EOF
{
  "models": {
    "providers": {
      "$LLM_PROVIDER_NAME": {
        "baseUrl": "http://localhost:${LLM_PORT}/v1",
        "apiKey": "$LLAMA_API_KEY",
        "api": "openai-completions",
        "models": [{
          "id": "$LLM_MODEL_NAME",
          "name": "${PROFILE_NAME} LLM",
          "contextWindow": $LLM_CONTEXT,
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
      "model": { "primary": "$LLM_PROVIDER_NAME/$LLM_MODEL_NAME" },
      "contextTokens": 135000,
      "workspace": "$OPENCLAW_WORKSPACE"
    }
  },
  "channels": {
    ${TELEGRAM_CONFIG}
  },
  "skills": {
    "load": { "extraDirs": ["/opt/openclaw/skills"] },
    "entries": {
      "openai-image-gen": { "enabled": false },
      "nano-banana-pro": { "enabled": false }
    }
  },
  "plugins": {
    "load": { "paths": ["$OPENCLAW_WORKSPACE/.openclaw/extensions"] },
    "entries": { "toolresult-images": { "enabled": true } }
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

IMAGE_BASE_URL_FILE="$OPENCLAW_WORKSPACE/image-base-url.txt"
if [ -n "${OPENCLAW_IMAGE_PUBLIC_BASE_URL:-}" ] && [ ! -f "$IMAGE_BASE_URL_FILE" ]; then
    echo "$OPENCLAW_IMAGE_PUBLIC_BASE_URL" > "$IMAGE_BASE_URL_FILE"
fi

# Auto-fix config
echo "Running openclaw doctor to validate/fix config..."
OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR "$BOT_CMD" doctor --fix || true
chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json" 2>/dev/null || true
oc_sync_skills_disable "openai-image-gen,nano-banana-pro"
oc_sync_gateway_auth "token"

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
export OPENAI_BASE_URL="http://localhost:${LLM_PORT}/v1"

# ============================================================
# Start OpenClaw gateway
# ============================================================
echo ""
echo "Starting OpenClaw gateway..."
OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR OPENCLAW_GATEWAY_TOKEN="$OPENCLAW_WEB_PASSWORD" \
"$BOT_CMD" gateway --auth token --token "$OPENCLAW_WEB_PASSWORD" &
GATEWAY_PID=$!

# ============================================================
# Print ready banner with VRAM breakdown
# ============================================================
MEDIA_PROXY_URL=""
if [ -n "${RUNPOD_POD_ID:-}" ]; then
    MEDIA_PROXY_URL="https://${RUNPOD_POD_ID}-${OPENCLAW_WEB_PROXY_PORT}.proxy.runpod.net"
fi

# Build VRAM summary from resolved profile
VRAM_SUMMARY="$(echo "$RESOLVED_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
parts = []
for svc in data['services']:
    model = svc['model']
    vram = model['vram']['model'] + model['vram']['overhead']
    parts.append(f\"{svc['role'].upper()} ~{vram // 1000}GB\")
total = data['profile'].get('vramTotal', 0)
gpu_vram = data.get('gpuDetected', {}).get('vramMb', 0) or data.get('gpu', {}).get('vramMb', 0)
print(f\"VRAM: {' + '.join(parts)} = ~{total // 1000}GB / {gpu_vram // 1000}GB\")
" 2>/dev/null || echo "VRAM: see profile")"

echo ""
oc_print_ready "LLM API" "$LLM_MODEL_NAME" "$LLM_CONTEXT tokens" "token" \
    "$VRAM_SUMMARY" \
    "Profile: $PROFILE_NAME ($PROFILE_ID)" \
    "Media UI (local): http://localhost:${OPENCLAW_WEB_PROXY_PORT}" \
    "${MEDIA_PROXY_URL:+Media UI (public): ${MEDIA_PROXY_URL}}"

# Print service details
if [ -n "$AUDIO_PID" ]; then
    echo ""
    echo "  Audio Server (internal): http://localhost:8001"
    echo "    - openclaw-tts \"Hello world\" --output /tmp/hello.wav"
    echo "    - openclaw-stt /path/to/audio.wav"
fi

if [ -n "$IMAGE_PID" ]; then
    echo ""
    echo "  Image Server (internal): http://localhost:8002"
    echo "    - openclaw-image-gen --prompt \"A robot\" --output /tmp/robot.png"
fi

if [ "$WEB_PROXY_ENABLED" = "true" ]; then
    echo ""
    echo "  Media UI: http://localhost:${OPENCLAW_WEB_PROXY_PORT}"
fi

# ============================================================
# Handle shutdown
# ============================================================
cleanup() {
    echo "Shutting down..."
    [ -n "$GATEWAY_PID" ] && kill $GATEWAY_PID 2>/dev/null
    [ -n "$IMAGE_PID" ] && kill $IMAGE_PID 2>/dev/null
    [ -n "$AUDIO_PID" ] && kill $AUDIO_PID 2>/dev/null
    [ -n "$WEB_PROXY_PID" ] && kill $WEB_PROXY_PID 2>/dev/null
    [ -n "$LLAMA_PID" ] && kill $LLAMA_PID 2>/dev/null
    exit 0
}
trap cleanup SIGTERM SIGINT

# Keep running
if [ -n "$LLAMA_PID" ] && kill -0 $LLAMA_PID 2>/dev/null; then
    wait $LLAMA_PID
else
    echo "LLM server not running, keeping container alive for debugging..."
    sleep infinity
fi
