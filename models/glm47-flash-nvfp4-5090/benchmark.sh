#!/bin/bash
# GLM-4.7-Flash NVFP4 Benchmark Script
# Measures tokens per second for various scenarios

set -e

API_URL="${API_URL:-http://localhost:8000}"
API_KEY="${API_KEY:-changeme}"
MODEL="${MODEL:-glm-4.7-flash}"

echo "========================================"
echo "  GLM-4.7-Flash NVFP4 Benchmark"
echo "========================================"
echo "API: $API_URL"
echo "Model: $MODEL"
echo ""

# Function to run a benchmark and extract metrics
benchmark() {
    local name="$1"
    local prompt="$2"
    local max_tokens="$3"
    local tools="$4"

    echo "--- $name ---"

    # Build request
    if [ -n "$tools" ]; then
        request=$(cat <<EOF
{
    "model": "$MODEL",
    "messages": [{"role": "user", "content": "$prompt"}],
    "max_tokens": $max_tokens,
    "tools": $tools,
    "stream": false
}
EOF
)
    else
        request=$(cat <<EOF
{
    "model": "$MODEL",
    "messages": [{"role": "user", "content": "$prompt"}],
    "max_tokens": $max_tokens,
    "stream": false
}
EOF
)
    fi

    # Measure time and get response
    start_time=$(date +%s.%N)

    response=$(curl -s "$API_URL/v1/chat/completions" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$request")

    end_time=$(date +%s.%N)

    # Extract metrics from response
    prompt_tokens=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('usage',{}).get('prompt_tokens',0))")
    completion_tokens=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('usage',{}).get('completion_tokens',0))")
    total_tokens=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('usage',{}).get('total_tokens',0))")
    finish_reason=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('finish_reason','unknown'))")

    # Calculate timing
    elapsed=$(echo "$end_time - $start_time" | bc)

    if [ "$completion_tokens" -gt 0 ]; then
        tokens_per_sec=$(echo "scale=2; $completion_tokens / $elapsed" | bc)
    else
        tokens_per_sec="0"
    fi

    echo "  Prompt tokens:     $prompt_tokens"
    echo "  Completion tokens: $completion_tokens"
    echo "  Total time:        ${elapsed}s"
    echo "  Tokens/sec:        $tokens_per_sec"
    echo "  Finish reason:     $finish_reason"
    echo ""

    # Return for summary
    echo "$name|$prompt_tokens|$completion_tokens|$elapsed|$tokens_per_sec" >> /tmp/benchmark_results.txt
}

# Clear previous results
rm -f /tmp/benchmark_results.txt

echo "Running benchmarks..."
echo ""

# 1. Short message (simple greeting)
benchmark "Short Message" \
    "Hello! How are you today?" \
    50

# 2. Medium message (explanation)
benchmark "Medium Message" \
    "Explain the concept of machine learning in simple terms." \
    200

# 3. Long generation (story)
benchmark "Long Generation" \
    "Write a short story about a robot learning to paint." \
    500

# 4. Code generation
benchmark "Code Generation" \
    "Write a Python function to calculate fibonacci numbers with memoization." \
    300

# 5. Reasoning task
benchmark "Reasoning Task" \
    "If a train leaves Station A at 9:00 AM traveling at 60 mph, and another train leaves Station B (100 miles away) at 9:30 AM traveling at 80 mph toward Station A, at what time will they meet?" \
    300

# 6. Tool calling
benchmark "Tool Calling" \
    "What is 47 multiplied by 89?" \
    100 \
    '[{"type":"function","function":{"name":"calculator","description":"Perform math calculations","parameters":{"type":"object","properties":{"expression":{"type":"string","description":"Math expression to evaluate"}}}}}]'

# 7. Long context (if supported)
long_context="Here is a long document for analysis. $(printf 'This is paragraph %d of the document containing various information about technology, science, and innovation. ' {1..50}) Based on this document, summarize the main themes."
benchmark "Long Context Input" \
    "$long_context" \
    200

echo "========================================"
echo "  SUMMARY"
echo "========================================"
echo ""
printf "%-20s %10s %12s %10s %12s\n" "Test" "Prompt" "Completion" "Time(s)" "Tok/s"
printf "%-20s %10s %12s %10s %12s\n" "----" "------" "----------" "-------" "-----"

while IFS='|' read -r name prompt_tok comp_tok time tps; do
    printf "%-20s %10s %12s %10s %12s\n" "$name" "$prompt_tok" "$comp_tok" "$time" "$tps"
done < /tmp/benchmark_results.txt

echo ""
echo "========================================"

# Calculate averages
total_tps=$(awk -F'|' '{sum+=$5; count++} END {printf "%.2f", sum/count}' /tmp/benchmark_results.txt)
echo "Average tokens/sec: $total_tps"
echo ""

# System info
echo "System Info:"
if command -v nvidia-smi &> /dev/null; then
    gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    gpu_mem=$(nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader 2>/dev/null | head -1)
    echo "  GPU: $gpu_name"
    echo "  GPU Memory: $gpu_mem"
fi
echo "  Model: $MODEL"
echo "  Context: 200,000 tokens"
echo "  Quantization: NVFP4"
echo ""
