# Dockerfile for GLM-4.7-Flash GGUF on RTX 5090 (Blackwell SM120)
# Using llama.cpp for inference - works where vLLM NVFP4 fails
#
# Specifications:
# - Model Size: ~17GB (Q4_K_M quantization)
# - VRAM (model): ~17.3GB
# - VRAM (KV cache): ~10GB with Q8 quantization
# - Total VRAM: ~28GB -> fits on RTX 5090 (32GB)
# - Context Window: 200,000 tokens (full model capacity!)
# - Inference: ~175 tokens/sec on RTX 5090
#
# Why llama.cpp instead of vLLM?
# - vLLM NVFP4 has dimension mismatch bugs with GLM-4.7 MLA attention
# - llama.cpp has native Glm4MoeLite support (merged PR #18936)
# - Better KV cache memory efficiency with quantization options

ARG CUDA_VERSION=12.8
ARG UBUNTU_VERSION=24.04

FROM nvcr.io/nvidia/cuda-dl-base:25.03-cuda${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION}

ARG CUDA_VERSION
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git curl sudo \
    python3 python3-dev python3-venv python3-pip \
    openssh-server \
    && rm -f /etc/ssh/ssh_host_* && mkdir -p /var/run/sshd \
    && ldconfig /usr/local/cuda-$(echo $CUDA_VERSION | cut -d. -f1,2)/compat/ \
    && rm -f /usr/lib/python*/EXTERNALLY-MANAGED \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# llama.cpp will be built from source at runtime on first start
# This is necessary because:
# 1. No official pre-built CUDA 12.8 binaries for Linux exist
# 2. SM120 (Blackwell/RTX 5090) requires CUDA 12.8+
# 3. Building at runtime ensures optimal binaries for the actual GPU
#
# The build is cached on /workspace (network volume) so subsequent starts are instant
# First start takes ~10-15 minutes for compilation

# Install Node.js and GitHub CLI
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y --no-install-recommends nodejs gh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install huggingface-cli for model downloads
RUN pip install --no-cache-dir "huggingface_hub[cli]"

# Install Clawdbot and Claude Code
RUN npm install -g --prefer-offline @anthropic-ai/claude-code clawdbot && \
    npm cache clean --force

WORKDIR /

# Environment defaults
ENV MODEL_NAME="unsloth/GLM-4.7-Flash-GGUF" \
    MODEL_FILE="GLM-4.7-Flash-Q4_K_M.gguf" \
    MODEL_PATH="/workspace/models/GLM-4.7-Flash-GGUF" \
    SERVED_MODEL_NAME="glm-4.7-flash" \
    MAX_MODEL_LEN="200000" \
    LLAMA_API_KEY="changeme" \
    CLAWDBOT_HOME="/workspace/.clawdbot" \
    CLAWDBOT_WORKSPACE="/workspace/clawd"

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000 18789 22
ENTRYPOINT ["/entrypoint.sh"]
