#!/bin/bash
# Unified agent2go entrypoint.
# Reads A2GO_CONFIG, resolves a profile from the registry, and starts
# all services (LLM, Audio, Image, Vision, Embedding, Reranking, TTS,
# Web Proxy, OpenClaw Gateway) dynamically.
#
# Don't exit on error - we want the container to stay alive for debugging.
set +e

source /opt/a2go/entrypoint-common.sh

# ============================================================
# Symlink ~/.openclaw -> /workspace/.openclaw FIRST
# (must happen before anything creates ~/.openclaw)
# ============================================================
oc_create_path_symlinks

# ============================================================
# Setup SSH server so we can always connect
# ============================================================
oc_setup_ssh_manual

echo ""
echo "================================================"
echo "  agent2go — Unified Image"
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
FETCHED_DIR="$(a2go-registry registry fetch)" || true
if [ -n "$FETCHED_DIR" ] && [ -d "$FETCHED_DIR" ]; then
    export A2GO_REGISTRY_DIR="$FETCHED_DIR"
    echo "Using registry: $FETCHED_DIR"
else
    echo "Using baked-in registry: ${A2GO_REGISTRY_DIR:-/opt/a2go/registry}"
fi

# ============================================================
# Resolve profile from A2GO_CONFIG
# ============================================================
echo ""
echo "Resolving profile..."

RESOLVED_JSON="$(python3 /opt/a2go/scripts/resolve-profile.py)" || {
    echo "ERROR: Profile resolution failed."
    echo "Container staying alive for debugging. SSH in and check A2GO_CONFIG."
    sleep infinity
}

# Parse resolved profile
AGENT="$(echo "$RESOLVED_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent'])")"
PROFILE_NAME="$(echo "$RESOLVED_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['profile']['name'])")"
PROFILE_ID="$(echo "$RESOLVED_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['profile']['id'])")"
WEB_PROXY_ENABLED="$(echo "$RESOLVED_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d['profile'].get('webProxy') else 'false')")"

echo "Agent: $AGENT"
echo "Profile: $PROFILE_NAME ($PROFILE_ID)"

if [ -z "$AGENT" ]; then
    echo "ERROR: resolved profile has no 'agent' field. Container staying alive for debugging."
    sleep infinity
fi

echo "$RESOLVED_JSON" > /tmp/oc_resolved.json

# ============================================================
# Environment defaults
# ============================================================
A2GO_API_KEY="${A2GO_API_KEY:-changeme}"

# ── Canonical A2GO_* env vars with backward-compat fallback to OPENCLAW_* ──
# Users can set either; A2GO_* takes precedence. Old names supported forever.
A2GO_AUTH_TOKEN="${A2GO_AUTH_TOKEN:-${OPENCLAW_WEB_PASSWORD:-changeme}}"
A2GO_STATE_DIR="${A2GO_STATE_DIR:-${OPENCLAW_STATE_DIR:-$HOME/.openclaw}}"
A2GO_WORKSPACE="${A2GO_WORKSPACE:-${OPENCLAW_WORKSPACE:-/workspace/openclaw}}"
A2GO_WEB_PROXY_PORT="${A2GO_WEB_PROXY_PORT:-8080}"

# Hermes blocklists placeholder secrets ("changeme", "dummy", etc.)
# When using Hermes with a placeholder key, substitute a non-blocked value
# that still matches what the LLM server expects.
if [ "$AGENT" = "hermes" ] && [ "$A2GO_API_KEY" = "changeme" ]; then
    A2GO_API_KEY="a2go-local-changeme"
    A2GO_AUTH_TOKEN="${A2GO_AUTH_TOKEN:-a2go-local-changeme}"
    echo "Note: Hermes requires non-placeholder API keys. Using 'a2go-local-changeme' instead of 'changeme'."
fi

# Bridge to agent-specific env vars — agents read these, not A2GO_*
OPENCLAW_STATE_DIR="$A2GO_STATE_DIR"
OPENCLAW_WORKSPACE="$A2GO_WORKSPACE"
OPENCLAW_WEB_PASSWORD="$A2GO_AUTH_TOKEN"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
export OPENCLAW_STATE_DIR OPENCLAW_WORKSPACE A2GO_WEB_PROXY_PORT

