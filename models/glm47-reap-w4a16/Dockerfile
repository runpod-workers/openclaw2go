# Dockerfile for GLM-4.7-REAP W4A16 on Runpod B200
# This uses the 40% expert-pruned, INT4 quantized version of GLM-4.7
# Model: 0xSero/GLM-4.7-REAP-40-W4A16 (~108GB VRAM)
#
# Note: B200 (Blackwell) requires CUDA 13.1+ for compute_100a support.
# Using CUDA 12.9 base with runtime CUDA 13.1 install for compatibility.

FROM runpod/pytorch:1.0.3-cu1290-torch291-ubuntu2404

# Install CUDA 13.1 for B200/Blackwell (compute_100a) support
# Combined with Node.js and GitHub CLI to reduce layers
RUN apt-get update && \
    apt-get install -y --no-install-recommends cuda-toolkit-13-1 && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends nodejs gh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set CUDA 13.1 as default for B200
ENV PATH=/usr/local/cuda-13.1/bin:$PATH
ENV CUDA_HOME=/usr/local/cuda-13.1
ENV LD_LIBRARY_PATH=/usr/local/cuda-13.1/lib64:$LD_LIBRARY_PATH

# Install vLLM nightly (required for GLM-4.7 support)
RUN uv pip install --system -U vllm --pre

# Image generation dependencies (SDNQ + Diffusers)
RUN uv pip install --system sdnq diffusers accelerate safetensors

# Install OpenClaw
RUN npm install -g --prefer-offline openclaw@latest && \
    npm cache clean --force

# Environment variables
ENV HF_HOME=/workspace/huggingface
ENV OPENCLAW_WORKSPACE=/workspace/openclaw
ENV MODEL_NAME=0xSero/GLM-4.7-REAP-40-W4A16
ENV SERVED_MODEL_NAME=glm-4.7-reap
ENV VLLM_API_KEY=changeme
ENV MAX_MODEL_LEN=32768
ENV GPU_MEMORY_UTILIZATION=0.90
ENV TOOL_CALL_PARSER=glm45

# Create directories
RUN mkdir -p /workspace/huggingface /workspace/.openclaw /workspace/openclaw

# Copy entrypoint script + skills + CLI
COPY openclaw/skills/ /opt/openclaw/skills/
COPY scripts/openclaw-image-gen /usr/local/bin/openclaw-image-gen
COPY scripts/entrypoint-common.sh /opt/openclaw/entrypoint-common.sh
COPY models/glm47-reap-w4a16/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/openclaw-image-gen

# Expose ports
# 8000: vLLM API
# 18789: OpenClaw Gateway
# 22: SSH
EXPOSE 8000 18789 22

ENTRYPOINT ["/entrypoint.sh"]
