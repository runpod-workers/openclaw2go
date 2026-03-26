# Contributing Models to agent2go

## Overview

The agent2go model registry is an open collection of model configurations for running AI models on GPU pods. Community contributions help expand the model catalog for everyone.

## How to Contribute

### Option 1: GitHub Issue (Easiest)

1. Run your model on an agent2go pod
2. Export your config: `a2go registry export --format issue`
3. Open a [New Model Issue](../../issues/new?template=new-model.yml)
4. Paste the exported config and test evidence
5. A maintainer will review and merge your contribution

### Option 2: Direct Pull Request

1. Fork this repository
2. Create a new JSON file in `registry/models/` (use an existing file as reference)
3. Run validation: `cd site && npm run validate`
4. Submit a Pull Request

CI will automatically validate your JSON and check that the HuggingFace repo exists.

## Model Config Reference

Each model is a JSON file in `registry/models/` with these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique ID in `provider/name` format (lowercase) |
| `name` | Yes | Human-readable model name |
| `type` | Yes | `llm`, `audio`, or `image` |
| `engine` | Yes | `a2go-llamacpp`, `llamacpp`, `llamacpp-audio`, `image-gen`, `mlx-lm`, `mlx-audio`, `mflux`, or `vllm` |
| `repo` | Yes | HuggingFace repository name |
| `files` | Yes | Array of files to download from the repo |
| `downloadDir` | Yes | Must start with `/workspace/models/` |
| `servedAs` | Yes (LLM) | Model name exposed via API |
| `vram` | Yes | Object with `model` (MB) and `overhead` (MB) fields |
| `kvCacheMbPer1kTokens` | Recommended | KV cache VRAM per 1k tokens (with q8_0) |
| `defaults` | Recommended | Default `contextLength` and `port` |
| `startDefaults` | Optional | Default values like `gpuLayers`, `parallel` |
| `extraStartArgs` | Optional | Additional CLI args for the engine |
| `provider` | Yes (LLM) | Provider config with `name` and `api` |
| `default` | Yes | Whether this is the default for its type (usually `false`) |
| `status` | Yes | `stable`, `experimental`, or `deprecated` |
| `verifiedOn` | Optional | Array of GPU IDs verified on |
| `verifiedContext` | Optional | Context length (tokens) used during TPS benchmarking |

## VRAM Estimation

VRAM values should be measured, not guessed:

1. Start the model on a pod
2. Run `nvidia-smi` and note VRAM usage
3. Set `vram.model` to the model weight VRAM (approximate)
4. Set `vram.overhead` to the remaining VRAM minus KV cache

### KV Cache Rate

For LLM models, measure `kvCacheMbPer1kTokens`:

1. Run model with a known context length (e.g., 150k)
2. Note total VRAM used
3. Calculate: `(total_vram - model_vram - overhead) / (context_length / 1000)`

This value should reflect q8_0 KV quantization (the entrypoint uses `-ctk q8_0 -ctv q8_0`).

## Validation

Before submitting, validate your config:

```bash
cd site
npm run validate
npm run validate:hf  # Also verify HF repos exist
```

## Security Requirements

- `downloadDir` must start with `/workspace/models/` (path restriction)
- `engine` must be one of the known engines (engine whitelist)
- `extraStartArgs` are passed as CLI args to known binaries only (no code execution)
- All merges require maintainer review