if [ -n "${RUNPOD_POD_ID:-}" ] && [ -z "${A2GO_IMAGE_PUBLIC_BASE_URL:-}" ]; then
    A2GO_IMAGE_PUBLIC_BASE_URL="https://${RUNPOD_POD_ID}-${A2GO_WEB_PROXY_PORT}.proxy.runpod.net"
    export A2GO_IMAGE_PUBLIC_BASE_URL
fi

# Compute allowed origin for OpenClaw Control UI CORS
if [ -n "${RUNPOD_POD_ID:-}" ]; then
    A2GO_ALLOWED_ORIGINS_JSON="[\"https://${RUNPOD_POD_ID}-18789.proxy.runpod.net\"]"
else
    A2GO_ALLOWED_ORIGINS_JSON='[]'
fi
A2GO_DISABLE_DEVICE_AUTH="${A2GO_DISABLE_DEVICE_AUTH:-true}"

BOT_CMD="openclaw"
if [ "$AGENT" = "openclaw" ] && ! command -v "$BOT_CMD" >/dev/null 2>&1; then
    echo "ERROR: openclaw command not found in PATH"
    echo "Container staying alive for debugging."
    sleep infinity
fi
# Resolve hermes binary (check PATH, then known install locations)
HERMES_CMD=""
if [ "$AGENT" = "hermes" ]; then
    if command -v "hermes" >/dev/null 2>&1; then
        HERMES_CMD="hermes"
    elif [ -x "$HOME/.local/bin/hermes" ]; then
        HERMES_CMD="$HOME/.local/bin/hermes"
    elif [ -x "$HOME/.hermes/hermes-agent/venv/bin/hermes" ]; then
        HERMES_CMD="$HOME/.hermes/hermes-agent/venv/bin/hermes"
    else
        echo "ERROR: hermes command not found in PATH or known locations"
        echo "Container staying alive for debugging."
        sleep infinity
    fi
    echo "Hermes binary: $HERMES_CMD"
fi

# ============================================================
# Track PIDs for cleanup
# ============================================================
declare -A SERVICE_PIDS
LLAMA_PID=""
LLM_PORT=""
LLM_MODEL_NAME=""
LLM_CONTEXT=""

# Accumulate media plugins for the unified a2go-media-server
MEDIA_PLUGINS_JSON="[]"
MEDIA_SERVER_PORT="${A2GO_WEB_PROXY_PORT:-8080}"

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
    MODEL_PLUGIN="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('plugin',''))")"
    ENGINE_TYPE="$(echo "$engine_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type',''))")"
    ENGINE_BINARY_TTS="$(echo "$engine_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('binaryTts',''))")"

    # Get overrides
    CONTEXT_LENGTH="$(echo "$overrides_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('contextLength',''))")"
    GPU_LAYERS="$(echo "$overrides_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('gpuLayers',''))")"
    VISION_AS_LLM="$(echo "$overrides_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('visionAsLlm') else 'false')")"

    # Download model files if needed
    DOWNLOAD_MODE="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('downloadMode','files'))")"

    if [ "$DOWNLOAD_MODE" = "repo" ]; then
        # Full repo download (e.g. for models needing config.json)
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

    # Start service based on role
    case "$role" in
        llm)
          if [ "$ENGINE_TYPE" = "npm-global" ] || [ "$engine_id" = "wandler" ]; then
            # ── LLM via Wandler (ONNX) ──
            # Wandler runs LLM + STT in one process, so scan for a wandler audio model
            # and pass --stt alongside --llm
            WANDLER_STT_REPO="$(python3 -c "
import sys, json
data = json.loads('''$RESOLVED_JSON''')
for svc in data['services']:
    if svc['role'] == 'audio' and svc.get('engine',{}).get('id','') == 'wandler':
        print(svc['model']['repo'])
        break
