# engines/Dockerfile - Pre-built llama.cpp binaries for OpenClaw2Go
#
# Builds 2 engines:
#   1. openclaw2go-llamacpp — Our unified fork merging main + unmerged PRs
#      (audio/TTS, GLM-5 DSA, OuteTTS 1.0, Eagle-3 spec decode)
#   2. ik-llamacpp — ikawrakow fork (custom quant types IQ2_KS, smol-IQ3_KS)
#
# The main Dockerfile.unified COPYs from this image — no compilation needed.
#
# Build:
#   docker build -f engines/Dockerfile -t runpod/openclaw2go-engines:latest .
#
# Only rebuild when:
#   - Our openclaw2go-llamacpp fork has a new release
#   - ik_llama.cpp updates
#   - Adding a new CUDA architecture (new GPU support)

ARG CUDA_VERSION=12.8
ARG UBUNTU_VERSION=24.04
ARG CUDA_ARCHITECTURES="80;89;90;100;120"
ARG LLAMACPP_OPENCLAW_TAG=main

# ============================================================
# Stage 1: Build openclaw2go-llamacpp (unified fork)
# ============================================================
# Our fork at github.com/runpod-workers/openclaw2go-llamacpp merges:
#   - llama.cpp b8323 (LLM, vision, embeddings, reranking, Nemotron-3-Super)
#   - PR #18641 (liquid-audio: TTS/STT for LFM2.5)
#   - PR #18039 (Eagle-3 speculative decoding)
FROM nvcr.io/nvidia/cuda-dl-base:25.03-cuda${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION} AS openclaw2go-llamacpp

ARG CUDA_ARCHITECTURES
ARG LLAMACPP_OPENCLAW_TAG

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 --branch ${LLAMACPP_OPENCLAW_TAG} \
        https://github.com/runpod-workers/openclaw2go-llamacpp.git && \
    cd openclaw2go-llamacpp && \
    cmake -B build \
        -DGGML_CUDA=ON \
        -DGGML_NATIVE=OFF \
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

# openclaw2go-llamacpp engine (unified: LLM, Audio, Vision, Embeddings, TTS, etc.)
COPY --from=openclaw2go-llamacpp /build/openclaw2go-llamacpp/build/bin/llama-server /opt/engines/openclaw2go-llamacpp/bin/
COPY --from=openclaw2go-llamacpp /build/openclaw2go-llamacpp/build/bin/llama-cli /opt/engines/openclaw2go-llamacpp/bin/
COPY --from=openclaw2go-llamacpp /build/openclaw2go-llamacpp/build/bin/llama-tts /opt/engines/openclaw2go-llamacpp/bin/
COPY --from=openclaw2go-llamacpp /build/openclaw2go-llamacpp/build/bin/llama-liquid-audio-cli /opt/engines/openclaw2go-llamacpp/bin/
COPY --from=openclaw2go-llamacpp /build/openclaw2go-llamacpp/build/bin/llama-liquid-audio-server /opt/engines/openclaw2go-llamacpp/bin/
COPY --from=openclaw2go-llamacpp /build/openclaw2go-llamacpp/build/bin/*.so* /opt/engines/openclaw2go-llamacpp/lib/

# ik_llama.cpp engine (custom quants: IQ2_KS, smol-IQ3_KS)
COPY --from=ik-llamacpp /build/ik_llama.cpp/build/bin/llama-server /opt/engines/ik-llamacpp/bin/
COPY --from=ik-llamacpp /build/ik_llama.cpp/build/bin/llama-cli /opt/engines/ik-llamacpp/bin/
COPY --from=ik-llamacpp /build/ik_llama.cpp/build/bin/*.so* /opt/engines/ik-llamacpp/lib/

RUN chmod +x /opt/engines/openclaw2go-llamacpp/bin/* /opt/engines/ik-llamacpp/bin/*

# Metadata
LABEL org.opencontainers.image.description="Pre-built llama.cpp engines for OpenClaw2Go (unified fork + ik_llama.cpp)"
