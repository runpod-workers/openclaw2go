#!/usr/bin/env python3
"""
vram-budget.py - VRAM budget calculator for agent2go.

Computes whether a set of models fits on a GPU, recommends max context length.
Used by resolve-profile.py and as a standalone CLI tool.

Usage:
  vram-budget.py --gpu rtx-5090 --models "unsloth/GLM-4.7-Flash-GGUF,liquidai/lfm25-audio"
  vram-budget.py --gpu rtx-5090 --profile rtx5090-full-stack
  vram-budget.py --vram 32768 --models "unsloth/glm47-flash-gguf"

Model names are case-insensitive. You can use HuggingFace repo names or short model IDs.
"""

import argparse
import json
import os
import sys
from pathlib import Path

REGISTRY_DIR = Path(os.environ.get("A2GO_REGISTRY_DIR", "/opt/a2go/registry"))

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


def find_model(value, models):
    """Find a model by ID or HuggingFace repo name (case-insensitive)."""
    if value in models:
        return value, models[value]
    value_lower = value.lower()
    for model_id, model in models.items():
        if model_id.lower() == value_lower:
            return model_id, model
    for model_id, model in models.items():
        repo = model.get("repo", "")
        if repo.lower() == value_lower:
            return model_id, model
    return None, None


def compute_budget(vram_mb, model_ids, models, context_length=None):
    """Compute VRAM budget for a set of models."""
    items = []
    total_used = 0

    for model_id in model_ids:
        if model_id not in models:
            print(f"WARNING: unknown model '{model_id}', skipping", file=sys.stderr)
            continue
        model = models[model_id]
        vram = model["vram"]
        model_mb = vram["model"]
        overhead_mb = vram["overhead"]
        item_total = model_mb + overhead_mb

        item = {
            "model": model_id,
            "name": model["name"],
            "type": model["type"],
            "modelMb": model_mb,
            "overheadMb": overhead_mb,
            "totalMb": item_total,
        }

        # For LLM models, compute KV cache (skip for vLLM — it auto-manages)
        if model["type"] == "llm":
            if model.get("engine") == "vllm":
                item["kvManaged"] = "vllm-auto"
                if context_length:
                    item["contextLength"] = context_length
            elif context_length:
                kv_rate = model.get("kvCacheMbPer1kTokens", KV_CACHE_MB_PER_1K_TOKENS)
                kv_cache_mb = int((context_length / 1000) * kv_rate)
                item["kvCacheMb"] = kv_cache_mb
                item["contextLength"] = context_length
                item_total += kv_cache_mb
                item["totalMb"] = item_total

        items.append(item)
        total_used += item_total

    free = vram_mb - total_used
    fits = free >= 0

    # Compute max context length that would fit
    llm_models = [m for m in model_ids if m in models and models[m]["type"] == "llm"]
    max_context = None
    if llm_models:
        llm_model = models[llm_models[0]]
        if llm_model.get("engine") == "vllm":
            # vLLM auto-manages KV cache — report model default
            max_context = llm_model.get("defaults", {}).get("contextLength", 65536)
        else:
            non_llm_vram = sum(i["totalMb"] for i in items if i["type"] != "llm")
            llm_base_vram = sum(
                models[m]["vram"]["model"] + models[m]["vram"]["overhead"]
                for m in llm_models
            )
            available_for_kv = vram_mb - non_llm_vram - llm_base_vram
            # Use the first LLM model's KV rate (typically only one LLM)
            llm_kv_rate = llm_model.get("kvCacheMbPer1kTokens", KV_CACHE_MB_PER_1K_TOKENS)
            if available_for_kv > 0 and llm_kv_rate > 0:
                max_context = int((available_for_kv / llm_kv_rate) * 1000)

    return {
        "vramTotalMb": vram_mb,
        "vramUsedMb": total_used,
        "vramFreeMb": free,
        "fits": fits,
        "maxContextLength": max_context,
        "items": items,
    }


