# Dockerfile for GLM-4.7-Flash NVFP4 on RTX 5090 (Blackwell SM120)
#
# Model: GadflyII/GLM-4.7-Flash-NVFP4
# Context: 200,000 tokens
# Cost: ~$0.89/hr (RTX 5090)
#
# Uses official vLLM image with CUDA 13.0 for SM120 (Blackwell) support

FROM vllm/vllm-openai:v0.14.0-cu130

# Install SSH server (for RunPod remote access)
# Remove host keys - they'll be generated at runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssh-server && \
    rm -f /etc/ssh/ssh_host_* && \
    mkdir -p /var/run/sshd && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

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

# Flash Attention 2 for Blackwell (FA3 doesn't work yet)
ENV VLLM_FLASH_ATTN_VERSION=2

# Clawdbot workspace
ENV CLAWDBOT_HOME="/workspace/.clawdbot"
ENV CLAWDBOT_WORKSPACE="/workspace/clawd"

COPY entrypoint.sh benchmark.sh /
RUN chmod +x /entrypoint.sh /benchmark.sh

EXPOSE 8000 18789 22
ENTRYPOINT ["/entrypoint.sh"]
