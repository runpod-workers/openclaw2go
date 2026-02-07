# OpenClaw + vLLM Docker Image for Runpod
# Pre-configured with everything needed for AI coding assistant
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

LABEL maintainer="Runpod OpenClaw2Go"
LABEL description="OpenClaw2Go with vLLM for local LLM inference"

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV HF_HOME=/workspace/huggingface
ENV OPENCLAW_STATE_DIR=/workspace/.openclaw
ENV OPENCLAW_WORKSPACE=/workspace/openclaw

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    jq \
    lsof \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22.x
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Install vLLM
RUN pip install --no-cache-dir vllm

# Image generation dependencies (SDNQ + Diffusers)
RUN python3 -m pip install --no-cache-dir sdnq diffusers transformers accelerate safetensors

# Install OpenClaw
RUN npm install -g openclaw@latest

# Create workspace directories
RUN mkdir -p /workspace/huggingface \
    /workspace/.openclaw \
    /workspace/openclaw \
    /workspace/scripts

# Copy startup scripts + skills + CLI
COPY skills/ /opt/openclaw/skills/
COPY scripts/openclaw-image-gen /usr/local/bin/openclaw-image-gen
COPY scripts/entrypoint-common.sh /opt/openclaw/entrypoint-common.sh
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/openclaw-image-gen

# Copy default OpenClaw workspace files
COPY config/workspace/ /workspace/openclaw/

# Expose ports
# 8000 - vLLM API
# 18789 - OpenClaw Gateway WebSocket
# 18790 - OpenClaw Bridge
# 18793 - OpenClaw Canvas
# 22 - SSH (Runpod adds this)
EXPOSE 8000 18789 18790 18793

# Environment variables (can be overridden at runtime)
ENV VLLM_API_KEY=changeme
ENV OPENCLAW_WEB_PASSWORD=changeme
ENV MODEL_NAME=Qwen/Qwen2.5-Coder-7B-Instruct
ENV SERVED_MODEL_NAME=local-coder
ENV MAX_MODEL_LEN=16384
ENV GPU_MEMORY_UTILIZATION=0.90
ENV TOOL_CALL_PARSER=hermes
ENV TENSOR_PARALLEL_SIZE=auto

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

WORKDIR /workspace

ENTRYPOINT ["/entrypoint.sh"]
