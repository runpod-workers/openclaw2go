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

FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

# Install vLLM nightly and dependencies
# Note: vLLM nightly is required for native Glm4MoeLiteForCausalLM support
# The commit-specific wheel URL ensures reproducible builds
RUN VLLM_WHEEL="vllm-0.14.0rc2.dev187+g22375f8d1-cp38-abi3-manylinux_2_31_x86_64.whl" && \
    curl -L -o "/tmp/${VLLM_WHEEL}" "https://wheels.vllm.ai/22375f8d13dbf5c201c6f1564f72310193930816/vllm-0.14.0rc2.dev187%2Bg22375f8d1-cp38-abi3-manylinux_2_31_x86_64.whl" && \
    pip install "/tmp/${VLLM_WHEEL}" "huggingface_hub[cli]" && \
    pip install git+https://github.com/huggingface/transformers.git && \
    rm "/tmp/${VLLM_WHEEL}"

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
