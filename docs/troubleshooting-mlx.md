# MLX Troubleshooting

Common issues when running models locally on Apple Silicon with MLX.

## ModuleNotFoundError: No module named 'mlx_lm.models.qwen3_5'

**Cause:** Python 3.9 installs an older version of `mlx-lm` (≤0.29.1) that lacks support for newer model architectures like Qwen 3.5.

**Fix:** Upgrade to Python 3.10 or newer, then recreate your venv:

```bash
# check your version
python3 --version

# if < 3.10, install a newer python (e.g. via homebrew)
brew install python@3.12

# recreate venv with the new python
rm -rf ~/.a2go/venv
python3.12 -m venv ~/.a2go/venv
source ~/.a2go/venv/bin/activate
pip install mlx-lm
```

**Why:** `mlx-lm` requires Python 3.10+ to ship builds that include newer model architectures. On 3.9, pip resolves to an older `mlx-lm` that predates support for models like Qwen 3.5, LFM 2.5, etc.

**Related:** [#12](https://github.com/runpod-labs/a2go/issues/12)

## Model download succeeds but server fails to start

**Cause:** Insufficient unified memory for the model + KV cache at the requested context length.

**Fix:** Choose a smaller quant or reduce context length in the configurator before copying the MLX command.

## mlx-audio / mflux import errors

**Cause:** These packages have their own Python version and dependency requirements.

**Fix:** Ensure you're on Python 3.10+ and install each engine separately:

```bash
pip install mlx-audio
pip install mflux
```
