#!/bin/bash
# benchmark-mmap.sh — Measure llama-server startup time, peak RSS, and
# inference correctness with and without --no-mmap.
#
# Usage:
#   ./benchmark-mmap.sh <model-json-id> [--no-mmap] [--port PORT] [--timeout SECS]
#
# Examples:
#   ./benchmark-mmap.sh qwen35-9b-gguf              # default mmap
#   ./benchmark-mmap.sh qwen35-9b-gguf --no-mmap    # disable mmap
#   ./benchmark-mmap.sh glm51-iq1m-gguf --no-mmap --timeout 300
#
# Prerequisites:
#   - Run on a Runpod pod with the a2go image (engine binary + model already present)
#   - Model files must already be downloaded to the expected downloadDir
#
# What it measures:
#   1. Time from llama-server process start to "server is listening" log line
#   2. Peak RSS (VmHWM from /proc/<pid>/status) during loading
#   3. Whether inference produces a valid response after loading

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────
ENGINE_BINARY="${ENGINE_BINARY:-/opt/engines/a2go-llamacpp/bin/llama-server}"
ENGINE_LIB_PATH="${ENGINE_LIB_PATH:-/opt/engines/a2go-llamacpp/lib}"
REGISTRY_DIR="${REGISTRY_DIR:-/opt/a2go/registry/models}"
PORT=9999
TIMEOUT=600  # 10 minutes max wait for server ready
USE_NO_MMAP=false
INFERENCE_PROMPT="Write a haiku about the ocean."
API_KEY="benchmark-key-$$"

