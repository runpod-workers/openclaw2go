# engines/Dockerfile - Pre-built llama.cpp binaries for OpenClaw2Go
#
# Builds LLM and Audio engines separately (incompatible .so files).
# Produces a minimal image with just binaries + libs at /opt/engines/.
# The main Dockerfile.unified COPYs from this image — no compilation needed.
#
# Build:
#   docker build -f engines/Dockerfile -t runpod/openclaw2go-engines:latest .
#
# Only rebuild when:
#   - llama.cpp has a new version you need
#   - Adding a new CUDA architecture (new GPU support)
#   - The audio PR branch (liquid-audio) updates

ARG CUDA_VERSION=12.8
ARG UBUNTU_VERSION=24.04
ARG CUDA_ARCHITECTURES="80;89;90;120"

# ============================================================
# Stage 1: Build llama.cpp LLM server (main branch)
# ============================================================
FROM nvcr.io/nvidia/cuda-dl-base:25.03-cuda${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION} AS llamacpp-llm

ARG CUDA_ARCHITECTURES

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 https://github.com/ggml-org/llama.cpp.git && \
    cd llama.cpp && \
    cmake -B build \
        -DGGML_CUDA=ON \
        -DGGML_NATIVE=OFF \
        -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCHITECTURES}" \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined && \
    cmake --build build --config Release -j$(nproc)

# ============================================================
# Stage 2: Build llama.cpp Audio server (PR #18641 - liquid-audio)
# ============================================================
FROM nvcr.io/nvidia/cuda-dl-base:25.03-cuda${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION} AS llamacpp-audio

ARG CUDA_ARCHITECTURES

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone https://github.com/ggml-org/llama.cpp.git && \
    cd llama.cpp && \
    git fetch origin pull/18641/head:liquid-audio && \
    git checkout liquid-audio && \
    cmake -B build \
        -DGGML_CUDA=ON \
        -DGGML_NATIVE=OFF \
        -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCHITECTURES}" \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_CUDA_COMPILER=/usr/local/cuda/bin/nvcc \
        -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined && \
    cmake --build build --target llama-liquid-audio-cli llama-liquid-audio-server -j$(nproc)

# ============================================================
# Stage 3: Minimal output image with just binaries + libs
# ============================================================
FROM ubuntu:24.04

# LLM engine
COPY --from=llamacpp-llm /build/llama.cpp/build/bin/llama-server /opt/engines/llamacpp-llm/bin/
COPY --from=llamacpp-llm /build/llama.cpp/build/bin/llama-cli /opt/engines/llamacpp-llm/bin/
COPY --from=llamacpp-llm /build/llama.cpp/build/bin/*.so* /opt/engines/llamacpp-llm/lib/

# Audio engine
COPY --from=llamacpp-audio /build/llama.cpp/build/bin/llama-liquid-audio-cli /opt/engines/llamacpp-audio/bin/
COPY --from=llamacpp-audio /build/llama.cpp/build/bin/llama-liquid-audio-server /opt/engines/llamacpp-audio/bin/
COPY --from=llamacpp-audio /build/llama.cpp/build/bin/*.so* /opt/engines/llamacpp-audio/lib/

RUN chmod +x /opt/engines/llamacpp-llm/bin/* /opt/engines/llamacpp-audio/bin/*

# Metadata
LABEL org.opencontainers.image.description="Pre-built llama.cpp engines for OpenClaw2Go"
