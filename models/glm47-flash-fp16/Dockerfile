# Dockerfile for GLM-4.7-Flash FP16 on A100/H100 80GB
# Model: zai-org/GLM-4.7-Flash (~56GB VRAM base, ~31GB disk)
#
# IMPORTANT: Requires 100GB container disk for model files!
# Set containerDiskInGb: 100 when creating the pod.
#
# GPU compatibility (with FP8 KV cache):
# - A100 80GB: 32k context ($1.19-1.49/hr) <- BEST VALUE
# - H100 80GB: 64k context ($1.99/hr)
# - A100 40GB: 16k context ($0.69/hr)

FROM runpod/pytorch:1.0.3-cu1290-torch291-ubuntu2404

# Install Node.js 22.x and GitHub CLI in single layer to reduce image size
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends nodejs gh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# IMPORTANT: GLM-4.7-Flash requires:
# 1. vLLM NIGHTLY from wheels.vllm.ai (NOT PyPI!) - for glm47 tool parser
# 2. transformers from git (NOT PyPI!) - for glm4_moe_lite architecture
# The stable PyPI versions do NOT support this model!
RUN uv pip install --system -U vllm \
    --pre \
    --index-url https://pypi.org/simple \
    --extra-index-url https://wheels.vllm.ai/nightly && \
    uv pip install --system git+https://github.com/huggingface/transformers.git

# Image generation dependencies (SDNQ + Diffusers)
RUN uv pip install --system sdnq diffusers accelerate safetensors

# Install OpenClaw
RUN npm install -g --prefer-offline openclaw@latest && \
    npm cache clean --force

# Keep model files on container disk (requires 100GB)
# Only use workspace for persistent OpenClaw state
RUN mkdir -p /workspace/.openclaw /workspace/openclaw

# Environment variables
# HF_HOME on container disk (100GB needed), OpenClaw state on workspace
ENV HF_HOME=/root/.cache/huggingface
ENV OPENCLAW_WORKSPACE=/workspace/openclaw
ENV MODEL_NAME=zai-org/GLM-4.7-Flash
ENV SERVED_MODEL_NAME=glm-4.7-flash
ENV VLLM_API_KEY=changeme
ENV GPU_MEMORY_UTILIZATION=0.92
ENV TOOL_CALL_PARSER=glm47
# MAX_MODEL_LEN is auto-detected based on GPU - don't set here

# Copy entrypoint scripts + skills + CLI
COPY openclaw/skills/ /opt/openclaw/skills/
COPY scripts/openclaw-image-gen /usr/local/bin/openclaw-image-gen
COPY scripts/entrypoint-common.sh /opt/openclaw/entrypoint-common.sh
COPY models/glm47-flash-fp16/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/openclaw-image-gen

# Expose ports
# 8000: vLLM API
# 18789: OpenClaw Gateway
# 22: SSH
EXPOSE 8000 18789 22

ENTRYPOINT ["/entrypoint.sh"]