def main():
    parser = argparse.ArgumentParser(description="VRAM budget calculator")
    parser.add_argument("--gpu", help="GPU ID from registry (e.g., rtx-5090)")
    parser.add_argument("--vram", type=int, help="VRAM in MB (alternative to --gpu)")
    parser.add_argument("--models", help="Comma-separated model IDs")
    parser.add_argument("--profile", help="Profile ID (alternative to --models)")
    parser.add_argument("--context", type=int, help="Context length for LLM models")
    parser.add_argument("--registry", help="Registry directory path")
    args = parser.parse_args()

    registry_dir = Path(args.registry) if args.registry else REGISTRY_DIR
    models = load_all_json(registry_dir / "models")
    gpus = load_all_json(registry_dir / "gpus")
    profiles = load_all_json(registry_dir / "profiles")

    # Resolve VRAM
    vram_mb = args.vram
    if args.gpu:
        if args.gpu not in gpus:
            print(f"ERROR: unknown GPU '{args.gpu}'", file=sys.stderr)
            print(f"Available: {', '.join(gpus.keys())}", file=sys.stderr)
            sys.exit(1)
        vram_mb = gpus[args.gpu]["vramMb"]

    if not vram_mb:
        print("ERROR: specify --gpu or --vram", file=sys.stderr)
        sys.exit(1)

    # Resolve model list
    model_ids = []
    context_length = args.context
    if args.profile:
        if args.profile not in profiles:
            print(f"ERROR: unknown profile '{args.profile}'", file=sys.stderr)
            sys.exit(1)
        profile = profiles[args.profile]
        for svc in profile["services"]:
            model_ids.append(svc["model"])
            if not context_length and svc.get("overrides", {}).get("contextLength"):
                context_length = svc["overrides"]["contextLength"]
    elif args.models:
        raw_ids = [m.strip() for m in args.models.split(",") if m.strip()]
        model_ids = []
        for raw_id in raw_ids:
            resolved_id, _ = find_model(raw_id, models)
            if resolved_id:
                model_ids.append(resolved_id)
            else:
                print(f"WARNING: unknown model '{raw_id}', skipping", file=sys.stderr)
    else:
        print("ERROR: specify --models or --profile", file=sys.stderr)
        sys.exit(1)

    budget = compute_budget(vram_mb, model_ids, models, context_length)

    # Print human-readable summary to stderr
    print(f"\nVRAM Budget for {vram_mb} MB GPU:", file=sys.stderr)
    print(f"{'─' * 60}", file=sys.stderr)
    for item in budget["items"]:
        ctx_info = ""
        if item.get("kvManaged") == "vllm-auto":
            ctx_len = item.get("contextLength", "auto")
            ctx_info = f" (ctx: {ctx_len:,} → KV: vLLM auto)" if isinstance(ctx_len, int) else " (KV: vLLM auto)"
        elif "contextLength" in item:
            ctx_info = f" (ctx: {item['contextLength']:,} → KV: {item['kvCacheMb']} MB)"
        print(
            f"  {item['name']:40s}  {item['totalMb']:>6,} MB{ctx_info}",
            file=sys.stderr,
        )
    print(f"{'─' * 60}", file=sys.stderr)
    print(f"  {'Total':40s}  {budget['vramUsedMb']:>6,} MB", file=sys.stderr)
    print(f"  {'Free':40s}  {budget['vramFreeMb']:>6,} MB", file=sys.stderr)
    status = "FITS" if budget["fits"] else "DOES NOT FIT"
    print(f"  Status: {status}", file=sys.stderr)
    if budget["maxContextLength"] is not None:
        print(f"  Max context length: {budget['maxContextLength']:,} tokens", file=sys.stderr)
    print(file=sys.stderr)

    # Print JSON to stdout
    json.dump(budget, sys.stdout, indent=2)
    print("", file=sys.stdout)


if __name__ == "__main__":
    main()
