#!/usr/bin/env python3
"""
resolve-profile.py - Resolve OpenClaw2Go configuration to a runnable service set.

Reads OPENCLAW_CONFIG env var (JSON), resolves against registry files,
detects GPU via nvidia-smi, validates VRAM budget, auto-computes optimal
context length, and outputs resolved config JSON to stdout.

Config format (OPENCLAW_CONFIG env var):

  Model-based (primary approach):
    {"llm": true, "audio": true, "image": true}     — use default models
    {"llm": "glm47-flash-gguf", "audio": true}       — specific LLM, default audio
    {"llm": true}                                     — LLM only
    {"llm": true, "audio": true}                      — LLM + audio
    {"llm": true, "contextLength": 200000}            — override context length

  Profile shorthand (optional presets):
    {"profile": "rtx5090-full-stack"}                 — load a pre-defined preset

  Auto (empty or missing):
    {}                                                — detect GPU, use all defaults
"""

import json
import os
import subprocess
import sys
from pathlib import Path

REGISTRY_DIR = Path(os.environ.get("OPENCLAW_REGISTRY_DIR", "/opt/openclaw/registry"))

# Approximate KV cache VRAM per 1k context tokens for GLM-4.7 with q8_0 quantization
# Based on observed: ~10GB for 150k context, ~14GB for 200k context
KV_CACHE_MB_PER_1K_TOKENS = 40


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_all_json(directory):
    result = {}
    d = Path(directory)
    if not d.is_dir():
        return result
    for f in d.glob("*.json"):
        data = load_json(f)
        key = data.get("id", f.stem)
        result[key] = data
    return result