" 2>/dev/null)"

            echo "Starting Wandler server..."
            echo "  LLM: $MODEL_REPO"
            if [ -n "$WANDLER_STT_REPO" ]; then
                echo "  STT: $WANDLER_STT_REPO"
            fi
            echo "  Port: $port"

            # cuDNN is needed by onnxruntime-node CUDA execution provider
            export LD_LIBRARY_PATH="/opt/engines/pytorch/venv/lib/python3.12/site-packages/nvidia/cudnn/lib:${LD_LIBRARY_PATH:-}"

            # Use CUDA when an NVIDIA GPU is present, otherwise let wandler auto-detect
            WANDLER_DEVICE="auto"
            if command -v nvidia-smi >/dev/null 2>&1; then
                WANDLER_DEVICE="cuda"
            fi

            WANDLER_ARGS=(
                --llm "$MODEL_REPO"
                --device "$WANDLER_DEVICE"
                --port "$port"
                --host 0.0.0.0
                --api-key "$A2GO_API_KEY"
            )
            if [ -n "$WANDLER_STT_REPO" ]; then
                WANDLER_ARGS+=(--stt "$WANDLER_STT_REPO")
            fi

            wandler "${WANDLER_ARGS[@]}" 2>&1 &

            echo "$!" > /tmp/oc_llm_pid
            # Mark that wandler handles STT so the audio case skips it
            if [ -n "$WANDLER_STT_REPO" ]; then
                echo "wandler" > /tmp/oc_wandler_stt
            fi

            PROVIDER_NAME="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('provider',{}).get('name','wandler'))")"
            echo "$PROVIDER_NAME" > /tmp/oc_llm_provider
            echo "$port" > /tmp/oc_llm_port
            echo "$MODEL_SERVED_AS" > /tmp/oc_llm_model_name
            DEFAULT_CTX="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('defaults',{}).get('contextLength',131072))")"
            echo "${CONTEXT_LENGTH:-$DEFAULT_CTX}" > /tmp/oc_llm_context

          else
            # ── LLM (standard or vision-as-LLM) via llama-server ──
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
                    --parallel "$PARALLEL"
                    -c "$CTX"
                    --jinja
                    -ctk q8_0
                    -ctv q8_0
                    --no-mmap
                    --api-key "$A2GO_API_KEY"
                )

                # Add -ngl unless "auto" (let --fit determine GPU layers)
                if [ "$LAYERS" != "auto" ]; then
                    LLM_ARGS+=(-ngl "$LAYERS")
                fi

                # Add --mmproj for multimodal models (vision-as-LLM or LLM with built-in vision)
                MMPROJ_FILE="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('mmproj',''))")"
                if [ -n "$MMPROJ_FILE" ] && [ -f "$MODEL_DOWNLOAD_DIR/$MMPROJ_FILE" ]; then
                    echo "  Vision projection: $MODEL_DOWNLOAD_DIR/$MMPROJ_FILE"
                    LLM_ARGS+=(--mmproj "$MODEL_DOWNLOAD_DIR/$MMPROJ_FILE")
                    VISION_AS_LLM="true"
                fi

                # Append extra start args if present
                if [ -n "$EXTRA_START_ARGS" ]; then
                    read -ra EXTRA_ARGS <<< "$EXTRA_START_ARGS"
                    LLM_ARGS+=("${EXTRA_ARGS[@]}")
                fi

                # Build env command with optional extra env vars
                ENGINE_LD_LIBRARY_PATH="$ENGINE_LIB_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
                ENV_CMD=(env LD_LIBRARY_PATH="$ENGINE_LD_LIBRARY_PATH")
                if [ -n "$EXTRA_ENV_VARS" ]; then
                    read -ra ENV_PAIRS <<< "$EXTRA_ENV_VARS"
                    ENV_CMD+=("${ENV_PAIRS[@]}")
                fi

                "${ENV_CMD[@]}" \
                    "$ENGINE_BINARY" "${LLM_ARGS[@]}" \
                    2>&1 &

                echo "$!" > /tmp/oc_llm_pid

            # Write provider name from model JSON
            PROVIDER_NAME="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('provider',{}).get('name','local-llamacpp'))")"
            echo "$PROVIDER_NAME" > /tmp/oc_llm_provider

            echo "$port" > /tmp/oc_llm_port
            echo "$MODEL_SERVED_AS" > /tmp/oc_llm_model_name
            echo "$CTX" > /tmp/oc_llm_context

            # Record vision capability for OpenClaw config
            if [ "$VISION_AS_LLM" = "true" ]; then
                echo "true" > /tmp/oc_llm_vision
            fi
          fi
            ;;

        audio)
            # Skip if Wandler LLM already handles this STT model
            if [ -f /tmp/oc_wandler_stt ] && [ "$engine_id" = "wandler" ]; then
                echo "--- Service [audio]: $model_id — handled by Wandler LLM server, skipping ---"
                continue
            fi

            # Write audio engine metadata so CLI tools can auto-detect the API
            echo "{\"engine\":\"$engine_id\",\"type\":\"$ENGINE_TYPE\",\"port\":$port,\"model\":\"$MODEL_SERVED_AS\"}" > /tmp/oc_audio_engine

            # ── Audio → accumulate for unified media server ──
            echo "Registering Audio plugin ($MODEL_PLUGIN) for unified media server..."
            echo "  Model dir: $MODEL_DOWNLOAD_DIR"
            MEDIA_PLUGINS_JSON="$(echo "$MEDIA_PLUGINS_JSON" | python3 -c "
