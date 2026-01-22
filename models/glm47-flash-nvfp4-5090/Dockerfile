# Dockerfile for GLM-4.7-Flash NVFP4 on RTX 5090 (Blackwell SM120)
#
# Pre-built vLLM images don't work on Blackwell because PyTorch lacks SM120 support.
# Solution: Use NGC container for CUDA 12.8 + PyTorch nightly + build vLLM from source.
# Reference: https://discuss.vllm.ai/t/vllm-on-rtx5090-working-gpu-setup-with-torch-2-9-0-cu128/1492

FROM nvcr.io/nvidia/pytorch:25.02-py3

ARG VLLM_VERSION=main
ARG MAX_JOBS=8

# ALL environment variables for SM120/Blackwell build
ENV TORCH_CUDA_ARCH_LIST="12.0" \
    CMAKE_CUDA_ARCHITECTURES="120" \
    VLLM_FLASH_ATTN_VERSION=2 \
    VLLM_TARGET_DEVICE=cuda \
    MAX_JOBS=${MAX_JOBS} \
    PATH="/usr/lib/ccache:${PATH}" \
    CCACHE_DIR="/workspace/.ccache"

# Install build deps and SSH
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server ccache git curl && \
    rm -f /etc/ssh/ssh_host_* && mkdir -p /var/run/sshd && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Step 1: Install PyTorch nightly with cu128 (MUST have Float8_e8m0fnu)
# Verify it actually installed correctly
RUN pip uninstall -y torch torchvision torchaudio || true && \
    pip install --pre torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/nightly/cu128 && \
    python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA: {torch.version.cuda}'); from torch import _C; print('Float8_e8m0fnu check...'); assert hasattr(torch, 'float8_e8m0fnu') or 'e8m0' in str(dir(_C)), 'Missing Float8_e8m0fnu!'"

# Step 2: Clone vLLM
WORKDIR /tmp/vllm-build
RUN for i in 1 2 3 4 5; do \
        git clone --depth 1 --branch ${VLLM_VERSION} https://github.com/vllm-project/vllm.git . && break || \
        (echo "Retry $i..." && sleep 10); \
    done

# Step 3: Prepare build WITHOUT reinstalling PyTorch
RUN python use_existing_torch.py && \
    pip install --no-cache-dir -r requirements/build.txt && \
    pip install --no-cache-dir setuptools_scm

# Step 4: Build vLLM with explicit SM120 target
RUN TORCH_CUDA_ARCH_LIST="12.0" CMAKE_CUDA_ARCHITECTURES="120" \
    pip install --no-build-isolation -e . && \
    rm -rf .git

WORKDIR /

# Node.js and GitHub CLI
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y --no-install-recommends nodejs gh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "huggingface_hub[cli]"
RUN npm install -g --prefer-offline @anthropic-ai/claude-code clawdbot && npm cache clean --force

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
