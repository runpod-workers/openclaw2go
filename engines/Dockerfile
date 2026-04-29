# engines/Dockerfile - Pre-built llama.cpp binaries for agent2go
#
# Builds a2go-llamacpp — mainline rebase + cherry-picked PRs.
# Audio support (LFM2.5) is now built into llama-server via the mtmd library.
#
# The main Dockerfile.unified COPYs from this image — no compilation needed.
#
# Build:
#   docker build -f engines/Dockerfile -t runpod/a2go-engines:latest .
#
# Only rebuild when:
#   - Our a2go-llamacpp fork has a new release
#   - Adding a new CUDA architecture (new GPU support)

ARG CUDA_VERSION=12.8
ARG UBUNTU_VERSION=24.04
ARG CUDA_ARCHITECTURES="80;89;90;100;120"
ARG LLAMACPP_OPENCLAW_TAG=main

# ============================================================
# Stage 1: Build a2go-llamacpp (unified fork)
# ============================================================
# Our fork at github.com/runpod-labs/a2go-llamacpp:
#   Mainline rebase + PR #18039 (Eagle-3 speculative decoding)
FROM nvcr.io/nvidia/cuda-dl-base:25.03-cuda${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION} AS a2go-llamacpp

ARG CUDA_ARCHITECTURES
ARG LLAMACPP_OPENCLAW_TAG

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 --branch ${LLAMACPP_OPENCLAW_TAG} \
        https://github.com/runpod-labs/a2go-llamacpp.git && \
    cd a2go-llamacpp && \
    cmake -B build \
        -DGGML_CUDA=ON \
        -DGGML_NATIVE=OFF \
        -DBUILD_SHARED_LIBS=ON \
        -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCHITECTURES}" \
        -DCMAKE_BUILD_TYPE=Release \
        -DLLAMA_BUILD_TESTS=OFF \
        -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined && \
    cmake --build build --config Release -j$(nproc)

# ============================================================
# Stage 2: Build ik_llama.cpp (custom quants - IQ2_KS, smol-IQ3_KS)
# ============================================================
# Kept separate: custom GGML types (139+) are fundamentally incompatible
# with standard llama.cpp and cannot be cherry-picked.
FROM nvcr.io/nvidia/cuda-dl-base:25.03-cuda${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION} AS ik-llamacpp

ARG CUDA_ARCHITECTURES

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 https://github.com/ikawrakow/ik_llama.cpp.git && \
    cd ik_llama.cpp && \
    cmake -B build \
        -DGGML_CUDA=ON \
        -DGGML_NATIVE=OFF \
        -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCHITECTURES}" \
        -DCMAKE_BUILD_TYPE=Release \
        -DLLAMA_BUILD_TESTS=OFF \
        -DCMAKE_LIBRARY_OUTPUT_DIRECTORY=/build/ik_llama.cpp/build/bin \
        -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined && \
    cmake --build build --config Release -j$(nproc)

# ============================================================
# Stage 3: Minimal output image with just binaries + libs
# ============================================================
FROM ubuntu:24.04

# a2go-llamacpp engine (LLM, Vision, Embeddings, TTS, Audio)
COPY --from=a2go-llamacpp /build/a2go-llamacpp/build/bin/llama-server /opt/engines/a2go-llamacpp/bin/
COPY --from=a2go-llamacpp /build/a2go-llamacpp/build/bin/llama-cli /opt/engines/a2go-llamacpp/bin/
COPY --from=a2go-llamacpp /build/a2go-llamacpp/build/bin/llama-tts /opt/engines/a2go-llamacpp/bin/
COPY --from=a2go-llamacpp /build/a2go-llamacpp/build/bin/*.so* /opt/engines/a2go-llamacpp/lib/

RUN chmod +x /opt/engines/a2go-llamacpp/bin/*

# Metadata
LABEL org.opencontainers.image.description="Pre-built llama.cpp engines for agent2go (mainline rebase)"