import sys, json
plugins = json.load(sys.stdin)
plugins.append({'plugin': '$MODEL_PLUGIN', 'role': 'audio', 'model_dir': '$MODEL_DOWNLOAD_DIR'})
json.dump(plugins, sys.stdout)
")"
            ;;

        image)
            # ── Image generation → accumulate for unified media server ──
            echo "Registering Image plugin ($MODEL_PLUGIN) for unified media server..."
            echo "  Model: $MODEL_REPO"
            MEDIA_PLUGINS_JSON="$(echo "$MEDIA_PLUGINS_JSON" | python3 -c "
import sys, json
plugins = json.load(sys.stdin)
plugins.append({'plugin': '$MODEL_PLUGIN', 'role': 'image', 'model': '$MODEL_REPO'})
json.dump(plugins, sys.stdout)
")"
            ;;

        vision)
            # ── Standalone vision model via llama-server + --mmproj ──
            FIRST_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f1)"
            MMPROJ_FILE="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('mmproj',''))")"

            echo "Starting Vision server..."
            echo "  Binary: $ENGINE_BINARY"
            echo "  Model: $MODEL_DOWNLOAD_DIR/$FIRST_FILE"
            echo "  Port: $port (GPU accelerated)"
            if [ -n "$MMPROJ_FILE" ]; then
                echo "  Vision projection: $MODEL_DOWNLOAD_DIR/$MMPROJ_FILE"
            fi

            VISION_ARGS=(
                -m "$MODEL_DOWNLOAD_DIR/$FIRST_FILE"
                --host 0.0.0.0
                --port "$port"
                -ngl 99
                --api-key "$A2GO_API_KEY"
            )

            if [ -n "$MMPROJ_FILE" ]; then
                VISION_ARGS+=(--mmproj "$MODEL_DOWNLOAD_DIR/$MMPROJ_FILE")
            fi

            ENGINE_LD_LIBRARY_PATH="$ENGINE_LIB_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            env LD_LIBRARY_PATH="$ENGINE_LD_LIBRARY_PATH" \
                "$ENGINE_BINARY" "${VISION_ARGS[@]}" \
                2>&1 &

            echo "$!" > /tmp/oc_vision_pid
            ;;

        embedding)
            # ── Embedding model via llama-server with /v1/embeddings ──
            FIRST_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f1)"

            echo "Starting Embedding server..."
            echo "  Binary: $ENGINE_BINARY"
            echo "  Model: $MODEL_DOWNLOAD_DIR/$FIRST_FILE"
            echo "  Port: $port"

            EXTRA_START_ARGS="$(echo "$model_json" | python3 -c "import sys,json; args=json.load(sys.stdin).get('extraStartArgs',[]); print(' '.join(args))")"

            EMBED_ARGS=(
                -m "$MODEL_DOWNLOAD_DIR/$FIRST_FILE"
                --host 0.0.0.0
                --port "$port"
                -ngl 99
                --embedding
                --api-key "$A2GO_API_KEY"
            )

            if [ -n "$EXTRA_START_ARGS" ]; then
                read -ra EXTRA_ARGS <<< "$EXTRA_START_ARGS"
                EMBED_ARGS+=("${EXTRA_ARGS[@]}")
            fi

            ENGINE_LD_LIBRARY_PATH="$ENGINE_LIB_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            env LD_LIBRARY_PATH="$ENGINE_LD_LIBRARY_PATH" \
                "$ENGINE_BINARY" "${EMBED_ARGS[@]}" \
                2>&1 &

            echo "$!" > /tmp/oc_embedding_pid
            ;;

        reranking)
            # ── Reranking model via llama-server with --reranking ──
            FIRST_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f1)"

            echo "Starting Reranking server..."
            echo "  Binary: $ENGINE_BINARY"
            echo "  Model: $MODEL_DOWNLOAD_DIR/$FIRST_FILE"
            echo "  Port: $port"

            RERANK_ARGS=(
                -m "$MODEL_DOWNLOAD_DIR/$FIRST_FILE"
                --host 0.0.0.0
                --port "$port"
                -ngl 99
                --reranking
                --api-key "$A2GO_API_KEY"
            )

            ENGINE_LD_LIBRARY_PATH="$ENGINE_LIB_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            env LD_LIBRARY_PATH="$ENGINE_LD_LIBRARY_PATH" \
                "$ENGINE_BINARY" "${RERANK_ARGS[@]}" \
                2>&1 &

            echo "$!" > /tmp/oc_reranking_pid
            ;;

        tts)
            # Write TTS engine metadata so CLI tools can auto-detect the API
            echo "{\"engine\":\"$engine_id\",\"type\":\"$ENGINE_TYPE\",\"port\":$port,\"model\":\"$MODEL_SERVED_AS\"}" > /tmp/oc_tts_engine

            if [ "$ENGINE_TYPE" = "python-venv" ]; then
                # ── TTS → accumulate for unified media server ──
                echo "Registering TTS plugin ($MODEL_PLUGIN) for unified media server..."
                echo "  Model dir: $MODEL_DOWNLOAD_DIR"
                MEDIA_PLUGINS_JSON="$(echo "$MEDIA_PLUGINS_JSON" | python3 -c "
