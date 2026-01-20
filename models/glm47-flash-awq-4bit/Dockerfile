# Dockerfile for GLM-4.7-Flash AWQ 4-bit on A100 80GB
# Model: cyankiwi/GLM-4.7-Flash-AWQ-4bit (~18GB on disk, ~71GB VRAM total)
#
# Specifications:
# - Model Size: 18GB on disk
# - VRAM (model): ~17.3GB
# - VRAM (KV cache): ~54GB (114k context with FP8)
# - Total VRAM: ~71GB -> requires A100 80GB
# - Context Window: 114,688 tokens
# - Cost: ~$1.19/hr (A100 80GB)
#
# Storage: Uses network volume at /workspace/models/ for persistence

FROM runpod/pytorch:1.0.3-cu1290-torch291-ubuntu2404

# Install vLLM nightly (required for glm47 tool parser) and dependencies
# GLM-4.7 models need:
# 1. vLLM nightly from wheels.vllm.ai/nightly/cu130 (x86_64 wheels available) - for glm47 tool parser
# 2. transformers from git (NOT PyPI!) - for glm4_moe_lite architecture
# Note: --break-system-packages needed for Ubuntu 24.04 externally managed Python
# Note: Using pip install from direct URL to force nightly wheel
RUN pip install --break-system-packages -U "vllm @ https://wheels.vllm.ai/nightly/cu130/vllm-0.14.0rc2.dev185+g226134080.cu130-cp38-abi3-manylinux_2_35_x86_64.whl" && \
    pip install --break-system-packages huggingface_hub && \
    pip install --break-system-packages --no-deps git+https://github.com/huggingface/transformers.git

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

# Install Clawdbot and Claude Code
RUN npm install -g --prefer-offline @anthropic-ai/claude-code clawdbot && \
    npm cache clean --force

# Environment defaults
ENV MODEL_NAME="cyankiwi/GLM-4.7-Flash-AWQ-4bit"
ENV MODEL_PATH="/workspace/models/GLM-4.7-Flash-AWQ-4bit"
ENV SERVED_MODEL_NAME="glm-4.7-flash"
ENV MAX_MODEL_LEN="114688"
ENV VLLM_API_KEY="changeme"

# Clawdbot workspace
ENV CLAWDBOT_HOME="/workspace/.clawdbot"
ENV CLAWDBOT_WORKSPACE="/workspace/clawd"

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000 18789 22
ENTRYPOINT ["/entrypoint.sh"]