def detect_gpu():
    """Detect GPU name and VRAM via nvidia-smi."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            text=True, timeout=10
        ).strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        return None, 0

    line = out.splitlines()[0] if out else ""
    parts = [p.strip() for p in line.split(",")]
    if len(parts) < 2:
        return None, 0

    name = parts[0]
    try:
        vram_mb = int(parts[1])
    except ValueError:
        vram_mb = 0

    return name, vram_mb


def match_gpu(gpu_name, gpu_registry):
    """Match detected GPU name to a registry entry."""
    if not gpu_name:
        return None
    name_lower = gpu_name.lower()
    for gpu_id, gpu in gpu_registry.items():
        registry_name = gpu["name"].lower()
        for token in registry_name.split():
            if token in name_lower:
                return gpu
    return None


def get_default_model(models, model_type):
    """Get the default model for a given type (llm/audio/image)."""
    for model_id, model in models.items():
        if model.get("type") == model_type and model.get("default"):
            return model
    # Fallback: first stable model of this type
    for model_id, model in models.items():
        if model.get("type") == model_type and model.get("status") == "stable":
            return model
    return None


def resolve_model(value, models, model_type):
    """Resolve a config value to a model. True = default, string = specific model ID."""
    if value is True:
        model = get_default_model(models, model_type)
        if not model:
            print(f"ERROR: no default model found for type '{model_type}'", file=sys.stderr)
            sys.exit(1)
        return model
    elif isinstance(value, str):
        if value not in models:
            print(f"ERROR: unknown model '{value}' for type '{model_type}'", file=sys.stderr)
            available = [m for m, d in models.items() if d.get("type") == model_type]
            print(f"Available {model_type} models: {', '.join(available)}", file=sys.stderr)
            sys.exit(1)
        return models[value]
    return None


def get_kv_cache_rate(llm_model):
    """Get per-model KV cache rate, falling back to global default."""
    return llm_model.get("kvCacheMbPer1kTokens", KV_CACHE_MB_PER_1K_TOKENS)


def compute_max_context(vram_available_mb, llm_model):
    """Compute max context length that fits in available VRAM for the LLM."""
    if not llm_model:
        return None
    base_vram = llm_model["vram"]["model"] + llm_model["vram"]["overhead"]
    available_for_kv = vram_available_mb - base_vram
    if available_for_kv <= 0:
        return 0
    kv_rate = get_kv_cache_rate(llm_model)
    return int((available_for_kv / kv_rate) * 1000)


def compute_kv_cache_vram(context_length, llm_model):
    """Compute KV cache VRAM for a given context length."""
    kv_rate = get_kv_cache_rate(llm_model)
    return int((context_length / 1000) * kv_rate)


def build_from_models(config, models, engines, gpu_vram_mb):
    """Build service list from model-based config. Core resolver logic."""
    services = []
    total_vram = 0

    role_ports = {"llm": 8000, "audio": 8001, "image": 8002}
    selected_models = {}

    # Resolve which models to use
    for role in ("llm", "audio", "image"):
        value = config.get(role)
        if value is None or value is False:
            continue
        model = resolve_model(value, models, role)
        if model:
            selected_models[role] = model

    if not selected_models:
        print("ERROR: no models selected. Specify at least one of: llm, audio, image", file=sys.stderr)
        sys.exit(1)

    # Compute VRAM for non-LLM models first
    non_llm_vram = 0
    for role, model in selected_models.items():
        if role != "llm":
            non_llm_vram += model["vram"]["model"] + model["vram"]["overhead"]

    # For LLM, compute optimal context length
    llm_model = selected_models.get("llm")
    context_length = config.get("contextLength")
    computed_context = None

    if llm_model and gpu_vram_mb > 0:
        if llm_model["engine"] == "vllm":
            # vLLM auto-manages KV cache — use model default or user override
            if not context_length:
                context_length = llm_model.get("defaults", {}).get("contextLength", 65536)
                computed_context = context_length
                print(f"vLLM context length: {context_length:,} tokens (model default, KV auto-managed)",
                      file=sys.stderr)
        else:
            vram_for_llm = gpu_vram_mb - non_llm_vram
            max_ctx = compute_max_context(vram_for_llm, llm_model)

            if context_length:
                # User specified context length — validate it fits
                needed_kv = compute_kv_cache_vram(context_length, llm_model)
                needed_total = llm_model["vram"]["model"] + llm_model["vram"]["overhead"] + needed_kv + non_llm_vram
                if needed_total > gpu_vram_mb:
                    print(f"WARNING: requested context {context_length:,} needs ~{needed_total} MB "
                          f"but GPU has {gpu_vram_mb} MB. Max safe context: {max_ctx:,}", file=sys.stderr)
            else:
                # Auto-compute: use max context that fits, capped at model default
                model_default_ctx = llm_model.get("defaults", {}).get("contextLength", 150000)
                context_length = min(max_ctx, model_default_ctx) if max_ctx else model_default_ctx
                computed_context = context_length
                print(f"Auto-computed context length: {context_length:,} tokens "
                      f"(max possible: {max_ctx:,})", file=sys.stderr)

    # Build service entries
    for role in ("llm", "audio", "image"):
        model = selected_models.get(role)
        if not model:
            continue

        engine_id = model["engine"]
        engine = engines.get(engine_id, {})
        port = role_ports[role]
        overrides = {}

        model_vram = model["vram"]["model"] + model["vram"]["overhead"]

        if role == "llm":
            ctx = context_length or model.get("defaults", {}).get("contextLength", 150000)
            overrides["contextLength"] = ctx

            engine_id = model["engine"]
            if engine_id == "vllm":
                # vLLM auto-manages KV cache via --gpu-memory-utilization
                # Adjust utilization to leave room for non-LLM services
                # Add 2GB safety margin for CUDA runtime overhead + conservative VRAM estimates
                VRAM_SAFETY_MARGIN_MB = 2048
                if gpu_vram_mb > 0 and non_llm_vram > 0:
                    adjusted_util = (gpu_vram_mb - non_llm_vram - VRAM_SAFETY_MARGIN_MB) / gpu_vram_mb
                    overrides["gpuMemoryUtilization"] = f"{adjusted_util:.2f}"
                else:
                    default_util = model.get("startDefaults", {}).get("gpuMemoryUtilization", "0.92")
                    overrides["gpuMemoryUtilization"] = default_util
                # Don't add KV cache VRAM — vLLM handles it
            else:
                # llama.cpp — manual KV cache computation
                kv_vram = compute_kv_cache_vram(ctx, model)
                model_vram += kv_vram

            # Get gpuLayers from config or model defaults
            gpu_layers = config.get("gpuLayers", model.get("startDefaults", {}).get("gpuLayers", "999"))
            overrides["gpuLayers"] = str(gpu_layers)

        services.append({
            "role": role,
            "model": model,
            "engine": engine,
            "port": port,
            "overrides": overrides,
        })
        total_vram += model_vram

    return services, total_vram, computed_context


def build_from_profile(profile, models, engines):
    """Build service list from a profile preset."""
    services = []
    for svc in profile["services"]:
        model_id = svc["model"]
        model = models[model_id]
        engine_id = model["engine"]
        engine = engines[engine_id]
        port = svc.get("port", model.get("defaults", {}).get("port", 8000))
        overrides = svc.get("overrides", {})

        services.append({
            "role": svc["role"],
            "model": model,
            "engine": engine,
            "port": port,
            "overrides": overrides,
        })

    return services, profile.get("vramTotal", 0)


def main():
    raw_config = os.environ.get("OPENCLAW_CONFIG", "").strip()
    if raw_config:
        try:
            config = json.loads(raw_config)
        except json.JSONDecodeError as e:
            print(f"ERROR: invalid OPENCLAW_CONFIG JSON: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        config = {}

    # Load registry
    engines = load_json(REGISTRY_DIR / "engines.json")
    models = load_all_json(REGISTRY_DIR / "models")
    gpus = load_all_json(REGISTRY_DIR / "gpus")
    profiles = load_all_json(REGISTRY_DIR / "profiles")

    # Detect GPU
    gpu_name, gpu_vram = detect_gpu()
    detected_gpu = match_gpu(gpu_name, gpus)
    if detected_gpu:
        print(f"Detected GPU: {gpu_name} ({gpu_vram} MB) → {detected_gpu['id']}", file=sys.stderr)
    else:
        print(f"Detected GPU: {gpu_name or 'none'} ({gpu_vram} MB)", file=sys.stderr)

    gpu_vram_mb = gpu_vram or (detected_gpu["vramMb"] if detected_gpu else 0)

    # Resolution
    profile_info = None
    computed_context = None

    if "profile" in config:
        # Profile shorthand — load preset
        profile_id = config["profile"]
        if profile_id not in profiles:
            print(f"ERROR: unknown profile '{profile_id}'", file=sys.stderr)
            print(f"Available: {', '.join(profiles.keys())}", file=sys.stderr)
            sys.exit(1)
        profile = profiles[profile_id]
        services, vram_total = build_from_profile(profile, models, engines)
        profile_info = {"id": profile["id"], "name": profile["name"], "source": "preset"}
        print(f"Using preset: {profile['name']}", file=sys.stderr)

    elif any(k in config for k in ("llm", "audio", "image")):
        # Model-based — user picks what to run
        services, vram_total, computed_context = build_from_models(config, models, engines, gpu_vram_mb)
        roles = [s["role"] for s in services]
        profile_info = {"id": "custom", "name": f"Custom ({' + '.join(roles)})", "source": "models"}
        print(f"Model-based config: {', '.join(roles)}", file=sys.stderr)

    else:
        # Auto — default to LLM only (slim). Users opt-in to audio/image explicitly.
        print("No config specified, defaulting to LLM only.", file=sys.stderr)
        auto_config = {"llm": True}

        services, vram_total, computed_context = build_from_models(auto_config, models, engines, gpu_vram_mb)
        roles = [s["role"] for s in services]
        profile_info = {"id": "auto", "name": f"Auto ({' + '.join(roles)})", "source": "auto"}
        print(f"Auto-selected: {', '.join(roles)}", file=sys.stderr)

    # VRAM summary
    if gpu_vram_mb > 0:
        free = gpu_vram_mb - vram_total
        if vram_total > gpu_vram_mb:
            print(f"WARNING: needs ~{vram_total} MB VRAM but GPU has {gpu_vram_mb} MB", file=sys.stderr)
        else:
            print(f"VRAM: ~{vram_total} MB / {gpu_vram_mb} MB (~{free} MB free)", file=sys.stderr)

    # Determine web proxy
    has_multiple = len(services) > 1
    web_proxy = has_multiple

    output = {
        "profile": {
            **profile_info,
            "webProxy": web_proxy,
            "vramTotal": vram_total,
        },
        "gpu": detected_gpu,
        "gpuDetected": {"name": gpu_name, "vramMb": gpu_vram},
        "services": services,
    }

    if computed_context is not None:
        output["computedContextLength"] = computed_context

    json.dump(output, sys.stdout, indent=2)
    print("", file=sys.stdout)


if __name__ == "__main__":
    main()