import sys, json
plugins = json.load(sys.stdin)
plugins.append({'plugin': '$MODEL_PLUGIN', 'role': 'tts', 'model_dir': '$MODEL_DOWNLOAD_DIR'})
json.dump(plugins, sys.stdout)
")"
            else
                # ── Native TTS via llama-tts binary (OuteTTS) ──
                FIRST_FILE="$(echo "$MODEL_FILES" | cut -d'|' -f1)"
                VOCODER_FILE="$(echo "$model_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('vocoder',''))")"

                # Use TTS-specific binary from engine
                TTS_BINARY="${ENGINE_BINARY_TTS:-$ENGINE_BINARY}"

                echo "Starting Native TTS server (OuteTTS)..."
                echo "  Binary: $TTS_BINARY"
                echo "  Model: $MODEL_DOWNLOAD_DIR/$FIRST_FILE"
                if [ -n "$VOCODER_FILE" ]; then
                    echo "  Vocoder: $MODEL_DOWNLOAD_DIR/$VOCODER_FILE"
                fi
                echo "  Port: $port"

                TTS_ARGS=(
                    -m "$MODEL_DOWNLOAD_DIR/$FIRST_FILE"
                    --host 0.0.0.0
                    --port "$port"
                    -ngl 99
                )

                if [ -n "$VOCODER_FILE" ]; then
                    TTS_ARGS+=(--vocoder "$MODEL_DOWNLOAD_DIR/$VOCODER_FILE")
                fi

                ENGINE_LD_LIBRARY_PATH="$ENGINE_LIB_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
                env LD_LIBRARY_PATH="$ENGINE_LD_LIBRARY_PATH" \
                    "$TTS_BINARY" "${TTS_ARGS[@]}" \
                    2>&1 &

                echo "$!" > /tmp/oc_tts_pid
            fi
            ;;
    esac

done < /tmp/oc_services.txt

# ── Read LLM port before starting media server (needs it for proxy) ──
LLM_PORT="$(cat /tmp/oc_llm_port 2>/dev/null || echo "8000")"

# ── Start unified media server if any Python media plugins were registered ──
MEDIA_PID=""
MEDIA_PLUGIN_COUNT="$(echo "$MEDIA_PLUGINS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")"
if [ "$MEDIA_PLUGIN_COUNT" -gt 0 ]; then
    echo ""
    echo "Starting unified server with $MEDIA_PLUGIN_COUNT plugin(s) on port $MEDIA_SERVER_PORT..."

    # Write media server config
    echo "{\"plugins\": $MEDIA_PLUGINS_JSON}" > /tmp/a2go_media_config.json

    # Activate PyTorch venv and start the unified server
    if [ -d "/opt/engines/pytorch/venv" ]; then
        source /opt/engines/pytorch/venv/bin/activate
    fi

    # Use venv python explicitly to ensure FastAPI/torch are available
    MEDIA_PYTHON="${VIRTUAL_ENV:-/opt/engines/pytorch/venv}/bin/python3"
    "$MEDIA_PYTHON" /usr/local/bin/a2go-media-server \
        --config /tmp/a2go_media_config.json --port "$MEDIA_SERVER_PORT" \
        --web-root "/opt/a2go/web" --llm-url "http://localhost:$LLM_PORT" \
        > /tmp/media-server.log 2>&1 &
    MEDIA_PID=$!
    echo "$MEDIA_PID" > /tmp/a2go_media_pid

    if [ -d "/opt/engines/pytorch/venv" ]; then
        deactivate 2>/dev/null || true
    fi
