# engines/Dockerfile - Pre-built llama.cpp binaries for OpenClaw2Go
#
# Builds 2 engines:
#   1. openclaw2go-llamacpp — Our unified fork merging main + unmerged PRs
#      (audio/TTS, GLM-5 DSA, OuteTTS 1.0, Eagle-3 spec decode)
#   2. ik-llamacpp — ikawrakow fork (custom quant types IQ2_KS, smol-IQ3_KS)
#      NOTE: May fail on ARM64. Build is resilient — skips ik-llamacpp if it
#      doesn't compile, and leaves /opt/engines/ik-llamacpp/BUILD_FAILED with
#      the error log so the problem is visible.
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
#   - llama.cpp main (LLM, vision, embeddings, reranking)
#   - PR #18641 (liquid-audio: TTS/STT for LFM2.5)
#   - PR #19460 (glm-dsa: GLM-5 MoE dynamic sparse attention)
#   - PR #12794 (OuteTTS 1.0 native TTS support)
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
        -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined && \
    cmake --build build --config Release -j$(nproc)

# ============================================================
# Stage 2: Build ik_llama.cpp (custom quants - IQ2_KS, smol-IQ3_KS)
# ============================================================
# Kept separate: custom GGML types (139+) are fundamentally incompatible
# with standard llama.cpp and cannot be cherry-picked.
#
# Build is allowed to fail (e.g. on ARM64). On failure, a BUILD_FAILED
# marker is written so downstream stages and the final image surface the issue.
FROM nvcr.io/nvidia/cuda-dl-base:25.03-cuda${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION} AS ik-llamacpp

ARG CUDA_ARCHITECTURES

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
# Create output dir upfront so COPY in stage 3 always has a valid source,
# even if the build fails before cmake creates it.
RUN mkdir -p /build/ik_llama.cpp/build/bin

RUN git clone --depth 1 https://github.com/ikawrakow/ik_llama.cpp.git ik_src && \
    cd ik_src && \
    ( \
      cmake -B build \
          -DGGML_CUDA=ON \
          -DGGML_NATIVE=OFF \
          -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCHITECTURES}" \
          -DCMAKE_BUILD_TYPE=Release \
          -DCMAKE_LIBRARY_OUTPUT_DIRECTORY=/build/ik_llama.cpp/build/bin \
          -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined && \
      cmake --build build --config Release -j$(nproc) && \
      cp build/bin/llama-server build/bin/llama-cli /build/ik_llama.cpp/build/bin/ && \
      cp build/bin/*.so* /build/ik_llama.cpp/build/bin/ 2>/dev/null; true \
    ) 2>&1 || { \
      echo "========================================" ; \
      echo "WARNING: ik_llama.cpp build FAILED on $(uname -m)" ; \
      echo "This is expected on ARM64 — ik_llama.cpp may not support this architecture yet." ; \
      echo "The image will ship WITHOUT ik-llamacpp engine (no IQ2_KS/smol-IQ3_KS quants)." ; \
      echo "========================================" ; \
      echo "ik_llama.cpp build failed on $(uname -m) at $(date -u)" > /build/ik_llama.cpp/build/bin/BUILD_FAILED ; \
    }

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
# Uses shell to conditionally copy — build may have failed (e.g. on ARM64).
# If failed, a BUILD_FAILED marker is preserved so the issue is visible.
RUN mkdir -p /opt/engines/ik-llamacpp/bin /opt/engines/ik-llamacpp/lib
COPY --from=ik-llamacpp /build/ik_llama.cpp/build/bin/ /tmp/ik-build/
RUN if [ -f /tmp/ik-build/llama-server ]; then \
      cp /tmp/ik-build/llama-server /opt/engines/ik-llamacpp/bin/ && \
      cp /tmp/ik-build/llama-cli /opt/engines/ik-llamacpp/bin/ && \
      cp /tmp/ik-build/*.so* /opt/engines/ik-llamacpp/lib/ 2>/dev/null; \
      echo "ik-llamacpp: OK" ; \
    elif [ -f /tmp/ik-build/BUILD_FAILED ]; then \
      cp /tmp/ik-build/BUILD_FAILED /opt/engines/ik-llamacpp/BUILD_FAILED && \
      echo "========================================" && \
      echo "WARNING: ik-llamacpp engine NOT available in this image" && \
      cat /opt/engines/ik-llamacpp/BUILD_FAILED && \
      echo "========================================" ; \
    else \
      echo "ERROR: unexpected state — no binaries and no BUILD_FAILED marker" && exit 1 ; \
    fi && \
    rm -rf /tmp/ik-build

RUN chmod +x /opt/engines/openclaw2go-llamacpp/bin/* && \
    (chmod +x /opt/engines/ik-llamacpp/bin/* 2>/dev/null || true)

# Metadata
LABEL org.opencontainers.image.description="Pre-built llama.cpp engines for OpenClaw2Go (unified fork + ik_llama.cpp)"
