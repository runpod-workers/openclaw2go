# Dockerfile for GLM-4.7-Flash NVFP4 on RTX 5090 (Blackwell SM120)
#
# Model: GadflyII/GLM-4.7-Flash-NVFP4
# Context: 200,000 tokens
# Cost: ~$0.89/hr (RTX 5090)
#
# Pre-built vLLM images don't work on Blackwell because PyTorch in those images
# lacks SM120 support. Solution: Use NGC PyTorch container + build vLLM from source.
# Reference: https://discuss.vllm.ai/t/vllm-on-rtx5090-working-gpu-setup-with-torch-2-9-0-cu128/1492
# Reference: https://github.com/vllm-project/vllm/issues/14452

# NGC PyTorch container with CUDA 12.8 and PyTorch 2.6 (has proper Blackwell support)
FROM nvcr.io/nvidia/pytorch:25.02-py3

# Build arguments
ARG VLLM_VERSION=main
ARG MAX_JOBS=8

# Environment for building vLLM with Blackwell support
ENV TORCH_CUDA_ARCH_LIST="12.0"
ENV VLLM_FLASH_ATTN_VERSION=2
ENV MAX_JOBS=${MAX_JOBS}

# Install build dependencies and SSH server
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openssh-server \
        ccache \
        git \
        curl \
    && rm -f /etc/ssh/ssh_host_* \
    && mkdir -p /var/run/sshd \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Setup ccache for faster rebuilds
ENV PATH="/usr/lib/ccache:${PATH}"
ENV CCACHE_DIR="/workspace/.ccache"

# Clone and build vLLM from source
WORKDIR /tmp/vllm-build
RUN git clone --depth 1 --branch ${VLLM_VERSION} https://github.com/vllm-project/vllm.git . \
    && python use_existing_torch.py \
    && pip install --no-cache-dir -r requirements/build.txt \
    && pip install --no-cache-dir setuptools_scm \
    && pip install --no-build-isolation -e . \
    && rm -rf /tmp/vllm-build/.git

WORKDIR /

# Install Node.js 22.x and GitHub CLI
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

# Install huggingface_hub CLI for model downloads
RUN pip install --no-cache-dir "huggingface_hub[cli]"

# Install Clawdbot and Claude Code
RUN npm install -g --prefer-offline @anthropic-ai/claude-code clawdbot && \
    npm cache clean --force

# Environment defaults
ENV MODEL_NAME="GadflyII/GLM-4.7-Flash-NVFP4"
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