fi

# Read PIDs and metadata from temp files
LLAMA_PID="$(cat /tmp/oc_llm_pid 2>/dev/null || echo "")"
LLM_MODEL_NAME="$(cat /tmp/oc_llm_model_name 2>/dev/null || echo "glm-4.7-flash")"
LLM_CONTEXT="$(cat /tmp/oc_llm_context 2>/dev/null || echo "150000")"
LLM_PROVIDER_NAME="$(cat /tmp/oc_llm_provider 2>/dev/null || echo "local-llamacpp")"
LLM_HAS_VISION="$(cat /tmp/oc_llm_vision 2>/dev/null || echo "false")"
IMAGE_PID="$(cat /tmp/oc_image_pid 2>/dev/null || echo "")"
VISION_PID="$(cat /tmp/oc_vision_pid 2>/dev/null || echo "")"
EMBEDDING_PID="$(cat /tmp/oc_embedding_pid 2>/dev/null || echo "")"
RERANKING_PID="$(cat /tmp/oc_reranking_pid 2>/dev/null || echo "")"
TTS_PID="$(cat /tmp/oc_tts_pid 2>/dev/null || echo "")"

# Web proxy functionality is now built into the unified media server

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
# Setup agent config + gateway (agent-conditional)
# ============================================================

# Setup GitHub CLI if token provided (shared across agents)
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
export OPENAI_API_KEY="$A2GO_API_KEY"
export OPENAI_BASE_URL="http://localhost:${LLM_PORT}/v1"

GATEWAY_PID=""

