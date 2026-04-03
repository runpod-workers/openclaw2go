#!/usr/bin/env python3
"""
resolve-profile.py - Resolve agent2go configuration to a runnable service set.

Reads A2GO_CONFIG env var (JSON), resolves against registry files,
detects GPU via nvidia-smi, validates VRAM budget, auto-computes optimal
context length, and outputs resolved config JSON to stdout.

Config format (A2GO_CONFIG env var):

  Model-based (primary approach — each role takes a string model slug):
    {"llm": "unsloth/glm47-flash-gguf", "audio": "liquidai/lfm25-audio", "image": "disty0/flux2-klein-sdnq"}
    {"llm": "unsloth/GLM-4.7-Flash-GGUF", "audio": "liquidai/lfm25-audio"}
    {"llm": "unsloth/glm47-flash-gguf"}
    {"llm": "unsloth/glm47-flash-gguf", "contextLength": 200000}
    {"vision": "unsloth/Qwen2.5-VL-7B-Instruct-GGUF"}
    {"llm": "unsloth/glm47-flash-gguf", "embedding": "jinaai/jina-reranker-v3-gguf"}
    {"llm": "unsloth/glm47-flash-gguf", "tts": "qwen/qwen3-tts-06b"}

  Model names are case-insensitive. You can use the HuggingFace repo name
  (e.g., "unsloth/GLM-4.7-Flash-GGUF") or the short model ID
  (e.g., "unsloth/glm47-flash-gguf").

  When a HuggingFace repo contains multiple quantizations, append ":Nbit" to disambiguate:
    {"llm": "unsloth/Qwen3.5-122B-A10B-GGUF:4bit"}

  Profile shorthand (optional presets):
    {"profile": "rtx5090-full-stack"}                 — load a pre-defined preset

  Auto (empty or missing):
    {}                                                — detect GPU, use all defaults
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

REGISTRY_DIR = Path(os.environ.get("A2GO_REGISTRY_DIR", "/opt/a2go/registry"))

# Approximate KV cache VRAM per 1k context tokens for GLM-4.7 with q8_0 quantization
# Based on observed: ~10GB for 150k context, ~14GB for 200k context
KV_CACHE_MB_PER_1K_TOKENS = 40

# All supported task roles and their default ports
ROLE_PORTS = {
    "llm": 8000,
    "audio": 8001,
    "image": 8002,
    "vision": 8003,
    "embedding": 8004,
    "reranking": 8005,
    "tts": 8006,
}

# Roles that support A2GO_CONFIG keys
CONFIG_ROLES = ("llm", "audio", "image", "vision", "embedding", "reranking", "tts")


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
    """Detect GPU name and VRAM via nvidia-smi.

    Supports GPU_VRAM_OVERRIDE env var (in MB) for testing without a real GPU.
    """
    override = os.environ.get("GPU_VRAM_OVERRIDE", "").strip()
    if override:
        try:
            vram_mb = int(override)
            print(f"GPU_VRAM_OVERRIDE: using {vram_mb} MB", file=sys.stderr)
            return "Override GPU", vram_mb
        except ValueError:
            pass

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
    """Get the default model for a given type (llm/audio/image/vision/embedding/reranking/tts)."""
    for model_id, model in models.items():
        if model.get("type") == model_type and model.get("default"):
            return model
    # Fallback: first stable model of this type
    for model_id, model in models.items():
        if model.get("type") == model_type and model.get("status") == "stable":
            return model
    return None


def get_best_model_for_vram(models, model_type, gpu_vram_mb):
    """Select the best model for the given type that fits in available VRAM.

    For LLM models: picks the highest autoTier model whose base VRAM fits,
    leaving at least enough room for 16k context (minimum).
    For non-LLM models: same as get_default_model() (unchanged).
    """
    if model_type != "llm" or gpu_vram_mb <= 0:
        return get_default_model(models, model_type)

    # Filter to models with autoTier
    candidates = []
    for model_id, model in models.items():
        if (model.get("type") == model_type
                and "autoTier" in model):
            kv_rate = model.get("kvCacheMbPer1kTokens", KV_CACHE_MB_PER_1K_TOKENS)
            min_kv_cache = 16 * kv_rate  # 16k minimum context
            base_vram = model["vram"]["model"] + model["vram"]["overhead"]
            total_needed = base_vram + min_kv_cache
            if total_needed <= gpu_vram_mb:
                candidates.append(model)

    if not candidates:
        return get_default_model(models, model_type)

    # Sort by autoTier descending — highest tier first
    candidates.sort(key=lambda m: m["autoTier"], reverse=True)
    return candidates[0]


def find_model(value, models, bits=None):
    """Find a model by ID or HuggingFace repo name (case-insensitive).

    When bits is provided and matching by repo, filters candidates to those
    with the matching bit size. This disambiguates repos that contain multiple
    quantizations (e.g. 2-bit and 4-bit variants of the same model).
    """
    # Exact match first (by ID)
    if value in models:
        return models[value]
    # Case-insensitive match on ID
    value_lower = value.lower()
    for model_id, model in models.items():
        if model_id.lower() == value_lower:
            return model
    # Case-insensitive match on HuggingFace repo name
    repo_matches = []
    for model_id, model in models.items():
        repo = model.get("repo", "")
        if repo.lower() == value_lower:
            repo_matches.append(model)
    if repo_matches:
        if bits is not None:
            filtered = [m for m in repo_matches if m.get("bits") == bits]
            if len(filtered) == 1:
                return filtered[0]
            # bits didn't match any candidate — return None so caller can show error
            if not filtered:
                return None
        return repo_matches[0]
    # 4. Case-insensitive match on repo name without org prefix
    partial_matches = []
    for model_id, model in models.items():
        repo = model.get("repo", "")
        if "/" in repo:
            repo_name = repo.split("/", 1)[1]
            if repo_name.lower() == value_lower:
                partial_matches.append(model)
    if partial_matches:
        if bits is not None:
            filtered = [m for m in partial_matches if m.get("bits") == bits]
            if len(filtered) == 1:
                return filtered[0]
            if not filtered:
                return None
        return partial_matches[0]
    return None


def resolve_model(value, models, model_type):
    """Resolve a config value to a model.

    Value is a string with optional ':Nbit' suffix.
    Examples: "unsloth/Qwen3.5-122B-A10B-GGUF:4bit", "unsloth/glm47-flash-gguf"
    """
    if not isinstance(value, str):
        return None
    m = re.match(r'^(.+):(\d+)bit$', value)
    if m:
        model_name, bits = m.group(1), int(m.group(2))
    else:
        model_name, bits = value, None
    if not model_name:
        return None
    model = find_model(model_name, models, bits=bits)
    if not model:
        available = [f"{m} ({d.get('repo', '')})" for m, d in models.items() if d.get("type") == model_type]
        if bits is not None:
            # Show available bit sizes for the repo to help user pick the right one
            name_lower = model_name.lower()
            repo_bits = [str(d.get("bits", "?")) for m, d in models.items()
                         if d.get("repo", "").lower() == name_lower
                         or ("/" in d.get("repo", "") and d["repo"].split("/", 1)[1].lower() == name_lower)]
            if repo_bits:
                print(f"ERROR: no {bits}-bit variant found for '{model_name}' "
                      f"(available bit sizes: {', '.join(repo_bits)})", file=sys.stderr)
                print(f"Available {model_type} models: {', '.join(available)}", file=sys.stderr)
                sys.exit(1)
        # Unknown model — warn and create synthetic fallback entry
        print(f"WARNING: unknown model '{model_name}' for type '{model_type}', "
              f"using as-is with conservative defaults", file=sys.stderr)
        print(f"Available {model_type} models: {', '.join(available)}", file=sys.stderr)
        model = {
            "id": model_name,
            "type": model_type,
            "repo": model_name,
            "engine": "a2go-llamacpp",
            "vram": {"model": 20000, "overhead": 2000},
            "defaults": {"contextLength": 32768},
            "files": [],
            "_synthetic": True,
        }
    return model


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

    selected_models = {}

    # Resolve which models to use for each role
    for role in CONFIG_ROLES:
        value = config.get(role)
        if value is None or value is False:
            continue
        model = resolve_model(value, models, role)
        if model:
            selected_models[role] = model

    # Vision can act as LLM replacement: if "vision" is specified without "llm",
    # the vision model serves as the primary LLM (multimodal) on port 8000
    if "vision" in selected_models and "llm" not in selected_models:
        # Vision model replaces LLM — use LLM port
        selected_models["llm"] = selected_models.pop("vision")
        selected_models["llm"]["_vision_as_llm"] = True

    if not selected_models:
        print("ERROR: no models selected. Specify at least one of: " + ", ".join(CONFIG_ROLES), file=sys.stderr)
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
    for role in CONFIG_ROLES:
        model = selected_models.get(role)
        if not model:
            continue

        engine_id = model["engine"]
        engine = engines.get(engine_id)
        if not engine:
            print(f"ERROR: model '{model['id']}' references unknown engine '{engine_id}'", file=sys.stderr)
            print(f"Available engines: {', '.join(engines.keys())}", file=sys.stderr)
            sys.exit(1)
        port = ROLE_PORTS[role]
        overrides = {}

        model_vram = model["vram"]["model"] + model["vram"]["overhead"]

        if role == "llm":
            ctx = context_length or model.get("defaults", {}).get("contextLength", 150000)
            overrides["contextLength"] = ctx

            kv_vram = compute_kv_cache_vram(ctx, model)
            model_vram += kv_vram

            # Get gpuLayers from config or model defaults
            gpu_layers = config.get("gpuLayers", model.get("startDefaults", {}).get("gpuLayers", "999"))
            overrides["gpuLayers"] = str(gpu_layers)

            # Pass vision-as-LLM flag so entrypoint knows to add --mmproj
            if model.get("_vision_as_llm"):
                overrides["visionAsLlm"] = True

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


VALID_AGENTS = ("openclaw", "hermes")


def main():
    raw_config = os.environ.get("A2GO_CONFIG", "").strip()
    if raw_config:
        try:
            config = json.loads(raw_config)
        except json.JSONDecodeError as e:
            print(f"ERROR: invalid A2GO_CONFIG JSON: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        config = {}

    # Resolve agent
    if config:
        agent = config.get("agent")
        if not agent:
            print("ERROR: 'agent' field is required in A2GO_CONFIG. "
                  f"Valid agents: {', '.join(VALID_AGENTS)}", file=sys.stderr)
            sys.exit(1)
    else:
        # Empty config (auto-detect mode) — fall back to openclaw
        agent = "openclaw"

    if agent not in VALID_AGENTS:
        print(f"ERROR: invalid agent '{agent}'. "
              f"Valid agents: {', '.join(VALID_AGENTS)}", file=sys.stderr)
        sys.exit(1)

    print(f"Agent: {agent}", file=sys.stderr)

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

    elif any(k in config for k in CONFIG_ROLES):
        # Model-based — user picks what to run
        services, vram_total, computed_context = build_from_models(config, models, engines, gpu_vram_mb)
        roles = [s["role"] for s in services]
        profile_info = {"id": "custom", "name": f"Custom ({' + '.join(roles)})", "source": "models"}
        print(f"Model-based config: {', '.join(roles)}", file=sys.stderr)

    else:
        # Auto — default to LLM only (slim). Users opt-in to audio/image explicitly.
        # VRAM-aware: pick the best LLM that fits the detected GPU.
        print("No config specified, auto-detecting best LLM for GPU.", file=sys.stderr)
        best_llm = get_best_model_for_vram(models, "llm", gpu_vram_mb)
        if not best_llm:
            print("ERROR: no suitable LLM model found", file=sys.stderr)
            sys.exit(1)
        auto_config = {"llm": best_llm["id"]}
        print(f"Auto-selected LLM: {best_llm['id']} (tier {best_llm.get('autoTier', '?')}, "
              f"{best_llm['vram']['model'] + best_llm['vram']['overhead']}MB base, "
              f"GPU has {gpu_vram_mb}MB)", file=sys.stderr)

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
    web_proxy = True

    output = {
        "agent": agent,
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
