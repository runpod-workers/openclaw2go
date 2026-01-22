# Dockerfile for GLM-4.7-Flash NVFP4 on RTX 5090 (Blackwell SM120)
#
# Based on working solution from: https://github.com/BoltzmannEntropy/vLLM-5090
# Key: Use vLLM nightly wheels from wheels.vllm.ai (NOT building from source!)

ARG CUDA_VERSION=12.8
ARG UBUNTU_VERSION=24.04

FROM nvcr.io/nvidia/cuda-dl-base:25.03-cuda${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION}

ARG CUDA_VERSION
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ccache software-properties-common git curl sudo \
    python3 python3-dev python3-venv python3-pip \
    openssh-server \
    && rm -f /etc/ssh/ssh_host_* && mkdir -p /var/run/sshd \
    && ldconfig /usr/local/cuda-$(echo $CUDA_VERSION | cut -d. -f1,2)/compat/ \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv ~/.local/bin/uv /usr/local/bin/ \
    && rm -f /usr/lib/python*/EXTERNALLY-MANAGED \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# CRITICAL: CUDA arch settings for Blackwell SM120
ENV TORCH_CUDA_ARCH_LIST="10.0+PTX 12.0+PTX" \
    FLASH_ATTN_CUDA_ARCHS=120 \
    VLLM_FA_CMAKE_GPU_ARCHES="80-real;90-real;100-real"

WORKDIR /workspace

# Install vLLM from their nightly wheel repo (has SM120 support!)
RUN uv pip install --system --prerelease=allow \
    'vllm[runai,tensorizer,flashinfer]' \
    --extra-index-url https://wheels.vllm.ai/nightly \
    --index-strategy unsafe-best-match && \
    python3 -c "import vllm; print(f'vLLM {vllm.__version__} installed')"

# Install Node.js and GitHub CLI
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y --no-install-recommends nodejs gh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install tools
RUN uv pip install --system "huggingface_hub[cli]" && \
    npm install -g --prefer-offline @anthropic-ai/claude-code clawdbot && \
    npm cache clean --force

WORKDIR /

ENV MODEL_NAME="GadflyII/GLM-4.7-Flash-NVFP4" \
    MODEL_PATH="/workspace/models/GLM-4.7-Flash-NVFP4" \
    SERVED_MODEL_NAME="glm-4.7-flash" \
    MAX_MODEL_LEN="200000" \
    VLLM_API_KEY="changeme" \
    CLAWDBOT_HOME="/workspace/.clawdbot" \
    CLAWDBOT_WORKSPACE="/workspace/clawd"

COPY entrypoint.sh benchmark.sh /
RUN chmod +x /entrypoint.sh /benchmark.sh

EXPOSE 8000 18789 22
ENTRYPOINT ["/entrypoint.sh"]