case "$AGENT" in
    openclaw)
        mkdir -p "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" "$OPENCLAW_WORKSPACE"
        mkdir -p "$OPENCLAW_WORKSPACE/images" "$OPENCLAW_WORKSPACE/audio"
        chmod 700 "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/agents" "$OPENCLAW_STATE_DIR/agents/main" \
            "$OPENCLAW_STATE_DIR/agents/main/sessions" "$OPENCLAW_STATE_DIR/credentials" 2>/dev/null || true

        # Install tool_result hook plugins into workspace (if bundled)
        OPENCLAW_EXT_DIR="$OPENCLAW_WORKSPACE/.openclaw/extensions"
        if [ -d "/opt/a2go/plugins/toolresult-images" ]; then
            mkdir -p "$OPENCLAW_EXT_DIR"
            if [ ! -d "$OPENCLAW_EXT_DIR/toolresult-images" ]; then
                cp -r "/opt/a2go/plugins/toolresult-images" "$OPENCLAW_EXT_DIR/"
            fi
        fi

        # Determine LLM input capabilities for OpenClaw config
        LLM_INPUT='["text"]'
        if [ "$LLM_HAS_VISION" = "true" ]; then
            LLM_INPUT='["text", "image"]'
        fi

        if [ ! -f "$OPENCLAW_STATE_DIR/openclaw.json" ]; then
            # Config structure must stay in sync with site/src/lib/openclaw-config.ts
            # CI validates both via scripts/validate-openclaw-config.mjs
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
        "apiKey": "$A2GO_API_KEY",
        "api": "openai-completions",
        "models": [{
          "id": "$LLM_MODEL_NAME",
          "name": "${PROFILE_NAME} LLM",
          "contextWindow": $LLM_CONTEXT,
          "maxTokens": 8192,
          "reasoning": false,
          "input": $LLM_INPUT,
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
    "load": { "extraDirs": ["/opt/a2go/skills"] },
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
    "controlUi": { "allowedOrigins": $A2GO_ALLOWED_ORIGINS_JSON },
    "trustedProxies": ["0.0.0.0/0"],
    "auth": { "mode": "token", "token": "$A2GO_AUTH_TOKEN" },
    "remote": { "token": "$A2GO_AUTH_TOKEN" }
  },
  "logging": { "level": "info" }
}
EOF
            chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json"
        fi

        IMAGE_BASE_URL_FILE="$OPENCLAW_WORKSPACE/image-base-url.txt"
        if [ -n "${A2GO_IMAGE_PUBLIC_BASE_URL:-}" ] && [ ! -f "$IMAGE_BASE_URL_FILE" ]; then
            echo "$A2GO_IMAGE_PUBLIC_BASE_URL" > "$IMAGE_BASE_URL_FILE"
        fi

        # Copy workspace identity for OpenClaw
        if [ -f "/opt/a2go/config/workspace/IDENTITY.md" ] && [ ! -f "$OPENCLAW_WORKSPACE/IDENTITY.md" ]; then
            cp /opt/a2go/config/workspace/IDENTITY.md "$OPENCLAW_WORKSPACE/"
        fi

        A2GO_OC_PROVIDER_NAME="$LLM_PROVIDER_NAME" \
        A2GO_OC_BASE_URL="http://localhost:${LLM_PORT}/v1" \
        A2GO_OC_API_KEY="$A2GO_API_KEY" \
        A2GO_OC_MODEL_ID="$LLM_MODEL_NAME" \
        A2GO_OC_MODEL_NAME="${PROFILE_NAME} LLM" \
        A2GO_OC_CONTEXT_WINDOW="$LLM_CONTEXT" \
        A2GO_OC_MAX_TOKENS="8192" \
        A2GO_OC_ALLOWED_ORIGINS_JSON="$A2GO_ALLOWED_ORIGINS_JSON" \
        A2GO_OC_HAS_VISION="$LLM_HAS_VISION" \
        A2GO_OC_DISABLE_DEVICE_AUTH="$A2GO_DISABLE_DEVICE_AUTH" \
        oc_sync_openclaw_runtime

        # Auto-fix config
        echo "Running openclaw doctor to validate/fix config..."
        OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR "$BOT_CMD" doctor --fix || true
        chmod 600 "$OPENCLAW_STATE_DIR/openclaw.json" 2>/dev/null || true
        A2GO_OC_PROVIDER_NAME="$LLM_PROVIDER_NAME" \
        A2GO_OC_BASE_URL="http://localhost:${LLM_PORT}/v1" \
        A2GO_OC_API_KEY="$A2GO_API_KEY" \
        A2GO_OC_MODEL_ID="$LLM_MODEL_NAME" \
        A2GO_OC_MODEL_NAME="${PROFILE_NAME} LLM" \
        A2GO_OC_CONTEXT_WINDOW="$LLM_CONTEXT" \
        A2GO_OC_MAX_TOKENS="8192" \
        A2GO_OC_ALLOWED_ORIGINS_JSON="$A2GO_ALLOWED_ORIGINS_JSON" \
        A2GO_OC_HAS_VISION="$LLM_HAS_VISION" \
        A2GO_OC_DISABLE_DEVICE_AUTH="$A2GO_DISABLE_DEVICE_AUTH" \
        oc_sync_openclaw_runtime
        oc_sync_skills_disable "openai-image-gen,nano-banana-pro"
        oc_sync_gateway_auth "token"

        # Start OpenClaw gateway
        echo ""
        echo "Starting OpenClaw gateway..."
        OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR A2GO_GATEWAY_TOKEN="$A2GO_AUTH_TOKEN" \
        "$BOT_CMD" gateway --auth token --token "$A2GO_AUTH_TOKEN" &
        GATEWAY_PID=$!
        ;;

    hermes)
        HERMES_DIR="$HOME/.hermes"
        mkdir -p "$HERMES_DIR" "$HERMES_DIR/sessions" "$HERMES_DIR/memories" \
            "$HERMES_DIR/skills" "$HERMES_DIR/cron" "$HERMES_DIR/logs"

        # Generate Hermes config.yaml pointing to local LLM
        echo "Creating Hermes config..."
        cat > "$HERMES_DIR/config.yaml" << EOF
model:
  provider: custom
  default: $LLM_MODEL_NAME
  base_url: http://localhost:${LLM_PORT}/v1
  api_key: $A2GO_API_KEY
  context_length: $LLM_CONTEXT
memory:
  memory_enabled: true
  user_profile_enabled: true
terminal:
  backend: local
  persistent_shell: true
EOF

        # Generate .env for Hermes
        cat > "$HERMES_DIR/.env" << EOF
