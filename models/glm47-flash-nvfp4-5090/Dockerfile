# Dockerfile for GLM-4.7-Flash NVFP4 on RTX 5090 (Blackwell SM120)
# Model: Gadflyll/GLM-4.7-Flash-NVFP4 (~20.4GB on disk, ~30GB VRAM total with MLA)
#
# VERSIONS:
# - Base: nvcr.io/nvidia/pytorch:25.02-py3 (CUDA 12.8)
# - PyTorch: 2.9 nightly (cu128) - required for vLLM 0.14+
# - vLLM: Latest (0.14+)
# - Transformers: 5.0.0rc2 (pre-release with glm4_moe_lite support)
#
# Specifications:
# - Model Size: ~20.4GB on disk (NVFP4 quantization)
# - VRAM (model): ~20GB
# - VRAM (KV cache with MLA): ~10GB for 200K context
# - Total VRAM: ~30GB -> fits in RTX 5090 32GB
# - Context Window: 200,000 tokens
# - Cost: ~$0.89/hr (RTX 5090) vs $1.39/hr (A100 80GB)
#
# Storage: Uses network volume at /workspace/models/ for persistence

FROM nvcr.io/nvidia/pytorch:25.02-py3

# Critical: Force Flash Attention v2 (v3 doesn't work on Blackwell yet)
ENV VLLM_FLASH_ATTN_VERSION=2

# Install uv for fast package management
RUN pip install uv

# Upgrade PyTorch to 2.9 nightly (required for vLLM 0.14+ and SM120)
# Then install vLLM and dependencies
RUN uv pip install --system --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128 && \
    uv pip install --system vllm && \
    uv pip install --system "transformers>=5.0.0rc2" --pre && \
    uv pip install --system "huggingface_hub[cli]"

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
ENV MODEL_NAME="Gadflyll/GLM-4.7-Flash-NVFP4"
ENV MODEL_PATH="/workspace/models/GLM-4.7-Flash-NVFP4"
ENV SERVED_MODEL_NAME="glm-4.7-flash"
ENV MAX_MODEL_LEN="200000"
ENV VLLM_API_KEY="changeme"

# Clawdbot workspace
ENV CLAWDBOT_HOME="/workspace/.clawdbot"
ENV CLAWDBOT_WORKSPACE="/workspace/clawd"

COPY entrypoint.sh benchmark.sh /
RUN chmod +x /entrypoint.sh /benchmark.sh

EXPOSE 8000 18789 22
ENTRYPOINT ["/entrypoint.sh"]