# ── Parse arguments ───────────────────────────────────────────────────
MODEL_ID="${1:-}"
shift || true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-mmap)  USE_NO_MMAP=true; shift ;;
        --port)     PORT="$2"; shift 2 ;;
        --timeout)  TIMEOUT="$2"; shift 2 ;;
        *)          echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [[ -z "$MODEL_ID" ]]; then
    echo "Usage: $0 <model-json-id> [--no-mmap] [--port PORT] [--timeout SECS]"
    echo ""
    echo "Available models in registry:"
    ls "$REGISTRY_DIR"/*.json 2>/dev/null | xargs -I{} basename {} .json
    exit 1
fi

# ── Load model config ────────────────────────────────────────────────
MODEL_JSON_FILE="$REGISTRY_DIR/${MODEL_ID}.json"
if [[ ! -f "$MODEL_JSON_FILE" ]]; then
    # Also check workspace override registry
    ALT_REGISTRY="/workspace/.openclaw/registry/models/${MODEL_ID}.json"
    if [[ -f "$ALT_REGISTRY" ]]; then
        MODEL_JSON_FILE="$ALT_REGISTRY"
    else
        echo "ERROR: Model config not found: $MODEL_JSON_FILE"
        exit 1
    fi
fi

MODEL_JSON=$(cat "$MODEL_JSON_FILE")
MODEL_NAME=$(echo "$MODEL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
DOWNLOAD_DIR=$(echo "$MODEL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['downloadDir'])")
FIRST_FILE=$(echo "$MODEL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['files'][0])")
EXTRA_START_ARGS=$(echo "$MODEL_JSON" | python3 -c "import sys,json; args=json.load(sys.stdin).get('extraStartArgs',[]); print(' '.join(args))")
CTX=$(echo "$MODEL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('defaults',{}).get('contextLength', json.load(open('$MODEL_JSON_FILE')).get('contextLength',32768)))" 2>/dev/null || echo "32768")
# Use minimal context for benchmark — we only care about load time, not KV cache allocation
BENCH_CTX=2048

MODEL_PATH="$DOWNLOAD_DIR/$FIRST_FILE"

if [[ ! -f "$MODEL_PATH" ]]; then
    echo "ERROR: Model file not found: $MODEL_PATH"
    echo "Make sure the model is downloaded before running this benchmark."
    exit 1
fi

MODEL_SIZE_BYTES=$(stat -c%s "$MODEL_PATH" 2>/dev/null || stat -f%z "$MODEL_PATH" 2>/dev/null || echo 0)
MODEL_SIZE_GB=$(python3 -c "print(f'{$MODEL_SIZE_BYTES / 1073741824:.1f}')")

# ── Detect storage type ──────────────────────────────────────────────
if echo "$DOWNLOAD_DIR" | grep -q "^/workspace"; then
    STORAGE_TYPE="network-volume"
else
    STORAGE_TYPE="container-disk"
fi

# ── Build llama-server args ──────────────────────────────────────────
ARGS=(
    -m "$MODEL_PATH"
    --host 0.0.0.0
    --port "$PORT"
    --parallel 1
    -c "$BENCH_CTX"
    --jinja
    -ctk q8_0
    -ctv q8_0
    --api-key "$API_KEY"
    -ngl 999
)

if $USE_NO_MMAP; then
    ARGS+=(--no-mmap)
fi

# Append model-specific extra args
if [[ -n "$EXTRA_START_ARGS" ]]; then
    read -ra EXTRA_ARGS <<< "$EXTRA_START_ARGS"
    ARGS+=("${EXTRA_ARGS[@]}")
fi

# ── Summary ───────────────────────────────────────────────────────────
MMAP_LABEL=$($USE_NO_MMAP && echo "--no-mmap" || echo "mmap (default)")

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  mmap Benchmark                                            ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "  Model:    $MODEL_NAME"
echo "  File:     $MODEL_PATH"
echo "  Size:     ${MODEL_SIZE_GB} GB"
echo "  Storage:  $STORAGE_TYPE"
echo "  Mode:     $MMAP_LABEL"
echo "  Port:     $PORT"
echo "  Timeout:  ${TIMEOUT}s"
echo "  Context:  $BENCH_CTX (minimal for benchmark)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Kill any existing llama-server on our port ────────────────────────
if lsof -i :"$PORT" -t &>/dev/null; then
    echo "Killing existing process on port $PORT..."
    kill $(lsof -i :"$PORT" -t) 2>/dev/null || true
    sleep 2
fi

# ── Drop filesystem caches (requires root) ────────────────────────────
if [[ $EUID -eq 0 ]]; then
    echo "Dropping filesystem caches (sync + echo 3 > drop_caches)..."
    sync
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    echo "Caches dropped."
else
    echo "WARNING: Not root — cannot drop filesystem caches. Results may be affected by warm cache."
fi
echo ""

# ── Start llama-server and measure ────────────────────────────────────
LOG_FILE=$(mktemp /tmp/bench-mmap-XXXXXX.log)
PEAK_RSS_FILE=$(mktemp /tmp/bench-mmap-rss-XXXXXX.txt)
echo "0" > "$PEAK_RSS_FILE"

echo "Starting llama-server..."
echo "  Command: env LD_LIBRARY_PATH=$ENGINE_LIB_PATH $ENGINE_BINARY ${ARGS[*]}"
echo "  Log: $LOG_FILE"
echo ""

START_NS=$(date +%s%N)

env LD_LIBRARY_PATH="$ENGINE_LIB_PATH" \
    "$ENGINE_BINARY" "${ARGS[@]}" \
    > "$LOG_FILE" 2>&1 &

SERVER_PID=$!
echo "  PID: $SERVER_PID"

# ── RSS monitor (background) ─────────────────────────────────────────
(
    peak=0
    while kill -0 "$SERVER_PID" 2>/dev/null; do
        rss=$(awk '/^VmHWM:/ {print $2}' /proc/"$SERVER_PID"/status 2>/dev/null || echo 0)
        if [[ "$rss" -gt "$peak" ]]; then
            peak=$rss
            echo "$peak" > "$PEAK_RSS_FILE"
        fi
        sleep 0.5
    done
) &
RSS_MONITOR_PID=$!

# ── Wait for "server is listening" ───────────────────────────────────
echo "Waiting for server to be ready (timeout: ${TIMEOUT}s)..."
READY=false
ELAPSED_S=0

while [[ $ELAPSED_S -lt $TIMEOUT ]]; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo ""
        echo "ERROR: llama-server exited prematurely (exit code: $(wait $SERVER_PID 2>/dev/null; echo $?))"
        echo "Last 20 lines of log:"
        tail -20 "$LOG_FILE"
        kill "$RSS_MONITOR_PID" 2>/dev/null || true
        exit 1
    fi

    if grep -q "server is listening" "$LOG_FILE" 2>/dev/null; then
        READY=true
        break
    fi

    sleep 1
    ELAPSED_S=$(( ($(date +%s%N) - START_NS) / 1000000000 ))
done

END_NS=$(date +%s%N)
LOAD_TIME_MS=$(( (END_NS - START_NS) / 1000000 ))
LOAD_TIME_S=$(python3 -c "print(f'{$LOAD_TIME_MS / 1000:.1f}')")

if ! $READY; then
    echo ""
    echo "ERROR: Timed out after ${TIMEOUT}s waiting for server."
    echo "Last 20 lines of log:"
    tail -20 "$LOG_FILE"
    kill "$SERVER_PID" 2>/dev/null || true
    kill "$RSS_MONITOR_PID" 2>/dev/null || true
    exit 1
fi

echo "Server ready in ${LOAD_TIME_S}s"
echo ""

# ── Read peak RSS ────────────────────────────────────────────────────
# Give the monitor one more chance to read
sleep 1
PEAK_RSS_KB=$(cat "$PEAK_RSS_FILE")
# Also try reading VmHWM directly now
CURRENT_HWM=$(awk '/^VmHWM:/ {print $2}' /proc/"$SERVER_PID"/status 2>/dev/null || echo 0)
if [[ "$CURRENT_HWM" -gt "$PEAK_RSS_KB" ]]; then
    PEAK_RSS_KB=$CURRENT_HWM
fi
PEAK_RSS_GB=$(python3 -c "print(f'{$PEAK_RSS_KB / 1048576:.2f}')")

# ── Inference test ───────────────────────────────────────────────────
echo "Running inference test..."
INFERENCE_OK=false
INFERENCE_OUTPUT=""

RESP_FILE=$(mktemp /tmp/bench-mmap-resp-XXXXXX.json)
HTTP_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" \
    --max-time 120 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    "http://127.0.0.1:$PORT/v1/chat/completions" \
    -d "{
        \"model\": \"test\",
        \"messages\": [{\"role\": \"user\", \"content\": \"$INFERENCE_PROMPT\"}],
        \"max_tokens\": 64,
        \"temperature\": 0.7
    }" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
    INFERENCE_OUTPUT=$(python3 -c "
import json
with open('$RESP_FILE') as f:
    r = json.load(f)
msg = r['choices'][0]['message']
# Handle both regular content and reasoning models
text = msg.get('content') or msg.get('reasoning_content') or ''
print(text.strip()[:200])
" 2>/dev/null || echo "PARSE ERROR")

    if [[ -n "$INFERENCE_OUTPUT" ]] && [[ "$INFERENCE_OUTPUT" != "PARSE ERROR"* ]]; then
        INFERENCE_OK=true
    fi
fi
rm -f "$RESP_FILE"

# ── Cleanup ──────────────────────────────────────────────────────────
echo "Stopping server..."
kill "$SERVER_PID" 2>/dev/null || true
kill "$RSS_MONITOR_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

# ── Results ──────────────────────────────────────────────────────────
echo ""
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  RESULTS                                                     │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "  Model:          $MODEL_NAME"
echo "  Model size:     ${MODEL_SIZE_GB} GB"
echo "  Storage:        $STORAGE_TYPE"
echo "  Mode:           $MMAP_LABEL"
echo "  Load time:      ${LOAD_TIME_S}s"
echo "  Peak RSS:       ${PEAK_RSS_GB} GB (${PEAK_RSS_KB} kB)"
echo "  Inference OK:   $INFERENCE_OK"
if $INFERENCE_OK; then
echo "  Output:         ${INFERENCE_OUTPUT:0:80}..."
fi
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# ── Machine-readable JSON output ─────────────────────────────────────
JSON_OUT=$(python3 -c "
import json
print(json.dumps({
    'model_id': '$MODEL_ID',
    'model_name': '$MODEL_NAME',
    'model_size_gb': $MODEL_SIZE_GB,
    'storage_type': '$STORAGE_TYPE',
    'mmap_mode': '$MMAP_LABEL',
    'no_mmap': $($USE_NO_MMAP && echo 'True' || echo 'False'),
    'load_time_s': $LOAD_TIME_S,
    'peak_rss_gb': $PEAK_RSS_GB,
    'peak_rss_kb': $PEAK_RSS_KB,
    'inference_ok': $($INFERENCE_OK && echo 'True' || echo 'False'),
}, indent=2))
")

RESULTS_DIR="/tmp/bench-mmap-results"
mkdir -p "$RESULTS_DIR"
RESULT_FILE="$RESULTS_DIR/${MODEL_ID}_${STORAGE_TYPE}_$($USE_NO_MMAP && echo 'no-mmap' || echo 'mmap').json"
echo "$JSON_OUT" > "$RESULT_FILE"
echo "Results saved to: $RESULT_FILE"
echo "Server log saved to: $LOG_FILE"

# Cleanup temp files
rm -f "$PEAK_RSS_FILE"