OPENAI_API_KEY=$A2GO_API_KEY
OPENAI_BASE_URL=http://localhost:${LLM_PORT}/v1
EOF

        # Copy workspace identity for Hermes
        if [ -f "/opt/a2go/config/workspace/hermes/SOUL.md" ] && [ ! -f "$HERMES_DIR/SOUL.md" ]; then
            cp /opt/a2go/config/workspace/hermes/SOUL.md "$HERMES_DIR/"
        fi

        # Copy a2go skills into Hermes skills dir (SKILL.md format is compatible)
        if [ -d "/opt/a2go/skills" ]; then
            mkdir -p "$HERMES_DIR/skills"
            for skill_dir in /opt/a2go/skills/*/; do
                skill_name="$(basename "$skill_dir")"
                if [ -f "$skill_dir/SKILL.md" ] && [ ! -d "$HERMES_DIR/skills/$skill_name" ]; then
                    cp -r "$skill_dir" "$HERMES_DIR/skills/$skill_name"
                    echo "  Installed skill: $skill_name"
                fi
            done
        fi

        # Start Hermes gateway (API server on port 8642, foreground mode, backgrounded by us)
        echo ""
        echo "Starting Hermes gateway..."
        OPENAI_API_KEY="$A2GO_API_KEY" \
        OPENAI_BASE_URL="http://localhost:${LLM_PORT}/v1" \
        API_SERVER_ENABLED=true \
        API_SERVER_PORT=8642 \
        API_SERVER_HOST=0.0.0.0 \
        API_SERVER_KEY="$A2GO_AUTH_TOKEN" \
        "$HERMES_CMD" gateway run &
        GATEWAY_PID=$!
        ;;
esac

# ============================================================
# Print ready banner with VRAM breakdown
# ============================================================
MEDIA_PROXY_URL=""
if [ -n "${RUNPOD_POD_ID:-}" ]; then
    MEDIA_PROXY_URL="https://${RUNPOD_POD_ID}-${MEDIA_SERVER_PORT}.proxy.runpod.net"
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
    "Media UI (local): http://localhost:${MEDIA_SERVER_PORT}" \
    "${MEDIA_PROXY_URL:+Media UI (public): ${MEDIA_PROXY_URL}}"

# Print service details
if [ -n "$MEDIA_PID" ]; then
    echo ""
    echo "  Media Server (unified): http://localhost:${MEDIA_SERVER_PORT}"
    echo "    - a2go tool image-generate --prompt \"A robot\" --output /tmp/robot.png"
    echo "    - a2go tool text-to-speech \"Hello world\" --output /tmp/hello.wav"
    echo "    - a2go tool speech-to-text /path/to/audio.wav"
fi

if [ -n "$VISION_PID" ]; then
    echo ""
    echo "  Vision Server (internal): http://localhost:8003"
    echo "    - curl http://localhost:8003/v1/chat/completions (with image_url)"
fi

if [ -n "$EMBEDDING_PID" ]; then
    echo ""
    echo "  Embedding Server (internal): http://localhost:8004"
    echo "    - curl http://localhost:8004/v1/embeddings -d '{\"input\": \"text\"}'"
fi

if [ -n "$RERANKING_PID" ]; then
    echo ""
    echo "  Reranking Server (experimental): http://localhost:8005"
    echo "    - curl http://localhost:8005/v1/rerank -d '{\"query\": \"q\", \"documents\": [...]}'"
fi

if [ -n "$TTS_PID" ]; then
    echo ""
    echo "  Native TTS Server (internal): http://localhost:8006"
fi

if [ "$LLM_HAS_VISION" = "true" ]; then
    echo ""
    echo "  Vision (via LLM): Multimodal model with image understanding on port $LLM_PORT"
fi

echo ""
echo "  Media UI: http://localhost:${MEDIA_SERVER_PORT}"

# ============================================================
# Handle shutdown
# ============================================================
cleanup() {
    echo "Shutting down..."
    [ -n "$GATEWAY_PID" ] && kill $GATEWAY_PID 2>/dev/null
    [ -n "$MEDIA_PID" ] && kill $MEDIA_PID 2>/dev/null
    [ -n "$IMAGE_PID" ] && kill $IMAGE_PID 2>/dev/null
    [ -n "$VISION_PID" ] && kill $VISION_PID 2>/dev/null
    [ -n "$EMBEDDING_PID" ] && kill $EMBEDDING_PID 2>/dev/null
    [ -n "$RERANKING_PID" ] && kill $RERANKING_PID 2>/dev/null
    [ -n "$TTS_PID" ] && kill $TTS_PID 2>/dev/null
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
