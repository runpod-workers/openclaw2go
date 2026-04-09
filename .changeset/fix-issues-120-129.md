---
"a2go": minor
---

fix: resolve 9 issues (#120-#129) improving MLX stability, agent config, and UX

- #120: use Python 3.11 for MLX venv (avoids 3.14 semaphore crash)
- #121: skip hermes setup wizard in non-interactive shells (CI/Docker/AI assistants)
- #122: update deprecated `python -m mlx_lm.server` to `python -m mlx_lm server`
- #123: pre-download models before starting MLX server (avoids semaphore leak crash)
- #125: print 'hermes chat' hint in ready output
- #126: non-blocking update check on `a2go run` (cached 24h, skippable)
- #127: pass context length from model catalog to agent config (was hardcoded 32768)
- #128: symlink a2go skills into hermes skills directory on run
- #129: pass max output tokens from catalog to hermes/openclaw config (was hardcoded 8192)
